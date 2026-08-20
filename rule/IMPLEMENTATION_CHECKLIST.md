# Zalo OA Node Refactoring: Implementation Checklist

**Status**: Not Started
**Progress**: 0%

---

## Phase 1: Setup & Preparation

- [ ] Clone/review current repo: `https://github.com/bautran1911/n8n-nodes-zalo-oa`
- [ ] Backup current version (create new branch)
- [ ] Install dependencies: `npm install`
- [ ] Review current code structure and dependencies
- [ ] Verify build process: `npm run build`

---

## Phase 2: Create GenericFunctions.ts (NEW FILE)

### Core Exports
- [ ] Export constants: `ZALO_API_BASE`, `ZALO_ZBS_API_BASE`, `ZALO_TOKEN_URL`
- [ ] Export constants: `TOKEN_EXPIRED_ERROR_CODES` (Set with [-124, 3, -216, -220])
- [ ] Export type: `ZaloCredentials` (interface with all credential fields)
- [ ] Export type: `ZaloTokenResponse` (access_token, refresh_token, error)
- [ ] Export type: `ZaloApiResponse` (error, message, data, etc.)

### Error Handling
- [ ] Create `ZALO_ERROR_MESSAGES` mapping (Vietnamese + English)
- [ ] Implement `getZaloErrorMessage(errorCode)` function

### Token Management Functions
- [ ] Implement `zaloRefreshAccessToken()` function
  - [ ] POST to `ZALO_TOKEN_URL`
  - [ ] Headers: `secret_key`, `Content-Type: application/x-www-form-urlencoded`
  - [ ] Body: `app_id`, `refresh_token`, `grant_type: refresh_token`
  - [ ] Error handling: throw `NodeApiError` if no `access_token` in response
  - [ ] Return `ZaloTokenResponse`

- [ ] Implement `persistTokensToCredential()` function
  - [ ] Check if `n8nInstanceUrl`, `n8nApiKey`, `credentialId` are provided
  - [ ] PATCH to `{n8nInstanceUrl}/api/v1/credentials/{credentialId}`
  - [ ] Non-blocking (use try-catch, log warnings only)
  - [ ] Update all credential fields (maintain current ones)
  - [ ] Return boolean (success/failure)

### Main API Request Handler
- [ ] Implement `zaloApiRequest()` function
  - [ ] Accept: method, baseUrl, endpoint, payload, credentials, node
  - [ ] Retry logic (max 1 retry):
    - [ ] Make HTTP request with current access_token
    - [ ] Parse response body
    - [ ] Check if `response.error !== 0`
    - [ ] If error in `TOKEN_EXPIRED_ERROR_CODES`:
      - [ ] Call `zaloRefreshAccessToken()`
      - [ ] Update `credentials` in-memory
      - [ ] Call `persistTokensToCredential()` (non-blocking)
      - [ ] Retry original API call with new token
    - [ ] Else: throw `NodeApiError` immediately
  - [ ] Proper error messages with clear context

### Helper Functions
- [ ] Implement `formatZaloTemplateData()` function
  - [ ] Parse JSON string if needed
  - [ ] Return `IDataObject`
  - [ ] Error handling for invalid JSON

---

## Phase 3: Update Credentials File (ZaloOaApi.credentials.ts)

### Credential Properties
- [ ] Keep all existing fields (appId, secretKey, accessToken, refreshToken, etc.)
- [ ] Keep n8n config fields (n8nInstanceUrl, n8nApiKey, credentialId)
- [ ] Keep allowed domains configuration

### Update authenticate() Method
- [ ] Add validation: throw error if `accessToken` is empty
- [ ] Set header: `access_token: credentials.accessToken`
- [ ] Return updated `requestOptions`

### Update test Request
- [ ] Endpoint: `/v2.0/oa/getoa`
- [ ] Headers: `access_token: '={{$credentials.accessToken}}'`
- [ ] Add `rules` array to check `response.error === 0`
- [ ] Clear error message if test fails

---

## Phase 4: Refactor Node File (ZaloOa.node.ts)

### Imports & Setup
- [ ] Import all from `GenericFunctions.ts`
- [ ] Remove duplicate constants and functions from node
- [ ] Remove old inline error handling code

### Node Description
- [ ] Update `displayName`, `description`, `subtitle` (if needed)
- [ ] Keep current node configuration (inputs, outputs, credentials)

