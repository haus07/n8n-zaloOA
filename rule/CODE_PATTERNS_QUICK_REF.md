# Zalo OA Node: Code Patterns & Snippets Quick Reference

Handy snippets and patterns for common implementation tasks.

---

## 🔑 Key Patterns

### Pattern 1: Calling Zalo API with Auto-Refresh

```typescript
// BEFORE (current implementation)
const response = await callZaloApi(this, 'POST', ZALO_ZBS_API_BASE, '/message/template', {
  phone,
  template_id: templateId,
  template_data: templateData,
}, creds);

// AFTER (new implementation)
const response = await zaloApiRequest(
  this,
  'POST',
  ZALO_ZBS_API_BASE,
  '/message/template',
  {
    phone,
    template_id: templateId,
    template_data: templateData,
  },
  creds,
  this.getNode(),
);
```

**Benefit**: Auto-refresh happens internally, no retry logic needed in execute()

---

### Pattern 2: Collection-Type Form Field (Template Data)

```typescript
// BEFORE: Raw JSON string input
{
  displayName: 'Template Data',
  name: 'templateData',
  type: 'string',
  typeOptions: { rows: 3 },
  placeholder: '{"name": "John", "amount": "100"}',
  // ...
}

// AFTER: Collection with key-value pairs
{
  displayName: 'Template Data',
  name: 'templateData',
  type: 'collection',
  typeOptions: {
    multipleValues: true,
    sortable: true,
  },
  placeholder: 'Add template parameter',
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
}

// Processing in execute():
const templateDataArray = this.getNodeParameter('templateData', i) as Array<{ key: string; value: string }>;
const templateData: IDataObject = {};
templateDataArray.forEach((item) => {
  templateData[item.key] = item.value;
});
```

**Benefit**: Users can use GUI to add/edit template parameters without writing JSON

---

### Pattern 3: Conditional Required Field

```typescript
// Show imageUrl only when imageSource is 'url'
{
  displayName: 'Image URL',
  name: 'imageUrl',
  type: 'string',
  required: true, // Only required when shown
  placeholder: 'https://...',
  displayOptions: {
    show: {
      resource: ['support'],
      operation: ['sendImage'],
      imageSource: ['url'], // Conditional on this field
    },
  },
}

// Validation in execute():
const imageSource = this.getNodeParameter('imageSource', i) as string;
const element: IDataObject = { media_type: 'image' };

if (imageSource === 'url') {
  const imageUrl = this.getNodeParameter('imageUrl', i) as string;
  if (!imageUrl) {
    throw new NodeOperationError(this.getNode(), 'Image URL is required', { itemIndex: i });
  }
  element.url = imageUrl;
} else {
  const attachmentId = this.getNodeParameter('attachmentId', i) as string;
  if (!attachmentId) {
    throw new NodeOperationError(this.getNode(), 'Attachment ID is required', { itemIndex: i });
  }
  element.attachment_id = attachmentId;
}
```

---

### Pattern 4: Resource/Operation Switch Structure

```typescript
async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  const returnData: INodeExecutionData[] = [];

  const creds = await this.getCredentials('zaloOaApi');
  const credentials: ZaloCredentials = {
    // ... map creds
  };

  for (let i = 0; i < items.length; i++) {
    const resource = this.getNodeParameter('resource', i) as string;
    let result: IDataObject = {};

    try {
      switch (resource) {
        case 'message': {
          const operation = this.getNodeParameter('operation', i) as string;
          if (operation === 'sendTemplate') {
            result = await zaloApiRequest(
              this,
              'POST',
              ZALO_ZBS_API_BASE,
              '/message/template',
              { /* payload */ },
              credentials,
              this.getNode(),
            );
          }
          break;
        }

        case 'user': {
          const operation = this.getNodeParameter('operation', i) as string;
          if (operation === 'getList') {
            // ... getList implementation
          } else if (operation === 'getDetail') {
            // ... getDetail implementation
          }
          break;
        }

        case 'token': {
          const newTokens = await zaloRefreshAccessToken(this, credentials);
          credentials.accessToken = newTokens.access_token || '';
          credentials.refreshToken = newTokens.refresh_token || '';
          await persistTokensToCredential(
            this,
            credentials,
            newTokens.access_token || '',
            newTokens.refresh_token || '',
          );
          result = {
            success: true,
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
          };
          break;
        }

        default:
          throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`);
      }
    } catch (error) {
      // Errors from zaloApiRequest are already NodeApiError
      // Just re-throw or handle as needed
      if (error instanceof NodeApiError) {
        throw error;
      }
      throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
    }

    returnData.push({ json: result, pairedItem: { item: i } });
  }

  return [returnData];
}
```

**Benefit**: Clear, maintainable structure for multiple resources/operations

---

### Pattern 5: Error Handling with Context

```typescript
// BEFORE: Generic error
throw new NodeOperationError(ctx.getNode(), `API call failed`);

// AFTER: Specific, actionable error
const errorCode = response.error;
const errorMessage = getZaloErrorMessage(errorCode);

