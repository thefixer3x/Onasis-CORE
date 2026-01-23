# Auth Gateway OAuth2 PKCE Flow Trace

**Date:** 2025-11-24  
**Service:** auth-gateway (PM2)  
**Database:** Neon DB  
**Supabase:** Used for user authentication

---

## 🔄 Complete OAuth2 PKCE Flow

### **Step 1: IDE Initiates OAuth Flow**

**Client (VSCode/Cursor Extension):**
1. Generates `code_verifier` (43-128 chars, URL-safe)
2. Computes `code_challenge = SHA256(code_verifier)` (base64url encoded)
3. Opens browser to authorization endpoint:

```
GET /oauth/authorize?
  client_id=cursor-extension
  &response_type=code
  &redirect_uri=http://localhost:8080/callback
  &code_challenge=<SHA256_hash>
  &code_challenge_method=S256
  &state=<user_state>
  &scope=memories:read memories:write
```

**Location:** `src/routes/oauth.routes.ts:35-41`
- Middleware chain: `authorizeRateLimit` → `generateAuthorizeCSRF` → `validateSessionCookie` → `authorize`

---

### **Step 2: Authorization Endpoint Processing**

**File:** `src/controllers/oauth.controller.ts:85-166`

**Flow:**
1. **Validate Request** (line 86-93)
   - Parse query params with Zod schema
   - Must include: `client_id`, `response_type=code`, `redirect_uri`, `code_challenge`, `code_challenge_method`

2. **Check Authentication** (line 96-102)
   ```typescript
   const userId = req.user?.sub  // From validateSessionCookie middleware
   
   if (!userId) {
       // Redirect to login with return URL
       return res.redirect(`/web/login?return_to=${encodeURIComponent(returnUrl)}`)
   }
   ```

3. **Validate Client** (line 105-108)
   - Lookup `oauth_clients` table by `client_id`
   - Check client is `active`
   - Uses cache: `OAuthClientCache.get(clientId)`

4. **Validate Redirect URI** (line 110-112)
   - Must be in `client.allowed_redirect_uris` array

5. **Validate PKCE Method** (line 114-117)
   - Must be in `client.allowed_code_challenge_methods` (usually `['S256']`)

6. **Resolve Scopes** (line 119)
   - Filter requested scopes against `client.allowed_scopes`
   - Use `client.default_scopes` if none requested

7. **Generate Authorization Code** (line 121-131)
   ```typescript
   const result = await createAuthorizationCode({
       client,
       userId,
       redirectUri: payload.redirect_uri,
       scope: scopes,
       state: payload.state,
       codeChallenge: payload.code_challenge,
       codeChallengeMethod: method,
       ipAddress: req.ip,
       userAgent: req.get('user-agent'),
   })
   ```

8. **Redirect to Client** (line 144-150)
   ```typescript
   const redirectUrl = new URL(payload.redirect_uri)
   redirectUrl.searchParams.set('code', result.authorizationCode)
   if (payload.state) {
       redirectUrl.searchParams.set('state', payload.state)
   }
   return res.redirect(302, redirectUrl.toString())
   ```

**Result:** Browser redirects to `http://localhost:8080/callback?code=<auth_code>&state=<state>`

---

### **Step 3: Authorization Code Generation (SHA256 Hashing)**

**File:** `src/services/oauth.service.ts:212-253`

**Process:**
1. **Generate Opaque Token** (line 217)
   ```typescript
   const authorizationCode = generateOpaqueToken(48)  // 48 bytes = 64 base64url chars
   ```

2. **Hash with SHA256** (line 218)
   ```typescript
   const hashedCode = hashAuthorizationCode(authorizationCode)
   // Implementation: crypto.createHash('sha256').update(code).digest('hex')
   ```

3. **Store in Database** (line 221-242)
   ```sql
   INSERT INTO auth_gateway.oauth_authorization_codes (
       code_hash,           -- SHA256 hash of the code
       client_id,
       user_id,
       code_challenge,      -- Original challenge from client
       code_challenge_method,
       redirect_uri,
       scope,
       state,
       expires_at,          -- NOW() + 5 minutes (AUTH_CODE_TTL_SECONDS)
       ip_address,
       user_agent
   ) VALUES (...)
   ```

4. **Cache in Redis** (line 247)
   ```typescript
   await AuthCodeCache.set(hashedCode, record, AUTH_CODE_TTL_SECONDS)
   ```

**Key Security Points:**
- ✅ Code is **never stored in plaintext** - only SHA256 hash
- ✅ Code expires in **5 minutes** (configurable via `AUTH_CODE_TTL_SECONDS`)
- ✅ Code can only be used **once** (consumed flag)

