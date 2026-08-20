# Zalo OA n8n Node: Comprehensive Refactoring & Improvement Prompt

**Version**: 2.0
**Date**: 2026-08-20
**Target**: Production-Ready DX/UX Enhancement

---

## 📋 Executive Summary

You are tasked with refactoring and significantly improving the `n8n-nodes-zalo-oa` node (forked from bautran1911/n8n-nodes-zalo-oa). The current implementation has several critical issues:

1. **Token Management**: Access tokens expire quickly but are NOT automatically refreshed during API calls. Users must manually trigger a "Refresh Token" action.
2. **Error Handling**: Zalo API returns HTTP 200 even when the call fails (error embedded in JSON body). Current error detection is fragile.
3. **UI/UX**: Form is cluttered with too many mixed operations. No clear resource/operation hierarchy. Missing dynamic form fields (collection types for JSON inputs).
4. **Code Quality**: Limited TypeScript typing, no helper module separation, manual token handling.

**Goal**: Make this node production-ready, robust, and easy for non-technical users to configure in n8n GUI.

---

## 🎯 Core Requirements & Implementation Details

### 1. CRITICAL: Automatic Token Refresh During API Calls

#### Problem
- Currently, when `Access Token` expires, the API call fails with error code -124, 3, -216, or -220
- Users must manually run a separate "Refresh Token" action
- This breaks automation workflows and poor DX

#### Solution Architecture
You will implement a **two-layer token refresh system**:

**Layer 1: In Credential File (`ZaloOaApi.credentials.ts`)**
- The credential class will NOT do auto-refresh directly (n8n limitation)
- Instead, it will be prepared for being called by Layer 2
- Store all refresh parameters for programmatic token renewal

**Layer 2: In Node Execution (`ZaloOa.node.ts` + New `GenericFunctions.ts`)**
- Create a new helper file: `nodes/ZaloOa/GenericFunctions.ts`
- Implement `zaloApiRequest()` function that wraps all Zalo API calls
- Logic flow:
  ```
  1. Try API call with current access_token
  2. If response.error is in [−124, 3, −216, −220]:
     a. Call zaloRefreshAccessToken() to get new tokens from Zalo
     b. Update credentials in-memory (for current execution)
     c. Try to persist new tokens to n8n credential (non-blocking)
     d. Retry the original API call with new access_token
  3. If retry succeeds → return response
  4. If retry fails → throw NodeApiError with clear message
  5. For other errors → throw NodeApiError immediately
  ```

#### Implementation Details

**File: `nodes/ZaloOa/GenericFunctions.ts` (NEW)**

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