if (TOKEN_EXPIRED_ERROR_CODES.has(errorCode)) {
  // Token-specific handling
  throw new NodeApiError(ctx.getNode(), new Error(
    `[Zalo] Access token expired (error: ${errorCode}). ` +
    'The node will automatically refresh and retry. ' +
    'If this persists, check your Refresh Token in credentials.'
  ));
} else if (errorCode === -216) {
  // Rate limit error
  throw new NodeApiError(ctx.getNode(), new Error(
    `[Zalo] Rate limited. You've exceeded the API call quota. ` +
    'Wait a moment and try again. Details: ${errorMessage}`
  ));
} else if (errorCode === -5) {
  // Validation error
  throw new NodeOperationError(ctx.getNode(), 
    new Error(`[Zalo] Invalid phone number. Error: ${errorMessage}`),
    { itemIndex: i }
  );
} else {
  // Generic error
  throw new NodeApiError(ctx.getNode(), new Error(
    `${errorMessage}\n` +
    `Check the Zalo API documentation or contact Zalo support.`
  ));
}
```

**Benefit**: Users get clear, actionable error messages in the GUI

---

### Pattern 6: Non-Blocking Async Operation

```typescript
// In execute(), after getting new tokens:
// DON'T AWAIT - let it happen in background
persistTokensToCredential(this, credentials, newAccessToken, newRefreshToken)
  .catch((err) => {
    // Catch but don't throw - just log
    this.logger.warn(`Failed to persist tokens: ${err.message}`);
  });

// Or use fire-and-forget with async IIFE:
(async () => {
  try {
    await persistTokensToCredential(this, credentials, newAccessToken, newRefreshToken);
  } catch (err) {
    this.logger.warn(`Token persistence failed: ${err.message}`);
  }
})();

// Alternative: Don't await at all
persistTokensToCredential(this, credentials, newAccessToken, newRefreshToken);
// No error handling - silent failure is OK
```

**Benefit**: Token persistence won't block or fail the workflow if credential update fails

---

## 📋 Common Tasks

### Task: Validate Phone Number Format

```typescript
function validatePhoneNumber(phone: string): boolean {
  // Accept various formats: 0123456789, 84123456789, +84123456789
  const phoneRegex = /^(\+?84|0)[1-9]\d{8}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ''));
}

// In execute():
const phone = this.getNodeParameter('phone', i) as string;
if (!validatePhoneNumber(phone)) {
  throw new NodeOperationError(
    this.getNode(),
    `Invalid phone number format: ${phone}. ` +
    'Expected format: 0123456789 or 84123456789 or +84123456789',
    { itemIndex: i },
  );
}
```

---

### Task: Parse Template Data from Collection

```typescript
function parseTemplateData(
  collectionArray: Array<{ key: string; value: string }>,
): IDataObject {
  const result: IDataObject = {};
  if (Array.isArray(collectionArray)) {
    collectionArray.forEach((item) => {
      result[item.key] = item.value;
    });
  }
  return result;
}

// Or as one-liner in execute():
const templateData = (this.getNodeParameter('templateData', i) as Array<{ key: string; value: string }> || [])
  .reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {} as IDataObject);
```

---

### Task: Build Pagination Params

```typescript
const offset = this.getNodeParameter('offset', i) as number;
const count = this.getNodeParameter('count', i) as number;

const params: IDataObject = {
  offset: Math.max(0, offset), // Ensure >= 0
  count: Math.min(count, 100), // Cap at 100 per Zalo limits
};

// Call API with params
result = await zaloApiRequest(this, 'GET', ZALO_API_BASE, '/v3.0/oa/user/getlist', params, credentials, this.getNode());
```

---

### Task: Build Media Element for Support Message

```typescript
function buildMediaElement(
  imageSource: string,
  imageUrl?: string,
  attachmentId?: string,
): IDataObject {
  const element: IDataObject = { media_type: 'image' };

  if (imageSource === 'url') {
    if (!imageUrl) throw new Error('Image URL is required');
    element.url = imageUrl;
  } else {
    if (!attachmentId) throw new Error('Attachment ID is required');
    element.attachment_id = attachmentId;
  }

  return element;
}

// In execute():
const element = buildMediaElement(imageSource, imageUrl, attachmentId);
const message: IDataObject = {
  attachment: {
    type: 'template',
    payload: {
      template_type: 'media',
      elements: [element],
    },
  },
};
if (caption) message.text = caption;
```

---

### Task: Create Notice/Help Text

```typescript
// In node properties:
{
  displayName: '⚠️ Important Notice',
  name: 'notice',
  type: 'notice',
  default: 'This operation can only send messages within 7 days of the last user interaction with your OA.',
}

// Success helper:
{
  displayName: '✅ User ID Format',
  name: 'userIdHint',
  type: 'notice',
  default: 'The User ID here is the OA-scoped ID (e.g., 123456789), not a phone number. Find it in conversation history.',
}

