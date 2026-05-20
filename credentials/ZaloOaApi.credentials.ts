import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export class ZaloOaApi implements ICredentialType {
	name = 'zaloOaApi';

	displayName = 'Zalo OA API';

	icon = 'file:zaloOa.svg' as const;

	documentationUrl = 'https://developers.zalo.me/docs/official-account/authentication/';

	properties: INodeProperties[] = [
		{
			displayName: 'Credential Name',
			name: 'credentialName',
			type: 'string',
			required: true,
			default: '',
			description: 'Tên của credential',
		},
		// ── Zalo App ──────────────────────────────────────────────────────────────
		{
			displayName: 'App ID',
			name: 'appId',
			type: 'string',
			required: true,
			default: '',
			description: 'Zalo App ID lấy tại developers.zalo.me',
		},
		{
			displayName: 'Secret Key',
			name: 'secretKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Zalo App Secret Key lấy tại developers.zalo.me',
		},
		{
			displayName: 'OA Secret Key (Webhook Signature)',
			name: 'oaSecretKey',
			type: 'string',
			typeOptions: { password: true },
			required: false,
			default: '',
			description:
				'Secret key dùng để verify webhook signature của OA (có thể khác Secret Key của App). Nếu bỏ trống sẽ fallback về Secret Key.',
		},

		// ── Tokens ────────────────────────────────────────────────────────────────
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Access Token hiện tại của Zalo OA',
		},
		{
			displayName: 'Refresh Token',
			name: 'refreshToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Refresh Token dùng để lấy Access Token mới khi hết hạn',
		},

		// ── n8n Auto-Update Config ─────────────────────────────────────────────
		{
			displayName: 'Tự động cập nhật token vào credential',
			name: 'autoUpdateNotice',
			type: 'notice',
			default:
				'Điền 3 trường bên dưới để ghi token mới về credential khi chạy hành động Refresh Token (Resource: Token). Các hành động API khác không tự refresh.',
		},
		{
			displayName: 'n8n Instance URL',
			name: 'n8nInstanceUrl',
			type: 'string',
			default: 'http://localhost:5678',
			description: 'URL của n8n instance (ví dụ: http://localhost:5678 hoặc https://n8n.yourdomain.com)',
		},
		{
			displayName: 'n8n API Key',
			name: 'n8nApiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'API Key của n8n. Tạo tại Settings → API → Create an API key',
		},
		{
			displayName: 'Credential ID',
			name: 'credentialId',
			type: 'string',
			default: '',
			description:
				'ID của credential này. Sau khi lưu credential, mở lại và xem trên URL trình duyệt: /credentials/<ID>',
		},
		// ── Allowed Domains (n8n security) ───────────────────────────────────────
		{
			displayName: 'Allowed HTTP Request Domains',
			name: 'allowedHttpRequestDomains',
			type: 'options',
			default: 'all',
			description: 'Kiểm soát domain nào được phép gọi HTTP từ credential này',
			options: [
				{ name: 'All Domains', value: 'all' },
				{ name: 'Specific Domains', value: 'domains' },
				{ name: 'None', value: 'none' },
			],
		},
		{
			displayName: 'Allowed Domains',
			name: 'allowedDomains',
			type: 'string',
			default: 'oauth.zaloapp.com,openapi.zalo.me',
			description: 'Danh sách domain được phép, cách nhau bằng dấu phẩy (ví dụ: oauth.zaloapp.com,openapi.zalo.me)',
			displayOptions: {
				show: { allowedHttpRequestDomains: ['domains'] },
			},
		},
	];

	authenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		return {
			...requestOptions,
			headers: {
				...requestOptions.headers,
				access_token: credentials.accessToken as string,
			},
		};
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://openapi.zalo.me',
			url: '/v2.0/oa/getoa',
			headers: {
				access_token: '={{$credentials.accessToken}}',
			},
		},
	};
}
