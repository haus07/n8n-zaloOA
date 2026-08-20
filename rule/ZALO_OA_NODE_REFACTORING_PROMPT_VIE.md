# Zalo OA n8n Node: Prompt Chi Tiết Cải Tiến & Vá Lỗi

**Phiên bản**: 2.0
**Ngày**: 2026-08-20
**Mục tiêu**: Nâng cấp DX/UX sẵn sàng sản xuất (Production-Ready)

---

## 📋 Tóm Tắt Tổng Quan

Bạn cần cải tiến & vá lỗi node `n8n-nodes-zalo-oa` (fork từ bautran1911/n8n-nodes-zalo-oa). Phiên bản hiện tại có các vấn đề quan trọng:

1. **Quản lý Token**: Access Token hết hạn rất nhanh nhưng KHÔNG tự động làm mới khi gọi API. Người dùng phải tự trigger hành động "Refresh Token".
2. **Xử lý Lỗi**: Zalo API trả về HTTP 200 ngay cả khi thất bại (lỗi được nhúng trong JSON). Phát hiện lỗi hiện tại không ổn định.
3. **Giao diện**: Form rối rắm với quá nhiều hành động lẫn lộn. Không có cấu trúc rõ ràng resource/operation. Thiếu dynamic form fields (collection types cho JSON inputs).
4. **Chất lượng Code**: TypeScript typing không đầy đủ, không tách thành module helper, xử lý token thủ công.

**Mục tiêu**: Làm cho node sẵn sàng sản xuất, vững chắc, và dễ dàng cấu hình cho người dùng không kỹ thuật trong n8n GUI.

---

## 🎯 Yêu Cầu Lõi & Chi Tiết Triển Khai

### 1. QUAN TRỌNG: Tự Động Làm Mới Token Khi Gọi API

#### Vấn Đề Hiện Tại
- Khi Access Token hết hạn, lệnh gọi API thất bại với error code -124, 3, -216, hoặc -220
- Người dùng phải tự chạy hành động "Refresh Token" riêng
- Điều này phá vỡ workflow tự động và trải nghiệm người dùng xấu

#### Kiến Trúc Giải Pháp
Bạn sẽ triển khai **hệ thống làm mới token hai lớp**:

**Lớp 1: Trong Credential File (`ZaloOaApi.credentials.ts`)**
- Class credential sẽ KHÔNG tự động làm mới trực tiếp (giới hạn của n8n)
- Thay vào đó, nó sẽ được chuẩn bị để Lớp 2 gọi
- Lưu trữ tất cả thông số refresh để có thể làm mới token lập trình

**Lớp 2: Trong Thực Thi Node (`ZaloOa.node.ts` + `GenericFunctions.ts` mới)**
- Tạo file helper mới: `nodes/ZaloOa/GenericFunctions.ts`
- Triển khai hàm `zaloApiRequest()` bao gói tất cả lệnh gọi Zalo API
- Luồng logic:
  ```
  1. Thử gọi API với access_token hiện tại
  2. Nếu response.error nằm trong [−124, 3, −216, −220]:
     a. Gọi zaloRefreshAccessToken() để lấy token mới từ Zalo
     b. Cập nhật credentials trong bộ nhớ (cho thực thi hiện tại)
     c. Cố gắng lưu token mới vào credential n8n (non-blocking)
     d. Thử lại lệnh gọi API ban đầu với access_token mới
  3. Nếu thử lại thành công → trả về response
  4. Nếu thử lại thất bại → throw NodeApiError với thông báo rõ ràng
  5. Với lỗi khác → throw NodeApiError ngay lập tức
  ```

#### Chi Tiết Triển Khai

**File: `nodes/ZaloOa/GenericFunctions.ts` (MỚI)**