// Warning:
{
  displayName: '⚠️ Rate Limit Warning',
  name: 'rateLimitWarning',
  type: 'notice',
  default: 'Zalo has strict rate limits. Do not make more than 60 requests/minute per token.',
}
```

---

## 🔐 Security Patterns

### Pattern: Validating Sensitive Fields

```typescript
// In credential authenticate():
authenticate = async (
  credentials: ICredentialDataDecryptedObject,
  requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> => {
  const accessToken = credentials.accessToken as string;
  const appId = credentials.appId as string;

  // Validate required fields
  if (!accessToken || accessToken.trim() === '') {
    throw new Error('[Zalo] Access Token is empty. Check your credential configuration.');
  }

  if (!appId || appId.trim() === '') {
    throw new Error('[Zalo] App ID is empty. Check your credential configuration.');
  }

  return {
    ...requestOptions,
    headers: {
      ...requestOptions.headers,
      access_token: accessToken,
    },
  };
};
```

---

### Pattern: Logging Sensitive Operations

```typescript
// NEVER log full token
// ❌ WRONG:
ctx.logger.info(`Using token: ${credentials.accessToken}`);

// ✅ RIGHT:
ctx.logger.info(`Using token: ${credentials.accessToken.substring(0, 10)}...`);

// Or just log the action:
ctx.logger.info('[Zalo] Refreshing access token');
ctx.logger.info('[Zalo] Token refreshed successfully');
```

---

## 🧪 Testing Patterns

### Pattern: Mock API Response

```typescript
// For unit testing
const mockApiResponse: ZaloApiResponse = {
  error: 0,
  data: {
    user_id: '123456789',
    display_name: 'John Doe',
    avatar: 'https://...',
  },
};

// Simulate error response
const mockErrorResponse: ZaloApiResponse = {
  error: -5,
  message: 'Invalid phone number',
};

// Test token refresh
const mockTokenResponse: ZaloTokenResponse = {
  access_token: 'new_token_abc123',
  refresh_token: 'new_refresh_xyz789',
};
```

---

### Pattern: Test Error Handling

```typescript
// Test 1: Token expiry and auto-refresh
it('should auto-refresh on token expiry', async () => {
  // Mock first response: token expired
  mockHttpRequest
    .mockResolvedValueOnce({ error: -124 })
    .mockResolvedValueOnce({ access_token: 'new_token', refresh_token: 'new_refresh' })
    .mockResolvedValueOnce({ error: 0, data: { /* success */ } });

  const result = await zaloApiRequest(...);
  expect(result.error).toBe(0);
  // Verify token was refreshed
  expect(creds.accessToken).toBe('new_token');
});

// Test 2: Rate limit error
it('should throw on rate limit', async () => {
  mockHttpRequest.mockResolvedValueOnce({ error: -216 });

  expect(() => zaloApiRequest(...)).toThrow('Rate limited');
});

// Test 3: Invalid credentials
it('should throw on invalid token', async () => {
  mockHttpRequest.mockResolvedValueOnce({ error: -220 });

  expect(() => zaloApiRequest(...)).toThrow('Token not valid');
});
```

---

## 📚 TypeScript Patterns

### Pattern: Strict Type Checking

```typescript
// BEFORE: Any type
async callApi(method: any, url: any, data: any): Promise<any> {
  // ...
}

// AFTER: Strict typing
async callApi(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data: IDataObject,
): Promise<ZaloApiResponse> {
  // ...
}
```

### Pattern: Type-Safe Resource Handling

```typescript
// Define allowed resources
type ZaloResource = 'message' | 'user' | 'conversation' | 'support' | 'oa' | 'token';

// Define operations per resource
type ZaloOperation<R extends ZaloResource> =
  R extends 'message' ? 'sendTemplate' :
  R extends 'user' ? 'getList' | 'getDetail' :
  R extends 'conversation' ? 'getHistory' :
  R extends 'support' ? 'sendText' | 'sendImage' :
  R extends 'oa' ? 'getInfo' :
  R extends 'token' ? 'refresh' :
  never;

// Now you can enforce type safety:
const resource: ZaloResource = this.getNodeParameter('resource', i);
const operation: ZaloOperation<typeof resource> = this.getNodeParameter('operation', i);
```

---

## 🚀 Performance Patterns

### Pattern: Batch Processing

```typescript
// If processing multiple items, consider batching:
const batchSize = 10;
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize);
  const batchResults = await Promise.allSettled(
    batch.map((item) => processItem(item))
  );
  // Handle results
}
```

### Pattern: Rate Limit Handling

```typescript
// Add delay between requests to avoid rate limits
const delayMs = 100; // 100ms between requests
for (const item of items) {
  result = await zaloApiRequest(...);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
```

---

## 📖 References

- n8n Node Type: https://docs.n8n.io/integrations/creating-nodes/node-basics/
- Error Handling: https://docs.n8n.io/integrations/creating-nodes/handle-errors/
- Form Fields: https://docs.n8n.io/integrations/creating-nodes/create-n8n-nodes-module/#property-options
- Types & Interfaces: https://github.com/n8n-io/n8n/tree/master/packages/workflow/src

---

**Last Updated**: 2026-08-20
**Version**: 2.0
