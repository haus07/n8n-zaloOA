"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZaloOa = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const ZALO_ZBS_API_BASE = 'https://business.openapi.zalo.me';
const ZALO_OA_API_BASE = 'https://openapi.zalo.me';
const ZALO_TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
async function refreshAccessToken(ctx, creds) {
    const body = new URLSearchParams();
    body.append('app_id', creds.appId);
    body.append('refresh_token', creds.refreshToken);
    body.append('grant_type', 'refresh_token');
    const options = {
        method: 'POST',
        url: ZALO_TOKEN_URL,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: creds.secretKey,
        },
        body,
        json: true,
    };
    const response = (await ctx.helpers.httpRequest(options));
    if (!response.access_token) {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), `Zalo refresh token thất bại: ${JSON.stringify(response)}`);
    }
    return response;
}
async function writeTokensToCredential(ctx, creds, newAccessToken, newRefreshToken) {
    var _a, _b;
    const { n8nInstanceUrl, n8nApiKey, credentialId } = creds;
    if (!n8nInstanceUrl || !n8nApiKey || !credentialId) {
        return;
    }
    const baseUrl = n8nInstanceUrl.replace(/\/$/, '');
    try {
        const dataPayload = {
            credentialName: creds.credentialName,
            appId: creds.appId,
            secretKey: creds.secretKey,
            oaSecretKey: (_a = creds.oaSecretKey) !== null && _a !== void 0 ? _a : '',
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            n8nInstanceUrl: n8nInstanceUrl !== null && n8nInstanceUrl !== void 0 ? n8nInstanceUrl : '',
            n8nApiKey: n8nApiKey !== null && n8nApiKey !== void 0 ? n8nApiKey : '',
            credentialId: credentialId !== null && credentialId !== void 0 ? credentialId : '',
            allowedHttpRequestDomains: (_b = creds.allowedHttpRequestDomains) !== null && _b !== void 0 ? _b : 'all',
        };
        if (creds.allowedHttpRequestDomains === 'domains' && creds.allowedDomains) {
            dataPayload.allowedDomains = creds.allowedDomains;
        }
        const options = {
            method: 'PATCH',
            url: `${baseUrl}/api/v1/credentials/${credentialId}`,
            headers: {
                'X-N8N-API-KEY': n8nApiKey,
                'Content-Type': 'application/json',
            },
            body: {
                name: creds.credentialName,
                type: 'zaloOaApi',
                data: dataPayload,
            },
            json: true,
        };
        await ctx.helpers.httpRequest(options);
    }
    catch (err) {
        ctx.logger.warn(`[ZaloOa] Không thể cập nhật credential: ${err.message}`);
    }
}
const ZALO_TOKEN_EXPIRED_CODES = new Set([-124, 3, -216, -220, '-124', '3', '-216', '-220']);
async function callZaloApi(ctx, method, baseUrl, endpoint, payload, creds) {
    const options = {
        method,
        url: `${baseUrl}${endpoint}`,
        headers: {
            access_token: creds.accessToken,
            'Content-Type': 'application/json',
        },
        json: true,
    };
    if (method === 'POST') {
        options.body = payload;
    }
    else if (method === 'GET') {
        options.qs = payload;
    }
    let response;
    try {
        response = (await ctx.helpers.httpRequest(options));
    }
    catch (err) {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), err);
    }
    const errorCode = response.error;
    if (ZALO_TOKEN_EXPIRED_CODES.has(errorCode)) {
        throw new n8n_workflow_1.NodeOperationError(ctx.getNode(), `Access Token hết hạn hoặc không hợp lệ (error: ${errorCode}). ` +
            'Hãy chạy hành động "Refresh Token" (Resource: Token) để làm mới token, rồi gọi lại API.');
    }
    return response;
}
class ZaloOa {
    constructor() {
        this.description = {
            displayName: 'Zalo OA',
            name: 'zaloOa',
            icon: 'file:zaloOa.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["resource"] === "token" ? "Refresh Token" : ($parameter["resource"] === "user" ? "Người Dùng OA" : "Gửi ZBS Template")}}',
            description: 'Gửi tin ZBS Template Message qua SĐT, quản lý người dùng OA và token',
            defaults: {
                name: 'Zalo OA',
            },
            usableAsTool: true,
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            credentials: [{ name: 'zaloOaApi', required: true }],
            properties: [
                {
                    displayName: 'Resource',
                    name: 'resource',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        {
                            name: 'Hội Thoại (Conversation)',
                            value: 'conversation',
                            description: 'Lấy thông tin tin nhắn trong hội thoại',
                        },
                        {
                            name: 'Người Dùng (OA)',
                            value: 'user',
                            description: 'Quản lý thông tin người dùng của oa, truy xuất danh sách',
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
                            description: 'Gửi tin tư vấn (văn bản/hình ảnh) tới user_id trong cửa sổ 7 ngày kể từ lần tương tác gần nhất',
                        },
                        {
                            name: 'Token',
                            value: 'token',
                            description: 'Làm mới Access Token và ghi đè vào credential định kỳ',
                        },
                    ],
                    default: 'message',
                },
                {
                    displayName: '⚠️ Lưu ý: Zalo áp dụng Giới hạn tốc độ gọi API (Rate Limit). Vui lòng không spam hoặc tạo quá nhiều kết nối cùng lúc để tránh bị chặn. Chi tiết tham khảo: https://developers.zalo.me/docs/official-account/phu-luc/gioi-han-toc-do-api',
                    name: 'rateLimitNotice',
                    type: 'notice',
                    default: '',
                },
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
                            description: 'Truy xuất thông tin chung của Zalo Official Account (Tên, Avatar, Cover...)',
                            action: 'Get OA information',
                        },
                    ],
                    default: 'getOa',
                },
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
                            description: 'Lấy thông tin tin nhắn trong một hội thoại với một người dùng cụ thể',
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
                    description: 'Vị trí bắt đầu lấy tin nhắn (mặc định 0 - tin nhắn gần nhất)',
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
                            description: 'Gửi tin nhắn tư vấn dạng văn bản tới user_id (cửa sổ 7 ngày kể từ lần tương tác gần nhất)',
                            action: 'Send consultation text message',
                        },
                        {
                            name: 'Gửi Tin Tư Vấn Đính Kèm Ảnh',
                            value: 'sendImage',
                            description: 'Gửi tin nhắn tư vấn đính kèm ảnh (qua URL hoặc Attachment ID) tới user_id (cửa sổ 7 ngày)',
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
                    description: 'Zalo User ID của người nhận (phải đã tương tác với OA trong vòng 7 ngày)',
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
                {
                    displayName: 'Nguồn Ảnh',
                    name: 'csImageSource',
                    type: 'options',
                    default: 'url',
                    description: 'Chọn cách cung cấp ảnh: dùng URL công khai hoặc Attachment ID đã upload lên Zalo',
                    options: [
                        { name: 'Attachment ID (Đã Upload Lên Zalo)', value: 'attachmentId' },
                        { name: 'URL Ảnh Công Khai', value: 'url' },
                    ],
                    displayOptions: { show: { resource: ['cs'], operation: ['sendImage'] } },
                },
                {
                    displayName: 'URL Ảnh',
                    name: 'csImageUrl',
                    type: 'string',
                    required: true,
                    default: '',
                    placeholder: 'https://example.com/image.jpg',
                    description: 'Đường dẫn URL công khai tới ảnh (JPG/PNG, kích thước ≤ 5MB theo Zalo)',
                    displayOptions: { show: { resource: ['cs'], operation: ['sendImage'], csImageSource: ['url'] } },
                },
                {
                    displayName: 'Attachment ID',
                    name: 'csAttachmentId',
                    type: 'string',
                    required: true,
                    default: '',
                    description: 'Attachment ID nhận được sau khi upload ảnh qua API upload của Zalo',
                    displayOptions: { show: { resource: ['cs'], operation: ['sendImage'], csImageSource: ['attachmentId'] } },
                },
                {
                    displayName: 'Chú Thích (Caption - Tuỳ Chọn)',
                    name: 'csImageCaption',
                    type: 'string',
                    default: '',
                    typeOptions: { rows: 3 },
                    description: 'Đoạn văn bản đi kèm ảnh (có thể để trống nếu chỉ gửi ảnh)',
                    displayOptions: { show: { resource: ['cs'], operation: ['sendImage'] } },
                },
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
                            description: 'Làm mới Access Token bằng Refresh Token và tự động ghi đè vào credential',
                            action: 'Refresh and save access token',
                        },
                    ],
                    default: 'refresh',
                },
                {
                    displayName: 'Số ĐIện Thoại Người Nhận',
                    name: 'phone',
                    type: 'string',
                    required: true,
                    default: '',
                    placeholder: '84987654321',
                    description: 'Số điện thoại người nhận định dạng quốc tế (ví dụ: 84987654321 hoặc +84987654321)',
                    displayOptions: { show: { resource: ['message'] } },
                },
                {
                    displayName: 'Template ID',
                    name: 'templateId',
                    type: 'string',
                    required: true,
                    default: '',
                    description: 'ID của mẫu tin nhắn (template) đã được đăng ký và phê duyệt trên Zalo',
                    displayOptions: { show: { resource: ['message'] } },
                },
                {
                    displayName: 'Dữ Liệu Template (JSON)',
                    name: 'templateData',
                    type: 'json',
                    required: true,
                    default: '{}',
                    description: 'Object JSON chứa các biến tương ứng với template. Ví dụ: {"customer":"Nguyễn Văn A","amount":"100.000"}.',
                    typeOptions: { rows: 5 },
                    displayOptions: { show: { resource: ['message'] } },
                },
                {
                    displayName: 'Tracking ID (Tuỳ Chọn)',
                    name: 'trackingId',
                    type: 'string',
                    default: '',
                    description: 'Mã theo dõi tuỳ chỉnh cho yêu cầu này (tối đa 48 ký tự)',
                    displayOptions: { show: { resource: ['message'] } },
                },
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
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        const rawCreds = await this.getCredentials('zaloOaApi');
        const creds = {
            credentialName: rawCreds.credentialName,
            appId: rawCreds.appId,
            secretKey: rawCreds.secretKey,
            oaSecretKey: rawCreds.oaSecretKey || '',
            accessToken: rawCreds.accessToken,
            refreshToken: rawCreds.refreshToken,
            n8nInstanceUrl: rawCreds.n8nInstanceUrl || '',
            n8nApiKey: rawCreds.n8nApiKey || '',
            credentialId: rawCreds.credentialId || '',
            allowedHttpRequestDomains: (rawCreds.allowedHttpRequestDomains || 'all'),
            allowedDomains: rawCreds.allowedDomains || '',
        };
        for (let i = 0; i < items.length; i++) {
            const resource = this.getNodeParameter('resource', i);
            let result = {};
            if (resource === 'token') {
                const newTokens = await refreshAccessToken(this, creds);
                const newAccessToken = newTokens.access_token;
                const newRefreshToken = newTokens.refresh_token;
                creds.accessToken = newAccessToken;
                creds.refreshToken = newRefreshToken;
                await writeTokensToCredential(this, creds, newAccessToken, newRefreshToken);
                result = {
                    success: true,
                    access_token: newAccessToken,
                    refresh_token: newRefreshToken,
                    credentialUpdated: !!(creds.n8nInstanceUrl && creds.n8nApiKey && creds.credentialId),
                    message: creds.credentialId
                        ? 'Token đã được làm mới và ghi đè vào credential thành công.'
                        : 'Token đã được làm mới. (Chưa có Credential ID → chưa ghi đè tự động)',
                };
            }
            else if (resource === 'message') {
                const phone = this.getNodeParameter('phone', i);
                const templateId = this.getNodeParameter('templateId', i);
                const templateDataRaw = this.getNodeParameter('templateData', i);
                const trackingId = this.getNodeParameter('trackingId', i);
                const sendingMode = this.getNodeParameter('sendingMode', i);
                let templateData;
                if (typeof templateDataRaw === 'string') {
                    try {
                        templateData = JSON.parse(templateDataRaw);
                    }
                    catch {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Dữ liệu template không hợp lệ (không phải JSON hợp lệ): ${templateDataRaw}`, { itemIndex: i });
                    }
                }
                else {
                    templateData = templateDataRaw;
                }
                const requestBody = {
                    phone,
                    template_id: templateId,
                    template_data: templateData,
                    sending_mode: Number(sendingMode),
                };
                if (trackingId) {
                    requestBody.tracking_id = trackingId;
                }
                result = await callZaloApi(this, 'POST', ZALO_ZBS_API_BASE, '/message/template', requestBody, creds);
            }
            else if (resource === 'oa') {
                const operation = this.getNodeParameter('operation', i);
                if (operation === 'getOa') {
                    result = await callZaloApi(this, 'GET', ZALO_OA_API_BASE, '/v2.0/oa/getoa', {}, creds);
                }
            }
            else if (resource === 'conversation') {
                const operation = this.getNodeParameter('operation', i);
                if (operation === 'getConversation') {
                    const userId = this.getNodeParameter('userId', i);
                    const offset = this.getNodeParameter('offset', i);
                    const count = this.getNodeParameter('count', i);
                    const reqData = {
                        user_id: userId,
                        offset,
                        count,
                    };
                    result = await callZaloApi(this, 'GET', ZALO_OA_API_BASE, '/v2.0/oa/conversation', { data: JSON.stringify(reqData) }, creds);
                }
            }
            else if (resource === 'cs') {
                const operation = this.getNodeParameter('operation', i);
                if (operation === 'sendText') {
                    const userId = this.getNodeParameter('csUserId', i);
                    const text = this.getNodeParameter('csText', i);
                    const requestBody = {
                        recipient: { user_id: userId },
                        message: { text },
                    };
                    result = await callZaloApi(this, 'POST', ZALO_OA_API_BASE, '/v3.0/oa/message/cs', requestBody, creds);
                }
                else if (operation === 'sendImage') {
                    const userId = this.getNodeParameter('csUserId', i);
                    const imageSource = this.getNodeParameter('csImageSource', i);
                    const caption = this.getNodeParameter('csImageCaption', i);
                    const element = { media_type: 'image' };
                    if (imageSource === 'url') {
                        const imageUrl = this.getNodeParameter('csImageUrl', i);
                        if (!imageUrl) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'URL ảnh không được để trống khi nguồn ảnh là URL.', { itemIndex: i });
                        }
                        element.url = imageUrl;
                    }
                    else {
                        const attachmentId = this.getNodeParameter('csAttachmentId', i);
                        if (!attachmentId) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Attachment ID không được để trống khi nguồn ảnh là Attachment ID.', { itemIndex: i });
                        }
                        element.attachment_id = attachmentId;
                    }
                    const message = {
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
                    const requestBody = {
                        recipient: { user_id: userId },
                        message,
                    };
                    result = await callZaloApi(this, 'POST', ZALO_OA_API_BASE, '/v3.0/oa/message/cs', requestBody, creds);
                }
            }
            else if (resource === 'user') {
                const operation = this.getNodeParameter('operation', i);
                if (operation === 'getList') {
                    const offset = this.getNodeParameter('offset', i);
                    const count = this.getNodeParameter('count', i);
                    const tagName = this.getNodeParameter('tagName', i);
                    const lastInteractionPeriod = this.getNodeParameter('lastInteractionPeriod', i);
                    const isFollower = this.getNodeParameter('isFollower', i);
                    const reqData = {
                        offset,
                        count,
                    };
                    if (tagName)
                        reqData.tag_name = tagName;
                    if (lastInteractionPeriod)
                        reqData.last_interaction_period = lastInteractionPeriod;
                    if (isFollower)
                        reqData.is_follower = isFollower;
                    result = await callZaloApi(this, 'GET', ZALO_OA_API_BASE, '/v3.0/oa/user/getlist', { data: JSON.stringify(reqData) }, creds);
                }
                else if (operation === 'getDetail') {
                    const userId = this.getNodeParameter('userId', i);
                    const reqData = {
                        user_id: userId,
                    };
                    result = await callZaloApi(this, 'GET', ZALO_OA_API_BASE, '/v3.0/oa/user/detail', { data: JSON.stringify(reqData) }, creds);
                }
            }
            returnData.push({ json: result, pairedItem: { item: i } });
        }
        return [returnData];
    }
}
exports.ZaloOa = ZaloOa;
//# sourceMappingURL=ZaloOa.node.js.map