```typescript
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

// Mã lỗi chỉ ra token hết hạn/không hợp lệ
export const TOKEN_EXPIRED_ERROR_CODES = new Set<number | string>([
  -124, // Token hết hạn
  3,    // Token không hợp lệ
  -216, // Vượt giới hạn
  -220, // Token không hợp lệ
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

export interface ZaloApiResponse {
  error?: number | string;
  message?: string;
  data?: IDataObject;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping Mã Lỗi Zalo → Thông Báo Tiếng Việt
// ─────────────────────────────────────────────────────────────────────────────

const ZALO_ERROR_MESSAGES: Record<number | string, string> = {
  '-1': 'Yêu cầu không hợp lệ',
  '-2': 'Access token không hợp lệ',
  '3': 'Token không hợp lệ hoặc hết hạn',
  '-124': 'Token hết hạn - sẽ tự động làm mới',
  '-200': 'Phương thức không được phép',
  '-216': 'Vượt giới hạn hoặc bị rate limit',
  '-220': 'Token không hợp lệ cho tài khoản OA này',
  '-3': 'Lỗi server',
  '-4': 'Dịch vụ không khả dụng',
  '-5': 'Số điện thoại không hợp lệ',
  '-6': 'Không tìm thấy template',
  '-7': 'Dữ liệu template không hợp lệ',
  '-8': 'Thiếu trường bắt buộc',
};

function getZaloErrorMessage(errorCode: number | string): string {
  return ZALO_ERROR_MESSAGES[errorCode] || `Lỗi Zalo API: ${errorCode}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quản Lý Token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gọi endpoint token Zalo để làm mới access token từ refresh token
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
      const errorMsg = response.message || JSON.stringify(response);
      throw new Error(`Không thể làm mới token: ${errorMsg}`);
    }

    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new NodeApiError(ctx.getNode(), new Error(
      `[Zalo Token Refresh] Không thể làm mới access token: ${errorMsg}. ` +
      'Kiểm tra App ID, Secret Key, và Refresh Token trong cài đặt credential.'
    ), { message: errorMsg });
  }
}

/**
 * Cập nhật access token và refresh token trong credential n8n (non-blocking)
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
      '[Zalo] Token đã cập nhật trong bộ nhớ nhưng chưa lưu (thiếu cấu hình n8n). ' +
      'Để bật tính năng lưu trữ, điền: n8nInstanceUrl, n8nApiKey, credentialId trong cài đặt credential.'
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
      timeout: 10000, // 10s timeout cho credential update
    };

    await ctx.helpers.httpRequest(options);
    ctx.logger.info('[Zalo] Tokens mới đã được lưu vào credential n8n thành công.');
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx.logger.warn(
      `[Zalo] Không thể lưu tokens vào credential: ${errorMsg}. ` +
      'Token được cập nhật trong bộ nhớ cho lần chạy này nhưng sẽ không lưu trữ.'
    );
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler Yêu Cầu API Chính
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handler yêu cầu Zalo API chính với tự động làm mới token khi hết hạn
 *
 * @param ctx - Ngữ cảnh thực thi n8n
 * @param method - Phương thức HTTP (GET, POST, etc.)
 * @param baseUrl - URL cơ sở API (ZALO_API_BASE hoặc ZALO_ZBS_API_BASE)
 * @param endpoint - Đường dẫn endpoint API
 * @param payload - Phần thân yêu cầu hoặc thông số query
 * @param credentials - Credentials Zalo (sẽ được thay đổi nếu token được làm mới)
 * @param node - Tham chiếu node để báo cáo lỗi
 * @returns Response API được phân tích
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
  const maxRetries = 1; // Chỉ thử lại một lần

  while (retryCount <= maxRetries) {
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
      } else if (method === 'GET' || method === 'DELETE') {
        options.qs = payload;
      }

      // Thực hiện lệnh gọi API thực tế
      const response = (await ctx.helpers.httpRequest(options)) as ZaloApiResponse;

      // Kiểm tra lỗi cụ thể của Zalo trong phần thân response
      if (response.error && response.error !== 0) {
        const errorCode = response.error;
        const errorMessage = getZaloErrorMessage(errorCode);

        // Kiểm tra xem đây có phải lỗi token hết hạn không
        if (TOKEN_EXPIRED_ERROR_CODES.has(errorCode)) {
          if (retryCount < maxRetries) {
            ctx.logger.info(
              `[Zalo] Access token hết hạn (error: ${errorCode}). Đang cố gắng làm mới...`
            );

            try {
              // Làm mới token
              const newTokens = await zaloRefreshAccessToken(ctx, credentials);

              // Cập nhật credentials trong bộ nhớ
              credentials.accessToken = newTokens.access_token || '';
              credentials.refreshToken = newTokens.refresh_token || '';
              currentAccessToken = newTokens.access_token || '';

              // Lưu vào n8n (non-blocking, log cảnh báo nếu thất bại)
              await persistTokensToCredential(
                ctx,
                credentials,
                newTokens.access_token || '',
                newTokens.refresh_token || '',
              );

              // Thử lại lệnh gọi API
              retryCount++;
              ctx.logger.info('[Zalo] Token đã được làm mới thành công. Đang thử lại lệnh gọi API...');
              continue; // Tiếp tục vòng lặp while
            } catch (refreshError) {
              // Làm mới token thất bại, throw error
              const refreshErrorMsg =
                refreshError instanceof Error ? refreshError.message : String(refreshError);
              throw new NodeApiError(node, new Error(
                `[Zalo] Không thể làm mới token: ${refreshErrorMsg}. ` +
                'Credentials của bạn có thể không hợp lệ. Vui lòng kiểm tra App ID, Secret Key, và Refresh Token.'
              ));
            }
          } else {
            // Vượt quá số lần thử lại tối đa
            throw new NodeApiError(node, new Error(
              `[Zalo] Access token hết hạn và vượt quá số lần thử lại tối đa. ${errorMessage}`
            ));
          }
        } else {
          // Không phải lỗi token hết hạn, throw ngay lập tức
          throw new NodeApiError(node, new Error(
            `${errorMessage}\n` +
            `Zalo API trả về mã lỗi ${errorCode}. ` +
            (response.message ? `Chi tiết: ${response.message}` : '')
          ));
        }
      }

      // Thành công! Trả về response
      return response;
    } catch (error) {
      // Lỗi cấp mạng hoặc lỗi không phải Zalo
      if (error instanceof NodeApiError) {
        throw error; // Re-throw lỗi n8n
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new NodeApiError(node, new Error(
        `[Zalo] Yêu cầu HTTP thất bại: ${errorMsg}. ` +
        'Kiểm tra kết nối internet và xác minh endpoint Zalo API.'
      ));
    }
  }

  // Không bao giờ đến đây
  throw new NodeApiError(node, new Error('[Zalo] Lỗi bất ngờ trong zaloApiRequest'));
}

/**
 * Helper để định dạng dữ liệu template cho Zalo ZBS API
 */