---

### **Step 4: User Authentication (If Not Logged In)**

**File:** `src/routes/web.routes.ts:14-264`

**Flow if user not authenticated:**

1. **Redirect to Login** (line 101 in oauth.controller.ts)
   ```
   GET /web/login?return_to=/oauth/authorize?client_id=...&...
   ```

2. **Render Login Form** (line 14-155)
   - HTML form with email/password
   - Hidden field: `return_to` parameter

3. **Submit Login** (line 161-264)
   ```typescript
   POST /web/login
   Body: { email, password, return_to }
   ```

4. **Authenticate with Supabase** (line 170-173)
   ```typescript
   const { data, error } = await supabaseAdmin.auth.signInWithPassword({
       email,
       password,
   })
   ```

5. **Generate JWT Session Token** (line 200-205)
   ```typescript
   const tokens = generateTokenPair({
       sub: data.user.id,
       email: data.user.email!,
       role: data.user.role || 'authenticated',
       platform: 'web',
   })
   ```

6. **Set Session Cookie** (line 233-240)
   ```typescript
   res.cookie('lanonasis_session', tokens.access_token, {
       domain: '.lanonasis.com',
       httpOnly: true,
       secure: true,  // Production
       sameSite: 'lax',
       maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
       path: '/',
   })
   ```

7. **Redirect Back to OAuth** (line 257-259)
   ```typescript
   const redirectUrl = return_to || `${dashboardUrl}/dashboard/home`
   return res.redirect(redirectUrl)
   ```
   - This redirects back to `/oauth/authorize?...` with original params
   - Now `validateSessionCookie` middleware will find `req.user` from cookie

---

### **Step 5: Token Exchange (Critical Step)**

**File:** `src/controllers/oauth.controller.ts:168-293`

