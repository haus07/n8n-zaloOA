import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INode,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const ZALO_API_BASE = 'https://openapi.zalo.me';
export const ZALO_ZBS_API_BASE = 'https://business.openapi.zalo.me';
export const ZALO_TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';

/**
 * Mã lỗi Zalo chỉ ra token hết hạn hoặc không hợp lệ.
 * Khi gặp các mã này, node sẽ tự động làm mới token và thử lại.
 */
export const TOKEN_EXPIRED_ERROR_CODES = new Set<number | string>([
	-124, // Token hết hạn
	3, // Token không hợp lệ
	-216, // Vượt giới hạn hoặc rate limited
	-220, // Token không hợp lệ cho OA này
	'-124',
	'3',
	'-216',
	'-220',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface ZaloCredentials {
	credentialName: string;
	appId: string;
	secretKey: string;
	oaSecretKey?: string;
	accessToken: string;
	refreshToken: string;
	n8nInstanceUrl?: string;
	n8nApiKey?: string;
	credentialId?: string;
	allowedHttpRequestDomains?: 'all' | 'domains' | 'none';
	allowedDomains?: string;
}

export interface ZaloTokenResponse {
	access_token?: string;
	refresh_token?: string;
	error?: number | string;
	message?: string;
}

export interface ZaloApiResponse extends IDataObject {
	error?: number | string;
	message?: string;
	data?: IDataObject;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping Mã Lỗi Zalo → Thông Báo Tiếng Việt
// ─────────────────────────────────────────────────────────────────────────────

const ZALO_ERROR_MESSAGES: Record<number | string, string> = {
	'-1': 'Yêu cầu không hợp lệ (Invalid request)',
	'-2': 'Access token không hợp lệ (Access token invalid)',
	'3': 'Token không hợp lệ hoặc hết hạn (Token invalid or expired)',
	'-124': 'Token hết hạn – đang tự động làm mới (Token expired – auto-refreshing)',
	'-200': 'Phương thức không được phép (Method not allowed)',
	'-216': 'Vượt giới hạn hoặc bị rate limit – vui lòng chờ và thử lại (Out of quota / rate limited)',
	'-220': 'Token không hợp lệ cho tài khoản OA này (Token not valid for this OA)',
	'-3': 'Lỗi server Zalo (Zalo server error)',
	'-4': 'Dịch vụ Zalo không khả dụng (Zalo service unavailable)',
	'-5': 'Số điện thoại không hợp lệ hoặc không sử dụng Zalo (Invalid phone number or not a Zalo user)',
	'-6': 'Không tìm thấy template (Template not found)',
	'-7': 'Dữ liệu template không hợp lệ (Template data invalid)',
	'-8': 'Thiếu trường bắt buộc (Missing required fields)',
	'-10': 'Hành động bị từ chối (Action denied)',
	'-201': 'Người dùng không quan tâm OA hoặc ngoài cửa sổ 7 ngày (User not following OA or outside 7-day window)',
};

/**
 * Lấy thông báo lỗi tiếng Việt từ mã lỗi Zalo.
 */
function getZaloErrorMessage(errorCode: number | string): string {
	return ZALO_ERROR_MESSAGES[String(errorCode)] ?? `Lỗi Zalo API: ${errorCode}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gọi endpoint token Zalo để làm mới access token từ refresh token.
 * Throw NodeApiError nếu server không trả về access_token mới.
 */
export async function zaloRefreshAccessToken(
	ctx: IExecuteFunctions,
	credentials: ZaloCredentials,
): Promise<ZaloTokenResponse> {
	const body = new URLSearchParams();
	body.append('app_id', credentials.appId);
	body.append('refresh_token', credentials.refreshToken);
	body.append('grant_type', 'refresh_token');

	const options: IHttpRequestOptions = {
		method: 'POST',
		url: ZALO_TOKEN_URL,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			secret_key: credentials.secretKey,
		},
		body,
		json: true,
	};

	try {
		const response = (await ctx.helpers.httpRequest(options)) as ZaloTokenResponse;

		if (!response.access_token) {
			const errorMsg = response.message ?? JSON.stringify(response);
			throw new Error(`Không thể làm mới token: ${errorMsg}`);
		}

		return response;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		throw new NodeApiError(ctx.getNode(), {
			message:
				`[Zalo Token Refresh] Không thể làm mới access token: ${errorMsg}. ` +
				'Kiểm tra App ID, Secret Key, và Refresh Token trong cài đặt credential.',
		});
	}
}

/**
 * Ghi access_token & refresh_token mới vào n8n credential qua REST API.
 * Hàm này non-blocking: nếu thất bại chỉ log cảnh báo, không crash workflow.
 */
export async function persistTokensToCredential(
	ctx: IExecuteFunctions,
	credentials: ZaloCredentials,
	newAccessToken: string,
	newRefreshToken: string,
): Promise<boolean> {
	const { n8nInstanceUrl, n8nApiKey, credentialId } = credentials;

	if (!n8nInstanceUrl || !n8nApiKey || !credentialId) {
		ctx.logger.debug(
			'[Zalo] Token đã cập nhật trong bộ nhớ nhưng chưa lưu vào credential ' +
				'(thiếu n8nInstanceUrl / n8nApiKey / credentialId). ' +
				'Điền 3 trường này trong credential để bật lưu trữ tự động.',
		);
		return false;
	}

	const baseUrl = n8nInstanceUrl.replace(/\/$/, '');

	try {
		const dataPayload: Record<string, unknown> = {
			credentialName: credentials.credentialName,
			appId: credentials.appId,
			secretKey: credentials.secretKey,
			oaSecretKey: credentials.oaSecretKey ?? '',
			accessToken: newAccessToken,
			refreshToken: newRefreshToken,
			n8nInstanceUrl: n8nInstanceUrl ?? '',
			n8nApiKey: n8nApiKey ?? '',
			credentialId: credentialId ?? '',
			allowedHttpRequestDomains: credentials.allowedHttpRequestDomains ?? 'all',
		};

		if (credentials.allowedHttpRequestDomains === 'domains' && credentials.allowedDomains) {
			dataPayload.allowedDomains = credentials.allowedDomains;
		}

		const options: IHttpRequestOptions = {
			method: 'PATCH',
			url: `${baseUrl}/api/v1/credentials/${credentialId}`,
			headers: {
				'X-N8N-API-KEY': n8nApiKey,
				'Content-Type': 'application/json',
			},
			body: {
				name: credentials.credentialName,
				type: 'zaloOaApi',
				data: dataPayload,
			},
			json: true,
			timeout: 10000,
		};

		await ctx.helpers.httpRequest(options);
		ctx.logger.info('[Zalo] Tokens mới đã được lưu vào credential n8n thành công.');
		return true;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		ctx.logger.warn(
			`[Zalo] Không thể lưu tokens vào credential: ${errorMsg}. ` +
				'Token được cập nhật trong bộ nhớ cho lần chạy này nhưng sẽ không lưu trữ lâu dài.',
		);
		return false;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Main API Request Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handler chính cho tất cả Zalo API request, có tự động làm mới token khi hết hạn.
 *
 * Logic:
 * 1. Gọi API với access_token hiện tại.
 * 2. Nếu response.error thuộc TOKEN_EXPIRED_ERROR_CODES → làm mới token → thử lại 1 lần.
 * 3. Nếu lỗi khác → throw NodeApiError ngay.
 * 4. Nếu thành công → trả về response.
 *
 * @param ctx          - Ngữ cảnh thực thi n8n
 * @param method       - Phương thức HTTP
 * @param baseUrl      - URL gốc API (ZALO_API_BASE hoặc ZALO_ZBS_API_BASE)
 * @param endpoint     - Đường dẫn endpoint
 * @param payload      - Request body hoặc query params
 * @param credentials  - Credentials Zalo (sẽ bị thay đổi nếu token được làm mới)
 * @param node         - Tham chiếu node để báo lỗi
 * @returns Parsed API response
 */
export async function zaloApiRequest(
	ctx: IExecuteFunctions,
	method: 'GET' | 'POST' | 'PUT' | 'DELETE',
	baseUrl: string,
	endpoint: string,
	payload: IDataObject,
	credentials: ZaloCredentials,
	node: INode,
): Promise<ZaloApiResponse> {
	let currentAccessToken = credentials.accessToken;
	let retryCount = 0;
	const maxRetries = 1;

	while (retryCount <= maxRetries) {
		let response: ZaloApiResponse;

		try {
			const options: IHttpRequestOptions = {
				method,
				url: `${baseUrl}${endpoint}`,
				headers: {
					access_token: currentAccessToken,
					'Content-Type': 'application/json',
				},
				json: true,
			};

			if (method === 'POST' || method === 'PUT') {
				options.body = payload;
			} else {
				options.qs = payload;
			}

			response = (await ctx.helpers.httpRequest(options)) as ZaloApiResponse;
		} catch (error) {
			if (error instanceof NodeApiError || error instanceof NodeOperationError) {
				throw error;
			}
				const errorMsg = error instanceof Error ? error.message : String(error);
			throw new NodeApiError(node, {
				message:
					`[Zalo] Yêu cầu HTTP thất bại: ${errorMsg}. ` +
					'Kiểm tra kết nối internet và xác minh endpoint Zalo API.',
			});
		}

		// Zalo trả về HTTP 200 kể cả khi có lỗi — phải kiểm tra body
		if (response.error && response.error !== 0) {
			const errorCode = response.error;
			const errorMessage = getZaloErrorMessage(errorCode);

			if (TOKEN_EXPIRED_ERROR_CODES.has(errorCode)) {
				if (retryCount < maxRetries) {
					ctx.logger.info(
						`[Zalo] Access token hết hạn (error: ${errorCode}). Đang tự động làm mới...`,
					);

					try {
						const newTokens = await zaloRefreshAccessToken(ctx, credentials);

						// Cập nhật credentials trong bộ nhớ
						credentials.accessToken = newTokens.access_token ?? '';
						credentials.refreshToken = newTokens.refresh_token ?? '';
						currentAccessToken = newTokens.access_token ?? '';

						// Lưu vào n8n credential (non-blocking)
						void persistTokensToCredential(
							ctx,
							credentials,
							newTokens.access_token ?? '',
							newTokens.refresh_token ?? '',
						);

						retryCount++;
						ctx.logger.info('[Zalo] Token đã được làm mới. Đang thử lại API call...');
						continue;
					} catch (refreshError) {
						const refreshErrorMsg =
							refreshError instanceof Error ? refreshError.message : String(refreshError);
							throw new NodeApiError(node, {
								message:
									`[Zalo] Không thể làm mới token: ${refreshErrorMsg}. ` +
									'Vui lòng kiểm tra App ID, Secret Key, và Refresh Token trong credential.',
							});
						}
					} else {
						throw new NodeApiError(node, {
							message: `[Zalo] Access token hết hạn và đã vượt quá số lần thử lại tối đa. ${errorMessage}`,
						});
					}
				} else {
					// Lỗi nghiệp vụ khác — throw ngay
					throw new NodeApiError(node, {
						message:
							`${errorMessage}\n` +
							`Mã lỗi Zalo: ${errorCode}.` +
							(response.message ? ` Chi tiết: ${response.message}` : ''),
					});
				}
		}

		return response;
	}

	// Không bao giờ đến đây
	throw new NodeApiError(node, { message: '[Zalo] Lỗi nội bộ không mong đợi trong zaloApiRequest' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse templateData:
 * - Nếu là chuỗi JSON → parse thành object
 * - Nếu là array key/value (từ fixedCollection) → chuyển thành object
 * - Nếu là object → trả về nguyên
 */
export function formatZaloTemplateData(
	data: IDataObject | string | Array<{ key: string; value: string }>,
): IDataObject {
	if (typeof data === 'string') {
		try {
			return JSON.parse(data) as IDataObject;
		} catch {
			throw new Error(`Dữ liệu template không phải JSON hợp lệ. Nhận được: "${data}"`);
		}
	}

	if (Array.isArray(data)) {
		const result: IDataObject = {};
		for (const item of data) {
			if (item.key) {
				result[item.key] = item.value;
			}
		}
		return result;
	}

	return data;
}

/**
 * Chuẩn hoá số điện thoại về dạng quốc tế Việt Nam (84...).
 * Chấp nhận: 0912345678, 84912345678, +84912345678.
 * Trả về chuỗi đã chuẩn hoá (loại bỏ khoảng trắng, dấu gạch, dấu +).
 */
export function normalizePhoneNumber(phone: string): string {
	// Bỏ khoảng trắng, gạch ngang, ngoặc, dấu +
	let cleaned = phone.replace(/[\s\-().+]/g, '');

	if (cleaned.startsWith('0') && cleaned.length === 10) {
		// 0912345678 → 84912345678
		cleaned = '84' + cleaned.slice(1);
	}

	return cleaned;
}

/**
 * Kiểm tra định dạng số điện thoại Việt Nam.
 * Trả về true nếu hợp lệ.
 */
export function isValidVietnamesePhone(phone: string): boolean {
	const normalized = normalizePhoneNumber(phone);
	// 84 + 9 chữ số, bắt đầu bằng 84[1-9]
	return /^84[1-9]\d{8}$/.test(normalized);
}