export function formatZaloTemplateData(
  data: IDataObject | string,
): IDataObject {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as IDataObject;
    } catch {
      throw new Error(
        `Dữ liệu template không phải JSON hợp lệ. Nhận: ${data}`
      );
    }
  }
  return data;
}
```

---

### 2. Tái Cấu Trúc Giao Diện Node: Mô Hình Resource/Operation

#### Vấn Đề Hiện Tại
- Node có 6 resource khác nhau lẫn lộn (Message, User, OA, Conversation, CS, Token)
- Form rối rắm với nhiều trường visible cùng lúc
- Không có collection-type fields cho JSON inputs (người dùng phải viết raw JSON)
- Thiếu helper text và hints

#### Giải Pháp: Cấu Trúc Phân Cấp Resource/Operation Sạch Sẽ

Tái cấu trúc node properties trong `ZaloOa.node.ts`:

**Resource Dropdown** (single select):
1. **Message** - Gửi tin ZBS template
2. **User** - Truy vấn thông tin người dùng
3. **Conversation** - Lấy lịch sử hội thoại
4. **Support** (đổi tên từ "CS") - Gửi tin tư vấn (text/image)
5. **OA Info** (đổi tên từ "OA") - Lấy thông tin profile OA
6. **Token** (tuỳ chọn, cho refresh thủ công) - Làm mới access token thủ công

**Operations trên mỗi Resource**:

| Resource | Operations |
|----------|------------|
| **Message** | Gửi ZBS Template |
| **User** | Lấy Danh Sách Người Dùng, Lấy Thông Tin Người Dùng |
| **Conversation** | Lấy Lịch Sử Hội Thoại |
| **Support** | Gửi Text, Gửi Ảnh |
| **OA Info** | Lấy Thông Tin OA |
| **Token** | Làm Mới Access Token |

**Tăng Cường Form Fields**:
- Sử dụng `type: 'notice'` cho helper hints
- Sử dụng `type: 'collection'` cho template data (key-value pairs thay vì raw JSON)
- Sử dụng `type: 'fixedCollection'` cho danh sách biến
- Triển khai `displayOptions` để show/hide fields dựa trên resource và operation

---

### 3. Xử Lý Lỗi & Trường Hợp Edge

#### Triển Khai trong `GenericFunctions.ts`

✅ Đã được bao phủ ở trên trong hàm `zaloApiRequest()`:
- Phân tích response body cho trường `error`
- Mapping mã lỗi Zalo thành thông báo dễ đọc
- Phân biệt giữa lỗi token hết hạn và lỗi khác
- Throw `NodeApiError` với ngữ cảnh rõ ràng

#### Mã Lỗi Chính Cần Xử Lý

| Mã | Ý Nghĩa | Hành Động |
|----|---------|----------|
| `-124` | Token hết hạn | Tự động làm mới & thử lại |
| `3` | Token không hợp lệ | Tự động làm mới & thử lại |
| `-216` | Vượt giới hạn/rate limited | Thất bại với thông báo rate limit |
| `-220` | Token không hợp lệ cho OA | Thất bại với thông báo lỗi credential |
| `-5` | Số điện thoại không hợp lệ | Thất bại với lỗi validation |
| `-6` | Không tìm thấy template | Thất bại với lỗi template |
| `-8` | Thiếu trường bắt buộc | Thất bại với lỗi validation field |

---

### 4. Chất Lượng Code & Type Safety

#### Cập Nhật `ZaloOa.node.ts`

1. **Import và sử dụng GenericFunctions**:
   ```typescript
   import {
     zaloApiRequest,
     zaloRefreshAccessToken,
     persistTokensToCredential,
     formatZaloTemplateData,
     ZALO_API_BASE,
     ZALO_ZBS_API_BASE,
     type ZaloCredentials,
     type ZaloApiResponse,
   } from './GenericFunctions';
   ```

2. **Đơn giản hóa phương thức execute()**:
   - Loại bỏ các hàm inline dư thừa
   - Sử dụng `zaloApiRequest()` cho tất cả lệnh gọi API
   - Ngữ cảnh lỗi tốt hơn với item index

3. **Cập nhật điều kiện resource/operation**:
   - Sử dụng `switch` statements để rõ ràng
   - Validate thông số bắt buộc trước khi gọi API

#### Best Practices TypeScript
- Sử dụng `type` imports cho type-only imports
- Strict null checks enabled
- Proper return type annotations cho tất cả functions
- Document các hàm phức tạp bằng JSDoc

---

## 📝 Cấu Trúc File (Cuối Cùng)

```
nodes/ZaloOa/
├── ZaloOa.node.ts          (Node chính, được tái cấu trúc)
├── GenericFunctions.ts     (MỚI: Token + API request helpers)
└── ...

