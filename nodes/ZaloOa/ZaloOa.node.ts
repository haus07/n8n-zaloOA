import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	ZALO_API_BASE,
	ZALO_ZBS_API_BASE,
	formatZaloTemplateData,
	isValidVietnamesePhone,
	normalizePhoneNumber,
	persistTokensToCredential,
	zaloApiRequest,
	zaloRefreshAccessToken,
	type ZaloCredentials,
} from './GenericFunctions';

// ─────────────────────────────────────────────────────────────────────────────
// Node definition
// ─────────────────────────────────────────────────────────────────────────────

export class ZaloOa implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo OA',
		name: 'zaloOa',
		icon: 'file:zaloOa.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + " – " + $parameter["operation"]}}',
		description:
			'Gửi tin ZBS Template Message qua SĐT, quản lý người dùng OA, gửi tin tư vấn và quản lý token. Access Token tự động làm mới khi hết hạn.',
		defaults: {
			name: 'Zalo OA',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'zaloOaApi', required: true }],
		properties: [

			// ── RESOURCE ──────────────────────────────────────────────────────────────
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Hội Thoại (Conversation)',
						value: 'conversation',
						description: 'Lấy lịch sử tin nhắn trong hội thoại với người dùng',
					},
					{
						name: 'Người Dùng (User)',
						value: 'user',
						description: 'Truy xuất thông tin và danh sách người dùng OA',
					},
					{
						name: 'Thông Tin OA',
						value: 'oa',
						description: 'Lấy thông tin profile Zalo Official Account',
					},
					{
						name: 'Tin Nhắn ZBS Template',
						value: 'message',
						description: 'Gửi tin nhắn ZBS Template qua số điện thoại',
					},
					{
						name: 'Tin Tư Vấn (CS Message)',
						value: 'cs',
						description:
							'Gửi tin tư vấn (văn bản/hình ảnh) tới user_id trong cửa sổ 7 ngày kể từ lần tương tác gần nhất',
					},
					{
						name: 'Token',
						value: 'token',
						description: 'Làm mới Access Token thủ công (token cũng tự động làm mới khi hết hạn)',
					},
				],
				default: 'message',
			},

			// ── CẢNH BÁO RATE LIMIT ───────────────────────────────────────────────────
			{
				displayName:
					'⚠️ Lưu ý: Zalo áp dụng Giới hạn tốc độ gọi API (Rate Limit). Vui lòng không spam hoặc tạo quá nhiều kết nối cùng lúc để tránh bị chặn. Chi tiết tham khảo: https://developers.zalo.me/docs/official-account/phu-luc/gioi-han-toc-do-api',
				name: 'rateLimitNotice',
				type: 'notice',
				default: '',
			},

			// ══════════════════════════════════════════════════════════════════════════
			// OA – Thông Tin OA
			// ══════════════════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['oa'] } },
				options: [
					{
						name: 'Lấy Thông Tin OA',
						value: 'getOa',
						description: 'Truy xuất thông tin chung của Zalo Official Account (Tên, Avatar, Cover…)',
						action: 'Get OA information',
					},
				],
				default: 'getOa',
			},

			// ══════════════════════════════════════════════════════════════════════════
			// CONVERSATION – Hội Thoại
			// ══════════════════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['conversation'] } },
				options: [
					{
						name: 'Lấy Chi Tiết Hội Thoại',
						value: 'getConversation',
						description:
							'Lấy thông tin tin nhắn trong một hội thoại với một người dùng cụ thể',
						action: 'Get conversation details',
					},
				],
				default: 'getConversation',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				required: true,
				default: '',
				description: 'Zalo User ID (ID người dùng quan tâm OA) để lấy tin nhắn',
				displayOptions: { show: { resource: ['conversation'], operation: ['getConversation'] } },
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				default: 0,
				description: 'Vị trí bắt đầu lấy tin nhắn (mặc định 0 – tin nhắn gần nhất)',
				displayOptions: { show: { resource: ['conversation'], operation: ['getConversation'] } },
			},
			{
				displayName: 'Số Lượng (Count)',
				name: 'count',
				type: 'number',
				typeOptions: { maxValue: 10 },
				default: 5,
				description: 'Số lượng tin nhắn muốn lấy. Tối đa 10 tin nhắn mỗi lần gọi.',
				displayOptions: { show: { resource: ['conversation'], operation: ['getConversation'] } },
			},

			// ══════════════════════════════════════════════════════════════════════════
			// USER – Người Dùng OA
			// ══════════════════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['user'] } },
				options: [
					{
						name: 'Truy Xuất Chi Tiết Người Dùng',
						value: 'getDetail',
						description: 'Lấy thông tin chi tiết của một người dùng theo User ID',
						action: 'Get user details',
					},
					{
						name: 'Truy Xuất Danh Sách Người Dùng',
						value: 'getList',
						description: 'Lấy danh sách người dùng đã gửi tin nhắn hoặc quan tâm Zalo OA',
						action: 'Get user list',
					},
				],
				default: 'getDetail',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				required: true,
				default: '',
				description: 'ID của người dùng cần lấy thông tin chi tiết',
				displayOptions: { show: { resource: ['user'], operation: ['getDetail'] } },
			},
			{
				displayName: 'Vị Trí (Offset)',
				name: 'offset',
				type: 'number',
				default: 0,
				description: 'Vị trí bắt đầu lấy (mặc định 0, tối đa 9951)',
				displayOptions: { show: { resource: ['user'], operation: ['getList'] } },
			},
			{
				displayName: 'Số Lượng (Count)',
				name: 'count',
				type: 'number',
				typeOptions: { maxValue: 50 },
				default: 50,
				description: 'Số lượng người dùng cần lấy. Tối đa 50.',
				displayOptions: { show: { resource: ['user'], operation: ['getList'] } },
			},
			{
				displayName: 'Tên Nhãn (Tag Name)',
				name: 'tagName',
				type: 'string',
				default: '',
				description: 'Lọc danh sách theo nhãn cụ thể (tuỳ chọn)',
				displayOptions: { show: { resource: ['user'], operation: ['getList'] } },
			},
			{
				displayName: 'Tương Tác Gần Nhất (Last Interaction)',
				name: 'lastInteractionPeriod',
				type: 'options',
				options: [
					{ name: '30 Ngày Gần Nhất (L30D)', value: 'L30D' },
					{ name: '7 Ngày Gần Nhất (L7D)', value: 'L7D' },
					{ name: 'Hôm Qua (YESTERDAY)', value: 'YESTERDAY' },
					{ name: 'Tất Cả (Tùy Chỉnh / Bỏ Qua)', value: '' },
					{ name: 'Trong Ngày (TODAY)', value: 'TODAY' },
				],
				default: '',
				description: 'Lọc theo thời gian tương tác',
				displayOptions: { show: { resource: ['user'], operation: ['getList'] } },
			},
			{
				displayName: 'Trạng Thái Quan Tâm',
				name: 'isFollower',
				type: 'options',
				options: [
					{ name: 'Chưa Quan Tâm (Người Vãng Lai)', value: 'false' },
					{ name: 'Quan Tâm', value: 'true' },
					{ name: 'Tất Cả', value: '' },
				],
				default: '',
				description: 'Lọc theo trạng thái quan tâm Zalo OA',
				displayOptions: { show: { resource: ['user'], operation: ['getList'] } },
			},

			// ══════════════════════════════════════════════════════════════════════════
			// CS – Tin Tư Vấn (Consultation Message)
			// ══════════════════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['cs'] } },
				options: [
					{
						name: 'Gửi Tin Tư Vấn Dạng Văn Bản',
						value: 'sendText',
						description:
							'Gửi tin nhắn tư vấn dạng văn bản tới user_id (cửa sổ 7 ngày kể từ lần tương tác gần nhất)',
						action: 'Send consultation text message',
					},
					{
						// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
						name: 'Gửi Tin Tư Vấn Đính Kèm Ảnh',
						value: 'sendImage',
						description:
							'Gửi tin nhắn tư vấn đính kèm ảnh (qua URL hoặc Attachment ID) tới user_id (cửa sổ 7 ngày)',
						action: 'Send consultation image message',
					},
				],
				default: 'sendText',
			},
			{
				displayName: 'User ID',
				name: 'csUserId',
				type: 'string',
				required: true,
				default: '',
				description:
					'Zalo User ID của người nhận (phải đã tương tác với OA trong vòng 7 ngày)',
				displayOptions: { show: { resource: ['cs'], operation: ['sendText', 'sendImage'] } },
			},
			{
				displayName: 'Nội Dung Văn Bản',
				name: 'csText',
				type: 'string',
				required: true,
				default: '',
				typeOptions: { rows: 4 },
				description: 'Nội dung tin nhắn văn bản cần gửi (tối đa 500 ký tự theo quy định Zalo)',
				displayOptions: { show: { resource: ['cs'], operation: ['sendText'] } },
			},

			// ── CS: Gửi Tin Tư Vấn Đính Kèm Ảnh ────────────────────────────────────
			{
				// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
				displayName: 'Nguồn Ảnh',
				name: 'csImageSource',
				type: 'options',
				default: 'url',
				description: 'Chọn cách cung cấp ảnh: dùng URL công khai hoặc Attachment ID đã upload lên Zalo',
				options: [
					// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
					{ name: 'Attachment ID (Đã Upload Lên Zalo)', value: 'attachmentId' },
					// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
					{ name: 'URL Ảnh Công Khai', value: 'url' },
				],
				displayOptions: { show: { resource: ['cs'], operation: ['sendImage'] } },
			},
			{
				// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
				displayName: 'URL Ảnh',
				name: 'csImageUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com/image.jpg',
				description: 'Đường dẫn URL công khai tới ảnh (JPG/PNG, kích thước ≤ 5MB theo Zalo)',
				displayOptions: {
					show: { resource: ['cs'], operation: ['sendImage'], csImageSource: ['url'] },
				},
			},
			{
				displayName: 'Attachment ID',
				name: 'csAttachmentId',
				type: 'string',
				required: true,
				default: '',
				description: 'Attachment ID nhận được sau khi upload ảnh qua API upload của Zalo',
				displayOptions: {
					show: {
						resource: ['cs'],
						operation: ['sendImage'],
						csImageSource: ['attachmentId'],
					},
				},
			},
			{
				displayName: 'Chú Thích (Caption – Tuỳ Chọn)',
				name: 'csImageCaption',
				type: 'string',
				default: '',
				typeOptions: { rows: 3 },
				description: 'Đoạn văn bản đi kèm ảnh (có thể để trống nếu chỉ gửi ảnh)',
				displayOptions: { show: { resource: ['cs'], operation: ['sendImage'] } },
			},

			// ══════════════════════════════════════════════════════════════════════════
			// TOKEN – Refresh
			// ══════════════════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['token'] } },
				options: [
					{
						name: 'Refresh Token',
						value: 'refresh',
						description:
							'Làm mới Access Token bằng Refresh Token và tự động ghi đè vào credential',
						action: 'Refresh and save access token',
					},
				],
				default: 'refresh',
			},
			{
				displayName:
					'ℹ️ Node tự động làm mới token khi phát hiện hết hạn trong mọi API call. Hành động này chỉ dùng khi bạn muốn chủ động làm mới token trước (ví dụ: trong scheduled workflow).',
				name: 'tokenRefreshNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { resource: ['token'] } },
			},

			// ══════════════════════════════════════════════════════════════════════════
			// MESSAGE – Gửi ZBS Template
			// ══════════════════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'Gửi ZBS Template',
						value: 'sendTemplate',
						description: 'Gửi tin nhắn ZBS Template qua số điện thoại người nhận',
						action: 'Send ZBS template message',
					},
				],
				default: 'sendTemplate',
			},

			// ── Số điện thoại người nhận ─────────────────────────────────────────────
			{
				displayName: 'Số ĐIện Thoại Người Nhận',
				name: 'phone',
				type: 'string',
				required: true,
				default: '',
				placeholder: '84987654321 hoặc 0987654321',
				description:
					'Số điện thoại người nhận. Chấp nhận định dạng: 0987654321 hoặc 84987654321 hoặc +84987654321. Node sẽ tự chuẩn hoá về dạng 84xxxxxxxxx.',
				displayOptions: { show: { resource: ['message'] } },
			},

			// ── Template ID ──────────────────────────────────────────────────────────
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
				required: true,
				default: '',
				description: 'ID của mẫu tin nhắn (template) đã được đăng ký và phê duyệt trên Zalo',
				displayOptions: { show: { resource: ['message'] } },
			},

			// ── Template Data (fixedCollection thay vì raw JSON) ─────────────────────
			{
				displayName: 'Dữ Liệu Template',
				name: 'templateData',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true, sortable: true },
				placeholder: 'Thêm biến template',
				default: { items: [] },
				description:
					'Các biến cần điền vào template. Mỗi mục là một cặp Tên biến → Giá trị. Ví dụ: key=customer, value=Nguyễn Văn A.',
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'items',
						displayName: 'Biến Template',
						values: [
							{
								displayName: 'Tên Biến (Key)',
								name: 'key',
								type: 'string',
								default: '',
								placeholder: 'ví dụ: customer',
								description: 'Tên biến khớp với template đã đăng ký trên Zalo',
							},
							{
								displayName: 'Giá Trị (Value)',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: 'ví dụ: Nguyễn Văn A',
								description: 'Giá trị điền vào biến',
							},
						],
					},
				],
			},

			// ── Tracking ID ──────────────────────────────────────────────────────────
			{
				displayName: 'Tracking ID (Tuỳ Chọn)',
				name: 'trackingId',
				type: 'string',
				default: '',
				description: 'Mã theo dõi tuỳ chỉnh cho yêu cầu này (tối đa 48 ký tự)',
				displayOptions: { show: { resource: ['message'] } },
			},

			// ── Sending Mode ─────────────────────────────────────────────────────────
			{
				displayName: 'Chế Độ Gửi',
				name: 'sendingMode',
				type: 'options',
				default: '1',
				description: 'Chế độ gửi tin nhắn',
				options: [
					{
						name: 'Gửi Thường (Trong Hạn Mức)',
						value: '1',
						description: 'Gửi tin trong hạn mức cho phép (mặc định)',
					},
					{
						name: 'Gửi Vượt Hạn Mức',
						value: '3',
						description: 'Gửi vượt hạn mức (cần được whitelist bởi Zalo)',
					},
				],
				displayOptions: { show: { resource: ['message'] } },
			},
		],
	};

	// ── Execute ────────────────────────────────────────────────────────────────
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const rawCreds = await this.getCredentials('zaloOaApi');
		const creds: ZaloCredentials = {
			credentialName: rawCreds.credentialName as string,
			appId: rawCreds.appId as string,
			secretKey: rawCreds.secretKey as string,
			oaSecretKey: (rawCreds.oaSecretKey as string) || '',
			accessToken: rawCreds.accessToken as string,
			refreshToken: rawCreds.refreshToken as string,
			n8nInstanceUrl: (rawCreds.n8nInstanceUrl as string) || '',
			n8nApiKey: (rawCreds.n8nApiKey as string) || '',
			credentialId: (rawCreds.credentialId as string) || '',
			allowedHttpRequestDomains: ((rawCreds.allowedHttpRequestDomains as string) ||
				'all') as ZaloCredentials['allowedHttpRequestDomains'],
			allowedDomains: (rawCreds.allowedDomains as string) || '',
		};

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			let result: IDataObject = {};

			switch (resource) {
				// ── TOKEN ──────────────────────────────────────────────────────────────
				case 'token': {
					const newTokens = await zaloRefreshAccessToken(this, creds);
					creds.accessToken = newTokens.access_token ?? '';
					creds.refreshToken = newTokens.refresh_token ?? '';

					await persistTokensToCredential(
						this,
						creds,
						newTokens.access_token ?? '',
						newTokens.refresh_token ?? '',
					);

					result = {
						success: true,
						access_token: newTokens.access_token,
						refresh_token: newTokens.refresh_token,
						credentialUpdated: !!(creds.n8nInstanceUrl && creds.n8nApiKey && creds.credentialId),
						message: creds.credentialId
							? 'Token đã được làm mới và ghi đè vào credential thành công.'
							: 'Token đã được làm mới. (Chưa có Credential ID → chưa ghi đè tự động)',
					};
					break;
				}

				// ── MESSAGE: Gửi ZBS Template ─────────────────────────────────────────
				case 'message': {
					const rawPhone = this.getNodeParameter('phone', i) as string;
					const templateId = this.getNodeParameter('templateId', i) as string;
					const trackingId = this.getNodeParameter('trackingId', i) as string;
					const sendingMode = this.getNodeParameter('sendingMode', i) as string;

					// Chuẩn hoá số điện thoại
					const phone = normalizePhoneNumber(rawPhone);
					if (!isValidVietnamesePhone(rawPhone)) {
						throw new NodeOperationError(
							this.getNode(),
							`Số điện thoại không hợp lệ: "${rawPhone}". ` +
								'Định dạng chấp nhận: 0987654321, 84987654321, hoặc +84987654321.',
							{ itemIndex: i },
						);
					}

					// Parse template data từ fixedCollection
					const rawTemplateData = this.getNodeParameter(
						'templateData',
						i,
					) as {
						items?: Array<{ key: string; value: string }>;
					};
					const templateData = formatZaloTemplateData(rawTemplateData.items ?? []);

					const requestBody: IDataObject = {
						phone,
						template_id: templateId,
						template_data: templateData,
						sending_mode: Number(sendingMode),
					};
					if (trackingId) {
						requestBody.tracking_id = trackingId;
					}

					result = await zaloApiRequest(
						this,
						'POST',
						ZALO_ZBS_API_BASE,
						'/message/template',
						requestBody,
						creds,
						this.getNode(),
					);
					break;
				}

				// ── OA: Thông tin OA ──────────────────────────────────────────────────
				case 'oa': {
					result = await zaloApiRequest(
						this,
						'GET',
						ZALO_API_BASE,
						'/v2.0/oa/getoa',
						{},
						creds,
						this.getNode(),
					);
					break;
				}

				// ── CONVERSATION: Hội thoại ───────────────────────────────────────────
				case 'conversation': {
					const userId = this.getNodeParameter('userId', i) as string;
					const offset = this.getNodeParameter('offset', i) as number;
					const count = this.getNodeParameter('count', i) as number;

					result = await zaloApiRequest(
						this,
						'GET',
						ZALO_API_BASE,
						'/v2.0/oa/conversation',
						{
							data: JSON.stringify({ user_id: userId, offset, count }),
						},
						creds,
						this.getNode(),
					);
					break;
				}

				// ── CS: Tin Tư Vấn ────────────────────────────────────────────────────
				case 'cs': {
					const operation = this.getNodeParameter('operation', i) as string;
					const csUserId = this.getNodeParameter('csUserId', i) as string;

					if (operation === 'sendText') {
						const text = this.getNodeParameter('csText', i) as string;
						result = await zaloApiRequest(
							this,
							'POST',
							ZALO_API_BASE,
							'/v3.0/oa/message/cs',
							{
								recipient: { user_id: csUserId },
								message: { text },
							},
							creds,
							this.getNode(),
						);
					} else if (operation === 'sendImage') {
						const imageSource = this.getNodeParameter('csImageSource', i) as string;
						const caption = this.getNodeParameter('csImageCaption', i) as string;

						const element: IDataObject = { media_type: 'image' };
						if (imageSource === 'url') {
							const imageUrl = this.getNodeParameter('csImageUrl', i) as string;
							if (!imageUrl) {
								throw new NodeOperationError(
									this.getNode(),
									'URL ảnh không được để trống khi nguồn ảnh là URL.',
									{ itemIndex: i },
								);
							}
							element.url = imageUrl;
						} else {
							const attachmentId = this.getNodeParameter('csAttachmentId', i) as string;
							if (!attachmentId) {
								throw new NodeOperationError(
									this.getNode(),
									'Attachment ID không được để trống khi nguồn ảnh là Attachment ID.',
									{ itemIndex: i },
								);
							}
							element.attachment_id = attachmentId;
						}

						const message: IDataObject = {
							attachment: {
								type: 'template',
								payload: {
									template_type: 'media',
									elements: [element],
								},
							},
						};
						if (caption) {
							message.text = caption;
						}

						result = await zaloApiRequest(
							this,
							'POST',
							ZALO_API_BASE,
							'/v3.0/oa/message/cs',
							{
								recipient: { user_id: csUserId },
								message,
							},
							creds,
							this.getNode(),
						);
					}
					break;
				}

				// ── USER: Quản lý người dùng OA ───────────────────────────────────────
				case 'user': {
					const operation = this.getNodeParameter('operation', i) as string;

					if (operation === 'getList') {
						const offset = this.getNodeParameter('offset', i) as number;
						const count = this.getNodeParameter('count', i) as number;
						const tagName = this.getNodeParameter('tagName', i) as string;
						const lastInteractionPeriod = this.getNodeParameter(
							'lastInteractionPeriod',
							i,
						) as string;
						const isFollower = this.getNodeParameter('isFollower', i) as string;

						const reqData: IDataObject = { offset, count };
						if (tagName) reqData.tag_name = tagName;
						if (lastInteractionPeriod) reqData.last_interaction_period = lastInteractionPeriod;
						if (isFollower) reqData.is_follower = isFollower;

						result = await zaloApiRequest(
							this,
							'GET',
							ZALO_API_BASE,
							'/v3.0/oa/user/getlist',
							{ data: JSON.stringify(reqData) },
							creds,
							this.getNode(),
						);
					} else if (operation === 'getDetail') {
						const userId = this.getNodeParameter('userId', i) as string;
						result = await zaloApiRequest(
							this,
							'GET',
							ZALO_API_BASE,
							'/v3.0/oa/user/detail',
							{ data: JSON.stringify({ user_id: userId }) },
							creds,
							this.getNode(),
						);
					}
					break;
				}

				default:
					throw new NodeOperationError(this.getNode(), `Resource không hỗ trợ: "${resource}"`, {
						itemIndex: i,
					});
			}

			returnData.push({ json: result, pairedItem: { item: i } });
		}

		return [returnData];
	}
}
