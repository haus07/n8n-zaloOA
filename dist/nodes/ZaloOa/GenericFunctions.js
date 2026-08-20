"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_EXPIRED_ERROR_CODES = exports.ZALO_TOKEN_URL = exports.ZALO_ZBS_API_BASE = exports.ZALO_API_BASE = void 0;
exports.zaloRefreshAccessToken = zaloRefreshAccessToken;
exports.persistTokensToCredential = persistTokensToCredential;
exports.zaloApiRequest = zaloApiRequest;
exports.formatZaloTemplateData = formatZaloTemplateData;
exports.normalizePhoneNumber = normalizePhoneNumber;
exports.isValidVietnamesePhone = isValidVietnamesePhone;
const n8n_workflow_1 = require("n8n-workflow");
exports.ZALO_API_BASE = 'https://openapi.zalo.me';
exports.ZALO_ZBS_API_BASE = 'https://business.openapi.zalo.me';
exports.ZALO_TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
exports.TOKEN_EXPIRED_ERROR_CODES = new Set([
    -124,
    3,
    -216,
    -220,
    '-124',
    '3',
    '-216',
    '-220',
]);
const ZALO_ERROR_MESSAGES = {
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
function getZaloErrorMessage(errorCode) {
    var _a;
    return (_a = ZALO_ERROR_MESSAGES[String(errorCode)]) !== null && _a !== void 0 ? _a : `Lỗi Zalo API: ${errorCode}`;
}
async function zaloRefreshAccessToken(ctx, credentials) {
    var _a;
    const body = new URLSearchParams();
    body.append('app_id', credentials.appId);
    body.append('refresh_token', credentials.refreshToken);
    body.append('grant_type', 'refresh_token');
    const options = {
        method: 'POST',
        url: exports.ZALO_TOKEN_URL,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: credentials.secretKey,
        },
        body,
        json: true,
    };
    try {
        const response = (await ctx.helpers.httpRequest(options));
        if (!response.access_token) {
            const errorMsg = (_a = response.message) !== null && _a !== void 0 ? _a : JSON.stringify(response);
            throw new Error(`Không thể làm mới token: ${errorMsg}`);
        }
        return response;
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new n8n_workflow_1.NodeApiError(ctx.getNode(), {
            message: `[Zalo Token Refresh] Không thể làm mới access token: ${errorMsg}. ` +
                'Kiểm tra App ID, Secret Key, và Refresh Token trong cài đặt credential.',
        });
    }
}
async function persistTokensToCredential(ctx, credentials, newAccessToken, newRefreshToken) {
    var _a, _b;
    const { n8nInstanceUrl, n8nApiKey, credentialId } = credentials;
    if (!n8nInstanceUrl || !n8nApiKey || !credentialId) {
        ctx.logger.debug('[Zalo] Token đã cập nhật trong bộ nhớ nhưng chưa lưu vào credential ' +
            '(thiếu n8nInstanceUrl / n8nApiKey / credentialId). ' +
            'Điền 3 trường này trong credential để bật lưu trữ tự động.');
        return false;
    }
    const baseUrl = n8nInstanceUrl.replace(/\/$/, '');
    try {
        const dataPayload = {
            credentialName: credentials.credentialName,
            appId: credentials.appId,
            secretKey: credentials.secretKey,
            oaSecretKey: (_a = credentials.oaSecretKey) !== null && _a !== void 0 ? _a : '',
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            n8nInstanceUrl: n8nInstanceUrl !== null && n8nInstanceUrl !== void 0 ? n8nInstanceUrl : '',
            n8nApiKey: n8nApiKey !== null && n8nApiKey !== void 0 ? n8nApiKey : '',
            credentialId: credentialId !== null && credentialId !== void 0 ? credentialId : '',
            allowedHttpRequestDomains: (_b = credentials.allowedHttpRequestDomains) !== null && _b !== void 0 ? _b : 'all',
        };
        if (credentials.allowedHttpRequestDomains === 'domains' && credentials.allowedDomains) {
            dataPayload.allowedDomains = credentials.allowedDomains;
        }
        const options = {
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
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.logger.warn(`[Zalo] Không thể lưu tokens vào credential: ${errorMsg}. ` +
            'Token được cập nhật trong bộ nhớ cho lần chạy này nhưng sẽ không lưu trữ lâu dài.');
        return false;
    }
}
async function zaloApiRequest(ctx, method, baseUrl, endpoint, payload, credentials, node) {
    var _a, _b, _c, _d, _e;
    let currentAccessToken = credentials.accessToken;
    let retryCount = 0;
    const maxRetries = 1;
    while (retryCount <= maxRetries) {
        let response;
        try {
            const options = {
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
            }
            else {
                options.qs = payload;
            }
            response = (await ctx.helpers.httpRequest(options));
        }
        catch (error) {
            if (error instanceof n8n_workflow_1.NodeApiError || error instanceof n8n_workflow_1.NodeOperationError) {
                throw error;
            }
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new n8n_workflow_1.NodeApiError(node, {
                message: `[Zalo] Yêu cầu HTTP thất bại: ${errorMsg}. ` +
                    'Kiểm tra kết nối internet và xác minh endpoint Zalo API.',
            });
        }
        if (response.error && response.error !== 0) {
            const errorCode = response.error;
            const errorMessage = getZaloErrorMessage(errorCode);
            if (exports.TOKEN_EXPIRED_ERROR_CODES.has(errorCode)) {
                if (retryCount < maxRetries) {
                    ctx.logger.info(`[Zalo] Access token hết hạn (error: ${errorCode}). Đang tự động làm mới...`);
                    try {
                        const newTokens = await zaloRefreshAccessToken(ctx, credentials);
                        credentials.accessToken = (_a = newTokens.access_token) !== null && _a !== void 0 ? _a : '';
                        credentials.refreshToken = (_b = newTokens.refresh_token) !== null && _b !== void 0 ? _b : '';
                        currentAccessToken = (_c = newTokens.access_token) !== null && _c !== void 0 ? _c : '';
                        void persistTokensToCredential(ctx, credentials, (_d = newTokens.access_token) !== null && _d !== void 0 ? _d : '', (_e = newTokens.refresh_token) !== null && _e !== void 0 ? _e : '');
                        retryCount++;
                        ctx.logger.info('[Zalo] Token đã được làm mới. Đang thử lại API call...');
                        continue;
                    }
                    catch (refreshError) {
                        const refreshErrorMsg = refreshError instanceof Error ? refreshError.message : String(refreshError);
                        throw new n8n_workflow_1.NodeApiError(node, {
                            message: `[Zalo] Không thể làm mới token: ${refreshErrorMsg}. ` +
                                'Vui lòng kiểm tra App ID, Secret Key, và Refresh Token trong credential.',
                        });
                    }
                }
                else {
                    throw new n8n_workflow_1.NodeApiError(node, {
                        message: `[Zalo] Access token hết hạn và đã vượt quá số lần thử lại tối đa. ${errorMessage}`,
                    });
                }
            }
            else {
                throw new n8n_workflow_1.NodeApiError(node, {
                    message: `${errorMessage}\n` +
                        `Mã lỗi Zalo: ${errorCode}.` +
                        (response.message ? ` Chi tiết: ${response.message}` : ''),
                });
            }
        }
        return response;
    }
    throw new n8n_workflow_1.NodeApiError(node, { message: '[Zalo] Lỗi nội bộ không mong đợi trong zaloApiRequest' });
}
function formatZaloTemplateData(data) {
    if (typeof data === 'string') {
        try {
            return JSON.parse(data);
        }
        catch {
            throw new Error(`Dữ liệu template không phải JSON hợp lệ. Nhận được: "${data}"`);
        }
    }
    if (Array.isArray(data)) {
        const result = {};
        for (const item of data) {
            if (item.key) {
                result[item.key] = item.value;
            }
        }
        return result;
    }
    return data;
}
function normalizePhoneNumber(phone) {
    let cleaned = phone.replace(/[\s\-().+]/g, '');
    if (cleaned.startsWith('0') && cleaned.length === 10) {
        cleaned = '84' + cleaned.slice(1);
    }
    return cleaned;
}
function isValidVietnamesePhone(phone) {
    const normalized = normalizePhoneNumber(phone);
    return /^84[1-9]\d{8}$/.test(normalized);
}
//# sourceMappingURL=GenericFunctions.js.map