### Resource Dropdown
- [ ] Update options (6 total):
  1. Message (Send ZBS Template)
  2. User (Query user info)
  3. Conversation (Get history)
  4. Support (Send text/image - rename from "CS")
  5. OA Info (Get profile - rename from "OA")
  6. Token (Manual refresh)

### Operation Fields Structure

#### Message Resource
- [ ] Operation: "Send ZBS Template"
- [ ] Fields:
  - [ ] `phone` (string, required)
  - [ ] `templateId` (string, required)
  - [ ] `templateData` (collection, optional) - **KEY IMPROVEMENT**: Use collection type instead of raw JSON
    - [ ] Key (string)
    - [ ] Value (string)
  - [ ] `trackingId` (string, optional)
  - [ ] `sendingMode` (options: 0-normal, 1-urgent, 3-overtime)
  - [ ] Helper notice: "Template data should match your Zalo ZBS template parameters"

#### User Resource
- [ ] Operation: "Get User List"
  - [ ] `offset` (number, default: 0)
  - [ ] `count` (number, default: 20)
  - [ ] `tagName` (string, optional)
  - [ ] `lastInteractionPeriod` (string, optional)
  - [ ] `isFollower` (string, optional)

- [ ] Operation: "Get User Profile"
  - [ ] `userId` (string, required)
  - [ ] Helper notice: "User ID is the OA-scoped user ID, not a phone number"

#### Conversation Resource
- [ ] Operation: "Get Conversation History"
  - [ ] `userId` (string, required)
  - [ ] `offset` (number, default: 0)
  - [ ] `count` (number, default: 20)

#### Support Resource
- [ ] Operation: "Send Text"
  - [ ] `userId` (string, required)
  - [ ] `text` (string, required)
  - [ ] Helper notice: "Can only send within 7 days of last user interaction"

- [ ] Operation: "Send Image"
  - [ ] `userId` (string, required)
  - [ ] `imageSource` (options: "url" or "attachmentId")
  - [ ] `imageUrl` (string, conditional on imageSource)
  - [ ] `attachmentId` (string, conditional on imageSource)
  - [ ] `caption` (string, optional)

#### OA Info Resource
- [ ] Operation: "Get OA Information"
  - [ ] No additional fields needed

#### Token Resource
- [ ] Operation: "Refresh Access Token" (manual)
  - [ ] No fields
  - [ ] Helper notice: "Tokens auto-refresh on API calls. Use this for manual refresh only."

### execute() Method Refactoring
- [ ] Load credentials and validate
- [ ] Switch on `resource` instead of if-else chain
- [ ] For each resource/operation:
  - [ ] Get node parameters
  - [ ] Validate required fields
  - [ ] Call `zaloApiRequest()` with proper arguments
  - [ ] Handle errors (already thrown by `zaloApiRequest()`)
  - [ ] Return result with `pairedItem`

### Token Resource Execution
- [ ] Call `zaloRefreshAccessToken()`
- [ ] Update `credentials` object in-memory
- [ ] Call `persistTokensToCredential()` (non-blocking)
- [ ] Return success response with:
  - [ ] `success: true`
  - [ ] `access_token` (new token)
  - [ ] `refresh_token` (new token)
  - [ ] `credentialUpdated` (boolean)
  - [ ] `message` (status message)

### Message Resource Execution
- [ ] Get all required parameters
- [ ] Parse/format template data using `formatZaloTemplateData()`
- [ ] Build request body (phone, template_id, template_data, sending_mode, tracking_id)
- [ ] Call `zaloApiRequest(POST, ZALO_ZBS_API_BASE, '/message/template', ...)`
- [ ] Return API response

### User Resource Execution (Get List)
- [ ] Get parameters (offset, count, tagName, lastInteractionPeriod, isFollower)
- [ ] Build request data
- [ ] Call `zaloApiRequest(GET, ZALO_API_BASE, '/v3.0/oa/user/getlist', ...)`
- [ ] Return API response

### User Resource Execution (Get Detail)
- [ ] Get userId
- [ ] Call `zaloApiRequest(GET, ZALO_API_BASE, '/v3.0/oa/user/detail', ...)`
- [ ] Return API response

### Conversation Resource Execution
- [ ] Get parameters (userId, offset, count)
- [ ] Call `zaloApiRequest(GET, ZALO_API_BASE, '/v2.0/oa/conversation', ...)`
- [ ] Return API response