**Client Request:**
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<authorization_code_from_step_2>
&redirect_uri=http://localhost:8080/callback
&client_id=cursor-extension
&code_verifier=<original_verifier>
```

**Processing Flow:**

1. **Validate Request Schema** (line 169-176)
   ```typescript
   const parseResult = tokenRequestSchema.safeParse(req.body)
   // Validates: grant_type, code, redirect_uri, client_id, code_verifier
   ```

2. **Get Client** (line 181-184)
   ```typescript
   const client = await getClient(payload.client_id)
   ```

3. **Consume Authorization Code** (line 187-191)
   ```typescript
   const authorizationCode = await consumeAuthorizationCode({
       client,
       code: payload.code,
       redirectUri: payload.redirect_uri,
   })
   ```

   **Inside `consumeAuthorizationCode`** (`src/services/oauth.service.ts:261-325`):
   - Hash the provided code: `hashAuthorizationCode(payload.code)` → SHA256
   - Lookup in cache first: `AuthCodeCache.get(hashedCode)`
   - If not in cache, query database:
     ```sql
     SELECT * FROM auth_gateway.oauth_authorization_codes
     WHERE code_hash = $1
     FOR UPDATE  -- Lock row for transaction
     ```
   - Validate:
     - ✅ Code exists
     - ✅ Belongs to correct client
     - ✅ Redirect URI matches
     - ✅ Not already consumed
     - ✅ Not expired
   - Mark as consumed:
     ```sql
     UPDATE oauth_authorization_codes
     SET consumed = TRUE, consumed_at = NOW()
     WHERE id = $1
     ```
   - Invalidate cache: `AuthCodeCache.consume(hashedCode)`

4. **Verify PKCE** (line 193-199)
   ```typescript
   if (!verifyCodeChallenge(
       payload.code_verifier,
       authorizationCode.code_challenge,
       authorizationCode.code_challenge_method
   )) {
       throw new OAuthServiceError('Invalid code_verifier', 'invalid_grant', 400)
   }
   ```

   **PKCE Verification** (`src/utils/pkce.ts:21-38`):
   ```typescript
   // Recompute challenge from verifier
   const derived = deriveCodeChallenge(verifier, method)
   // For S256: SHA256(verifier) → base64url
   
   // Constant-time comparison
   return crypto.timingSafeEqual(derived, expectedChallenge)
   ```

5. **Issue Token Pair** (line 201-207)
   ```typescript
   const tokenPair = await issueTokenPair({
       client,
       userId: authorizationCode.user_id,
       scope: authorizationCode.scope ?? [],
       ipAddress: req.ip,
       userAgent: req.get('user-agent'),
   })
   ```

   **Inside `issueTokenPair`** (`src/services/oauth.service.ts:392-435`):
   - Generate **refresh token** (64 bytes, SHA256 hashed)
   - Generate **access token** (48 bytes, SHA256 hashed)
   - Store both in `oauth_tokens` table with SHA256 hashes
   - Link access token to refresh token via `parent_token_id`

6. **Return Tokens** (line 220-227)
   ```json
   {
       "token_type": "Bearer",
       "access_token": "<opaque_token_string>",
       "expires_in": 900,  // 15 minutes (ACCESS_TOKEN_TTL_SECONDS)
       "refresh_token": "<opaque_token_string>",
       "refresh_expires_in": 2592000,  // 30 days (REFRESH_TOKEN_TTL_SECONDS)
       "scope": "memories:read memories:write"
   }
   ```

---

## 🔍 **SHA256 Implementation Details**

### **Where SHA256 is Used:**

1. **Authorization Code Hashing**
   - **File:** `src/utils/pkce.ts:40-42`
   ```typescript
   export function hashAuthorizationCode(code: string): string {
       return crypto.createHash('sha256').update(code).digest('hex')
   }
   ```
   - **Storage:** `oauth_authorization_codes.code_hash` (VARCHAR(255))

2. **Token Hashing**
   - **File:** `src/utils/pkce.ts:44-46`
   ```typescript
   export function hashToken(token: string): string {
       return crypto.createHash('sha256').update(token).digest('hex')
   }
   ```
   - **Storage:** `oauth_tokens.token_hash` (VARCHAR(255))

3. **PKCE Code Challenge**
   - **File:** `src/utils/pkce.ts:12-19`
   ```typescript
   export function deriveCodeChallenge(verifier: string, method: CodeChallengeMethod): string {
       if (method === 'plain') {
           return verifier
       }
       const digest = crypto.createHash('sha256').update(verifier).digest()
       return bufferToBase64Url(digest)  // Base64URL encoding
   }
   ```

### **Security Model:**
- ✅ **Opaque tokens** - No user data in tokens
- ✅ **SHA256 hashing** - Tokens stored as hashes in DB
- ✅ **One-time use** - Authorization codes consumed after exchange
- ✅ **Short TTLs** - Auth codes: 5 min, Access tokens: 15 min
- ✅ **PKCE protection** - Prevents authorization code interception attacks

---

## 🐛 **Potential Failure Points**

### **1. Session Cookie Not Set After Login**
**Symptom:** User logs in successfully but `/oauth/authorize` still redirects to login

**Check:**
- Cookie domain matches: `process.env.COOKIE_DOMAIN` (should be `.lanonasis.com`)
- Cookie path: `/`
- `sameSite: 'lax'` allows redirects from different origins
- Browser accepts cookies (check DevTools → Application → Cookies)

**Debug:**
```bash
# Check if session cookie is set
curl -v https://auth.lanonasis.com/web/login \
  -d "email=test@example.com&password=test" \
  -c cookies.txt

# Check cookie in response
cat cookies.txt | grep lanonasis_session
```

---

### **2. Authorization Code Not Found During Exchange**
**Symptom:** Token exchange returns `invalid_grant: Authorization code not found or expired`

**Possible Causes:**
- Code expired (> 5 minutes)
- Code already consumed
- Code hash mismatch (SHA256 calculation issue)
- Cache miss and DB query fails

**Debug:**
```sql
-- Check authorization codes
SELECT 
    id,
    client_id,
    user_id,
    expires_at,
    consumed,
    created_at,
    NOW() as current_time,
    EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry
FROM auth_gateway.oauth_authorization_codes
WHERE client_id = 'cursor-extension'
ORDER BY created_at DESC
LIMIT 10;
```

**Check Redis Cache:**
```bash
# If Redis is accessible
redis-cli
> KEYS auth_gateway:auth_code:*
> GET auth_gateway:auth_code:<hash>
```

---

### **3. PKCE Verification Fails**
**Symptom:** Token exchange returns `invalid_grant: Invalid code_verifier`

**Possible Causes:**
- Client sends wrong `code_verifier`
- Challenge method mismatch (S256 vs plain)
- Base64URL encoding issue

**Debug:**
```typescript
// In oauth.service.ts, add logging:
console.log('PKCE Verification:', {
    verifier: payload.code_verifier,
    storedChallenge: authorizationCode.code_challenge,
    method: authorizationCode.code_challenge_method,
    derived: deriveCodeChallenge(payload.code_verifier, authorizationCode.code_challenge_method)
})
```

---

### **4. CSRF Token Errors (From Logs)**
**Symptom:** `ForbiddenError: invalid csrf token`

**Note:** The `/oauth/token` endpoint **does NOT use CSRF** (removed per `SECURITY_VERIFICATION.md`). CSRF errors are likely from other endpoints.

**Check:**
- CSRF errors might be from `/oauth/authorize` GET requests
- Or from other endpoints using CSRF middleware

**Fix:** Ensure `/oauth/token` route doesn't have CSRF middleware:
```typescript
// src/routes/oauth.routes.ts:43
router.post("/token", tokenRateLimit, oauthController.token);  // ✅ No CSRF
```

---

### **5. Redirect URI Mismatch**
**Symptom:** `invalid_grant: Redirect URI mismatch`

**Check:**
```sql
-- Verify client redirect URIs
SELECT client_id, client_name, allowed_redirect_uris
FROM auth_gateway.oauth_clients
WHERE client_id = 'cursor-extension';
```

**Ensure:**
- Redirect URI in token request **exactly matches** URI in authorization request
- URI is in `allowed_redirect_uris` array

---

## 📊 **Database Schema Reference**

### **oauth_authorization_codes**
```sql
CREATE TABLE auth_gateway.oauth_authorization_codes (
    id UUID PRIMARY KEY,
    code_hash VARCHAR(255) UNIQUE NOT NULL,  -- SHA256 hash
    client_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    code_challenge VARCHAR(255) NOT NULL,    -- PKCE challenge
    code_challenge_method VARCHAR(10) NOT NULL,
    redirect_uri TEXT NOT NULL,
    scope TEXT[],
    state VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed BOOLEAN DEFAULT FALSE,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);
```

### **oauth_tokens**
```sql
CREATE TABLE auth_gateway.oauth_tokens (
    id UUID PRIMARY KEY,
    token_hash VARCHAR(255) UNIQUE NOT NULL,  -- SHA256 hash
    token_type VARCHAR(10) NOT NULL,           -- 'access' or 'refresh'
    client_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    scope TEXT[],
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    parent_token_id UUID  -- Links access token to refresh token
);
```

---

## 🔧 **Debugging Commands**

### **Check Recent OAuth Events**
```sql
SELECT 
    event_type,
    client_id,
    user_id,
    success,
    error_code,
    error_description,
    created_at
FROM auth_gateway.oauth_audit_log
ORDER BY created_at DESC
LIMIT 20;
```

### **Check Active Sessions**
```sql
SELECT 
    user_id,
    platform,
    expires_at,
    created_at,
    NOW() as current_time
FROM auth_gateway.sessions
WHERE expires_at > NOW()
ORDER BY created_at DESC;
```

### **Test Authorization Code Flow**
```bash
# 1. Get authorization code (requires authenticated session)
curl -v "https://auth.lanonasis.com/oauth/authorize?\
client_id=cursor-extension&\
response_type=code&\
redirect_uri=http://localhost:8080/callback&\
code_challenge=test_challenge&\
code_challenge_method=S256&\
state=test_state" \
  -H "Cookie: lanonasis_session=<session_token>"

# 2. Exchange code for tokens
curl -X POST "https://auth.lanonasis.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&\
code=<auth_code>&\
redirect_uri=http://localhost:8080/callback&\
client_id=cursor-extension&\
code_verifier=<original_verifier>"
```

---

## ✅ **Verification Checklist**

- [ ] User can access `/web/login` and authenticate
- [ ] Session cookie `lanonasis_session` is set after login
- [ ] Cookie domain is `.lanonasis.com`
- [ ] `/oauth/authorize` detects session cookie via `validateSessionCookie`
- [ ] Authorization code is generated and stored with SHA256 hash
- [ ] Authorization code is returned in redirect to client
- [ ] Client can exchange code for tokens at `/oauth/token`
- [ ] PKCE verification succeeds (code_verifier matches challenge)
- [ ] Tokens are returned with correct format
- [ ] Tokens are stored with SHA256 hashes in database
- [ ] Refresh token flow works (`grant_type=refresh_token`)

---

## 🚨 **Current Issue: IDE Auth Failing**

Based on logs showing CSRF errors and the flow trace above, the most likely issues are:

1. **Session cookie not persisting** after login redirect
2. **Authorization code lookup failing** (cache/DB issue)
3. **PKCE verification failing** (code_verifier mismatch)

**Next Steps:**
1. Check PM2 logs for specific error during token exchange
2. Verify session cookie is set and readable
3. Check database for authorization codes being created
4. Verify PKCE code_verifier is being sent correctly by IDE