// Error codes that indicate token expiration/invalidity
export const TOKEN_EXPIRED_ERROR_CODES = new Set<number | string>([
  -124, // Token expired
  3,    // Invalid token
  -216, // Out of quota
  -220, // Token not valid
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
// Zalo Error Code Mapping
// ─────────────────────────────────────────────────────────────────────────────

const ZALO_ERROR_MESSAGES: Record<number | string, string> = {
  '-1': 'Invalid request (lỗi không hợp lệ)',
  '-2': 'Access token invalid (access token không hợp lệ)',
  '3': 'Invalid token or token has expired (Token không hợp lệ hoặc hết hạn)',
  '-124': 'Token expired - automatic refresh will be attempted (Token hết hạn)',
  '-200': 'Method not allowed (Phương thức không được phép)',
  '-216': 'Out of quota or rate limited (Vượt giới hạn)',
  '-220': 'Token not valid for this OA account (Token không hợp lệ cho OA này)',
  '-3': 'Server error (Lỗi server)',
  '-4': 'Service not available (Dịch vụ không khả dụng)',
  '-5': 'Invalid phone number (Số điện thoại không hợp lệ)',
  '-6': 'Template not found (Không tìm thấy template)',
  '-7': 'Template data invalid (Dữ liệu template không hợp lệ)',
  '-8': 'Missing required fields (Thiếu trường bắt buộc)',
};

function getZaloErrorMessage(errorCode: number | string): string {
  return ZALO_ERROR_MESSAGES[errorCode] || `Zalo API Error: ${errorCode}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call Zalo token endpoint to refresh access token using refresh token
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
      throw new Error(`Failed to refresh token: ${errorMsg}`);
    }

    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new NodeApiError(ctx.getNode(), new Error(
      `[Zalo Token Refresh] Failed to refresh access token: ${errorMsg}. ` +
      'Check your App ID, Secret Key, and Refresh Token in the credential settings.'
    ), { message: errorMsg });
  }
}

/**
 * Update access token and refresh token in n8n credential (non-blocking)
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
      '[Zalo] Token updated in memory but not persisted (missing n8n config). ' +
      'To enable persistence, fill in: n8nInstanceUrl, n8nApiKey, credentialId in credential settings.'
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
      timeout: 10000, // 10s timeout for credential update
    };

    await ctx.helpers.httpRequest(options);
    ctx.logger.info('[Zalo] New tokens persisted to n8n credential successfully.');
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx.logger.warn(
      `[Zalo] Failed to persist tokens to credential: ${errorMsg}. ` +
      'Token is updated in memory for this execution but will not persist.'
    );
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main API Request Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main Zalo API request handler with automatic token refresh on expiry
 *
 * @param ctx - n8n execution context
 * @param method - HTTP method (GET, POST, etc.)
 * @param baseUrl - API base URL (ZALO_API_BASE or ZALO_ZBS_API_BASE)
 * @param endpoint - API endpoint path
 * @param payload - Request body or query params
 * @param credentials - Zalo credentials (will be mutated if token is refreshed)
 * @param node - Node reference for error reporting
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
  const maxRetries = 1; // Only retry once

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

      // Make the actual API request
      const response = (await ctx.helpers.httpRequest(options)) as ZaloApiResponse;

      // Check for Zalo-specific error in response body
      if (response.error && response.error !== 0) {
        const errorCode = response.error;
        const errorMessage = getZaloErrorMessage(errorCode);

        // Check if this is a token expiry error
        if (TOKEN_EXPIRED_ERROR_CODES.has(errorCode)) {
          if (retryCount < maxRetries) {
            ctx.logger.info(
              `[Zalo] Access token expired (error: ${errorCode}). Attempting to refresh...`
            );

            try {
              // Refresh the token
              const newTokens = await zaloRefreshAccessToken(ctx, credentials);

              // Update in-memory credentials
              credentials.accessToken = newTokens.access_token || '';
              credentials.refreshToken = newTokens.refresh_token || '';
              currentAccessToken = newTokens.access_token || '';

              // Persist to n8n (non-blocking, logs warning if fails)
              await persistTokensToCredential(
                ctx,
                credentials,
                newTokens.access_token || '',
                newTokens.refresh_token || '',
              );

              // Retry the API call
              retryCount++;
              ctx.logger.info('[Zalo] Token refreshed successfully. Retrying API call...');
              continue; // Go to next iteration of while loop
            } catch (refreshError) {
              // Token refresh failed, throw error
              const refreshErrorMsg =
                refreshError instanceof Error ? refreshError.message : String(refreshError);
              throw new NodeApiError(node, new Error(
                `[Zalo] Token refresh failed: ${refreshErrorMsg}. ` +
                'Your credentials may be invalid. Please verify App ID, Secret Key, and Refresh Token.'
              ));
            }
          } else {
            // Max retries exceeded
            throw new NodeApiError(node, new Error(
              `[Zalo] Access token expired and max retry attempts exceeded. ${errorMessage}`
            ));
          }
        } else {
          // Not a token expiry error, throw immediately
          throw new NodeApiError(node, new Error(
            `${errorMessage}\n` +
            `Zalo API responded with error code ${errorCode}. ` +
            (response.message ? `Details: ${response.message}` : '')
          ));
        }
      }

      // Success! Return the response
      return response;
    } catch (error) {
      // Network-level error or other non-Zalo errors
      if (error instanceof NodeApiError) {
        throw error; // Re-throw n8n errors
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new NodeApiError(node, new Error(
        `[Zalo] HTTP request failed: ${errorMsg}. ` +
        'Check your internet connection and verify the Zalo API endpoint.'
      ));
    }
  }

  // Should never reach here
  throw new NodeApiError(node, new Error('[Zalo] Unexpected error in zaloApiRequest'));
}

/**
 * Helper to format template data for Zalo ZBS API
 */
export function formatZaloTemplateData(
  data: IDataObject | string,
): IDataObject {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as IDataObject;
    } catch {
      throw new Error(
        `Template data is not valid JSON. Received: ${data}`
      );
    }
  }
  return data;
}
```

**File: `credentials/ZaloOaApi.credentials.ts` (UPDATED)**

Replace the `authenticate()` method with proper error handling:

```typescript
authenticate = async (
  credentials: ICredentialDataDecryptedObject,
  requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> => {
  const accessToken = credentials.accessToken as string;

  if (!accessToken) {
    throw new Error(
      '[Zalo] Access Token is empty. Please check your credential configuration.'
    );
  }

  return {
    ...requestOptions,
    headers: {
      ...requestOptions.headers,
      access_token: accessToken,
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
  rules: [
    {
      type: 'responseSuccessBody',
      properties: {
        expression: '={{$response.body.error === 0}}',
        message: 'Zalo OA API test failed. Access Token may be invalid or expired.',
      },
    },
  ],
};
```

---

### 2. Node UI/UX Refactoring: Resource/Operation Pattern

#### Current Problem
- Node has 6 different resources mixed together (Message, User, OA, Conversation, CS, Token)
- Form is cluttered with many visible fields at once
- No collection-type fields for JSON inputs (users must write raw JSON)
- Limited helper text and hints

#### Solution: Clean Resource/Operation Hierarchy

Restructure the node properties in `ZaloOa.node.ts`:

**Resource Dropdown** (single select):
1. **Message** - Send ZBS template messages
2. **User** - Query user information
3. **Conversation** - Retrieve conversation history
4. **Support** (renamed from "CS") - Send customer support messages (text/image)
5. **OA Info** (renamed from "OA") - Retrieve OA profile information
6. **Token** (optional, for manual refresh) - Manually refresh access token

**Operations per Resource**:

| Resource | Operations |
|----------|------------|
| **Message** | Send ZBS Template |
| **User** | Get User List, Get User Profile |
| **Conversation** | Get Conversation History |
| **Support** | Send Text, Send Image |
| **OA Info** | Get OA Information |
| **Token** | Refresh Access Token |

**Form Fields Enhancement**:
- Use `type: 'notice'` for helpful hints
- Use `type: 'collection'` for template data (key-value pairs instead of raw JSON)
- Use `type: 'fixedCollection'` for variable lists
- Implement `displayOptions` to show/hide fields based on resource and operation

Example structure:

```typescript
properties: [
  // Resource selector
  {
    displayName: 'Resource',
    name: 'resource',
    type: 'options',
    noDataExpression: true,
    options: [
      { name: 'Message (ZBS Template)', value: 'message', description: 'Send templated messages' },
      { name: 'User', value: 'user', description: 'Query user info' },
      { name: 'Conversation', value: 'conversation', description: 'Get conversation history' },
      { name: 'Support (CS)', value: 'support', description: 'Send text/image support messages' },
      { name: 'OA Info', value: 'oa', description: 'Get OA profile' },
      { name: 'Token', value: 'token', description: 'Manually refresh token' },
    ],
    default: 'message',
  },

  // === MESSAGE Resource ===
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    displayOptions: { show: { resource: ['message'] } },
    options: [
      { name: 'Send ZBS Template', value: 'sendTemplate', action: 'Send a ZBS template message' },
    ],
    default: 'sendTemplate',
  },

  // Message operation fields
  {
    displayName: 'Phone Number',
    name: 'phone',
    type: 'string',
    required: true,
    placeholder: '84123456789',
    description: 'Recipient phone number (with or without +84)',
    displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
  },

  {
    displayName: 'Template ID',
    name: 'templateId',
    type: 'string',
    required: true,
    placeholder: 'e.g., 1234567',
    description: 'Zalo ZBS Template ID from your ZBS dashboard',
    displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
  },

  {
    displayName: 'Template Data',
    name: 'templateData',
    type: 'collection',
    typeOptions: {
      multipleValues: true,
      sortable: true,
    },
    placeholder: 'Add template parameter',
    required: false,
    default: [],
    description: 'Key-value pairs for template parameters (e.g., name="John", amount="100")',
    displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
    options: [
      {
        displayName: 'Key',
        name: 'key',
        type: 'string',
        placeholder: 'e.g., name',
      },
      {
        displayName: 'Value',
        name: 'value',
        type: 'string',
        placeholder: 'e.g., John Doe',
      },
    ],
  },

  // ... more fields with proper displayOptions
],
```

---

### 3. Error Handling & Edge Cases

#### Implementation in `GenericFunctions.ts`

✅ Already covered above in the `zaloApiRequest()` function:
- Parse response body for `error` field
- Map Zalo error codes to human-readable messages
- Distinguish between token expiry errors and other errors
- Throw `NodeApiError` with clear context

#### Key Error Codes to Handle

| Code | Meaning | Action |
|------|---------|--------|
| `-124` | Token expired | Auto-refresh & retry |
| `3` | Invalid token | Auto-refresh & retry |
| `-216` | Out of quota/rate limited | Fail with rate limit message |
| `-220` | Token invalid for OA | Fail with credential error |
| `-5` | Invalid phone number | Fail with validation error |
| `-6` | Template not found | Fail with template error |
| `-8` | Missing required fields | Fail with field validation error |

---

### 4. Code Quality & Type Safety

#### Updates to `ZaloOa.node.ts`

1. **Import and use GenericFunctions**:
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

2. **Simplify execute() method**:
   - Remove redundant inline functions
   - Use `zaloApiRequest()` for all API calls
   - Better error context with item index

3. **Update resource/operation conditions**:
   - Use `switch` statements for clarity
   - Validate required parameters before API calls

#### TypeScript Best Practices
- Use `type` imports for type-only imports
- Strict null checks enabled
- Proper return type annotations for all functions
- Document complex functions with JSDoc

---

## 📝 File Structure (Final)

```
nodes/ZaloOa/
├── ZaloOa.node.ts          (Main node, refactored)
├── GenericFunctions.ts     (NEW: Token + API request helpers)
└── ...

credentials/
├── ZaloOaApi.credentials.ts (Updated: Better error handling in authenticate())
└── zaloOa.svg
```

---

## 🧪 Testing Checklist

After implementation, verify:

- [ ] Token auto-refresh works: trigger API call with expired token → should refresh automatically
- [ ] Error messages are clear and actionable in n8n GUI
- [ ] UI shows/hides fields correctly based on resource/operation selection
- [ ] Collection field for template data works (can add multiple key-value pairs)
- [ ] Credential test button works (endpoint: `/v2.0/oa/getoa`)
- [ ] All operations work: sendTemplate, getUser, getOA, sendSupportMessage, etc.
- [ ] Rate limit errors are handled gracefully
- [ ] Network errors have helpful messages
- [ ] Token persistence to n8n credential works (non-blocking)

---

## 🚀 Deployment & Rollout

1. Build: `npm run build`
2. Test in n8n instance
3. Update CHANGELOG.md with version bump and improvements
4. Tag release on GitHub

---

## 💡 Notes

- The new implementation **does not break existing workflows** (backward compatible)
- Token refresh is **automatic** but users can still manually refresh via "Resource: Token" action
- **Non-blocking credential persistence** means a network failure to save tokens won't crash the workflow
- All Zalo API error codes are mapped to Vietnamese + English messages for better UX

---

## 📚 References

- Zalo OA API Docs: https://developers.zalo.me/docs/official-account/
- n8n Node Development: https://docs.n8n.io/integrations/creating-nodes/create-n8n-nodes-module/
- n8n Helper Methods: https://docs.n8n.io/integrations/creating-nodes/generic-functions/
- Zalo Error Codes: https://developers.zalo.me/docs/official-account/phu-luc/ma-loi/

---

## ✨ Summary of Improvements

| Aspect | Before | After |
|--------|--------|-------|
| **Token Refresh** | Manual (requires separate action) | Automatic (on API call if expired) |
| **Error Handling** | Basic, non-descriptive | Comprehensive with error code mapping |
| **UI Clarity** | Cluttered with 6 resources | Clean resource/operation hierarchy |
| **Form Fields** | Raw JSON strings | Collection-type fields (GUI key-value editor) |
| **Code Organization** | Inline helpers in node | Extracted GenericFunctions module |
| **TypeScript** | Partial typing | Strict typing throughout |
| **Documentation** | Inline comments | JSDoc + detailed README |
| **Token Persistence** | Blocking (can fail workflow) | Non-blocking (logs warning only) |

---

**Ready to implement? Copy this entire document and feed it to your IDE (Claude Code, ChatGPT Code Interpreter, or similar). It contains all requirements, architecture, code snippets, and testing guidelines.**