### Support Resource Execution (Send Text)
- [ ] Get userId and text
- [ ] Build message body
- [ ] Call `zaloApiRequest(POST, ZALO_OA_API_BASE, '/v3.0/oa/message/cs', ...)`
- [ ] Return API response

### Support Resource Execution (Send Image)
- [ ] Get userId, imageSource, image details
- [ ] Validate conditional fields
- [ ] Build media element and message
- [ ] Call `zaloApiRequest(POST, ZALO_OA_API_BASE, '/v3.0/oa/message/cs', ...)`
- [ ] Return API response

### OA Info Resource Execution
- [ ] Call `zaloApiRequest(GET, ZALO_OA_API_BASE, '/v2.0/oa/getoa', ...)`
- [ ] Return API response

---

## Phase 5: Code Quality & Testing

### TypeScript & Linting
- [ ] Fix TypeScript strict mode errors
- [ ] Run ESLint: `npm run lint`
- [ ] Fix any linting issues

### Build
- [ ] Run build: `npm run build`
- [ ] Check for build errors
- [ ] Verify dist/ output

### Manual Testing Checklist
- [ ] Test credential creation with all fields
- [ ] Test credential validation (test button)
- [ ] Test Message resource:
  - [ ] Send ZBS template (valid phone, template, data)
  - [ ] With tracking ID
  - [ ] With different sending modes
  - [ ] Error: invalid phone
  - [ ] Error: invalid template
  - [ ] Error: template data mismatch

- [ ] Test User resource:
  - [ ] Get list (with/without filters)
  - [ ] Get profile (valid user ID)
  - [ ] Error: invalid user ID

- [ ] Test Conversation resource:
  - [ ] Get conversation (valid user)
  - [ ] Pagination (offset/count)

- [ ] Test Support resource:
  - [ ] Send text message
  - [ ] Send image (with URL)
  - [ ] Send image (with attachment ID)
  - [ ] Error: outside 7-day window

- [ ] Test OA Info resource:
  - [ ] Get OA profile

- [ ] Test Token Refresh:
  - [ ] Manual refresh (Token resource)
  - [ ] Verify credential is updated (check URL)
  - [ ] Simulate expired token and test auto-refresh during API call

### Error Scenarios
- [ ] Expired token auto-refresh and retry
- [ ] Failed refresh (invalid credentials)
- [ ] Rate limit error
- [ ] Network timeout
- [ ] Invalid parameters
- [ ] Missing required fields

---

## Phase 6: Documentation

- [ ] Update README.md (if needed)
  - [ ] Document new auto-refresh behavior
  - [ ] Document collection fields for template data
  - [ ] Examples for each operation

- [ ] Update CHANGELOG.md
  - [ ] Version bump
  - [ ] List all improvements
  - [ ] Breaking changes (if any)
  - [ ] Migration guide (if needed)

- [ ] Add inline JSDoc comments
  - [ ] All function headers
  - [ ] Complex logic sections
  - [ ] Zalo API endpoint details

---

## Phase 7: Package & Release

- [ ] Verify package.json version is bumped
- [ ] Run full test suite: `npm test` (if available)
- [ ] Create tag: `git tag v{version}`
- [ ] Push to GitHub with release notes
- [ ] Test in n8n workflow (if possible)

---

## 🎯 Key Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Test coverage | 80%+ | - |
| Build time | < 30s | - |
| Error message clarity | ≥ 4/5 | - |
| Auto-refresh success rate | > 95% | - |
| Token persistence success | > 90% | - |

---

## 📝 Notes & Issues

### Known Limitations
- [ ] Document any n8n version requirements
- [ ] Document any Zalo API version requirements
- [ ] Known edge cases

### Future Improvements (Out of Scope)
- [ ] OAuth2 flow for token generation (currently requires manual token)
- [ ] Webhook signature verification (placeholder in credential)
- [ ] Batch messaging operations
- [ ] Rate limit queue/backoff strategy

---

## 🔄 Rollback Plan

If issues are found:
1. [ ] Revert to previous branch: `git checkout main`
2. [ ] Publish hotfix from stable version
3. [ ] Document what went wrong
4. [ ] Fix and retry

---

**Last Updated**: 2026-08-20
**Estimated Duration**: 8-12 hours
**Complexity**: High
**Risk Level**: Medium (backward compatibility maintained)