credentials/
├── ZaloOaApi.credentials.ts (Cập nhật: Xử lý lỗi tốt hơn)
└── zaloOa.svg
```

---

## 🧪 Danh Sách Kiểm Tra Testing

Sau khi triển khai, xác minh:

- [ ] Tự động làm mới token hoạt động: trigger lệnh gọi API với token hết hạn → nên tự động làm mới
- [ ] Thông báo lỗi rõ ràng và có thể hành động trong n8n GUI
- [ ] UI show/hide fields chính xác dựa trên resource/operation selection
- [ ] Collection field cho template data hoạt động (có thể thêm multiple key-value pairs)
- [ ] Nút credential test hoạt động (endpoint: `/v2.0/oa/getoa`)
- [ ] Tất cả operations hoạt động: sendTemplate, getUser, getOA, sendSupportMessage, etc.
- [ ] Lỗi rate limit được xử lý một cách tươi đẹp
- [ ] Lỗi mạng có thông báo hữu ích
- [ ] Token persistence đến credential n8n hoạt động (non-blocking)

---

## 🚀 Triển Khai & Rollout

1. Build: `npm run build`
2. Test trong instance n8n
3. Cập nhật CHANGELOG.md với version bump và cải tiến
4. Tag release trên GitHub

---

## 💡 Ghi Chú

- Triển khai mới **KHÔNG phá vỡ workflows hiện tại** (backward compatible)
- Làm mới token **tự động** nhưng người dùng vẫn có thể thủ công refresh qua "Resource: Token" action
- **Non-blocking credential persistence** có nghĩa là lỗi mạng khi lưu tokens sẽ không crash workflow
- Tất cả mã lỗi Zalo API được mapping thành thông báo Vietnamese + English để UX tốt hơn

---

## 📚 Tài Liệu Tham Khảo

- Zalo OA API Docs: https://developers.zalo.me/docs/official-account/
- n8n Node Development: https://docs.n8n.io/integrations/creating-nodes/create-n8n-nodes-module/
- n8n Helper Methods: https://docs.n8n.io/integrations/creating-nodes/generic-functions/
- Zalo Error Codes: https://developers.zalo.me/docs/official-account/phu-luc/ma-loi/

---

## ✨ Tóm Tắt Cải Tiến

| Khía Cạnh | Trước | Sau |
|-----------|-------|-----|
| **Token Refresh** | Thủ công (yêu cầu action riêng) | Tự động (khi gọi API nếu hết hạn) |
| **Xử Lý Lỗi** | Cơ bản, không rõ ràng | Toàn diện với mapping mã lỗi |
| **Clarity Giao Diện** | Rối rắm với 6 resources | Cấu trúc phân cấp resource/operation sạch sẽ |
| **Form Fields** | Raw JSON strings | Collection-type fields (GUI key-value editor) |
| **Tổ Chức Code** | Inline helpers trong node | Extracted GenericFunctions module |
| **TypeScript** | Partial typing | Strict typing throughout |
| **Documentation** | Inline comments | JSDoc + detailed README |
| **Token Persistence** | Blocking (có thể fail workflow) | Non-blocking (chỉ log warning) |

---

**Sẵn sàng triển khai? Copy toàn bộ tài liệu này và đưa vào IDE của bạn (Claude Code, ChatGPT Code Interpreter, hoặc tương tự). Nó chứa tất cả yêu cầu, kiến trúc, code snippets, và hướng dẫn testing.**
