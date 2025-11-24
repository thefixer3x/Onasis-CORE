# OAuth Flow Diagnostic Guide

## Quick Diagnostic Queries

### 1. Check Recent OAuth Events
```sql
SELECT 
    event_type,
    client_id,
    user_id,
    success,
    error_code,
    error_description,
    grant_type,
    created_at
FROM auth_gateway.oauth_audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 50;
```

### 2. Check Recent Authorization Codes
```sql
SELECT 
    id,
    client_id,
    user_id,
    code_challenge_method,
    redirect_uri,
    consumed,
    expires_at,
    created_at,
    NOW() as current_time,
    CASE 
        WHEN expires_at < NOW() THEN 'EXPIRED'
        WHEN consumed THEN 'CONSUMED'
        ELSE 'ACTIVE'
    END as status
FROM auth_gateway.oauth_authorization_codes
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

### 3. Check Recent Token Issues
```sql
SELECT 
    id,
    token_type,
    client_id,
    user_id,
    revoked,
    expires_at,
    created_at,
    NOW() as current_time,
    CASE 
        WHEN expires_at < NOW() THEN 'EXPIRED'
        WHEN revoked THEN 'REVOKED'
        ELSE 'ACTIVE'
    END as status
FROM auth_gateway.oauth_tokens
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

### 4. Check Active Sessions
```sql
SELECT 
    user_id,
    platform,
    expires_at,
    created_at,
    NOW() as current_time,
    CASE 
        WHEN expires_at < NOW() THEN 'EXPIRED'
        ELSE 'ACTIVE'
    END as status
FROM auth_gateway.sessions
WHERE expires_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

### 5. Check OAuth Clients Configuration
```sql
SELECT 
    client_id,
    client_name,
    status,
    require_pkce,
    allowed_code_challenge_methods,
    allowed_redirect_uris,
    allowed_scopes,
    default_scopes
FROM auth_gateway.oauth_clients
WHERE status = 'active'
ORDER BY client_name;
```

---

## Common Failure Scenarios

### Scenario 1: Authorization Code Not Generated
**Symptoms:**
- User authenticates successfully
- Redirects back to `/oauth/authorize`
- But no authorization code in database

**Check:**
```sql
-- Look for authorize_request events
SELECT * FROM auth_gateway.oauth_audit_log
WHERE event_type = 'authorize_request'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Possible Causes:**
- Session cookie not being read by `validateSessionCookie`
- User ID not found in `req.user.sub`
- Client validation failing

**Debug:**
- Check PM2 logs for errors during `createAuthorizationCode`
- Verify session cookie is set: `document.cookie` in browser console
- Check JWT token is valid: Decode `lanonasis_session` cookie

---

### Scenario 2: Authorization Code Expired Before Exchange
**Symptoms:**
- Code generated successfully
- But token exchange fails with "Authorization code expired"

**Check:**
```sql
-- Find codes that expired before being consumed
SELECT 
    id,
    client_id,
    created_at,
    expires_at,
    consumed,
    EXTRACT(EPOCH FROM (expires_at - created_at)) as ttl_seconds,
    EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
FROM auth_gateway.oauth_authorization_codes
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND consumed = FALSE
ORDER BY created_at DESC;
```

**Possible Causes:**
- Client takes too long to exchange code (> 5 minutes)
- Clock skew between servers
- `AUTH_CODE_TTL_SECONDS` set too low

**Fix:**
- Increase `AUTH_CODE_TTL_SECONDS` in environment
- Ensure client exchanges code immediately after receiving it

---

### Scenario 3: PKCE Verification Fails
**Symptoms:**
- Code found and not expired
- But token exchange fails with "Invalid code_verifier"

**Check:**
```sql
-- Get the stored challenge for debugging
SELECT 
    id,
    client_id,
    code_challenge,
    code_challenge_method,
    created_at
FROM auth_gateway.oauth_authorization_codes
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;
```

**Possible Causes:**
- Client sends wrong `code_verifier`
- Base64URL encoding mismatch
- SHA256 calculation difference

**Debug:**
Add logging in `src/utils/pkce.ts:verifyCodeChallenge`:
```typescript
console.log('PKCE Debug:', {
    verifier: verifier.substring(0, 20) + '...',
    expectedChallenge: expectedChallenge,
    method,
    derived: deriveCodeChallenge(verifier, method),
    match: derived === expectedChallenge
})
```

---

### Scenario 4: Session Cookie Not Persisting
**Symptoms:**
- Login succeeds
- Cookie set in response
- But next request doesn't have cookie

**Check:**
1. Browser DevTools → Application → Cookies
   - Look for `lanonasis_session` cookie
   - Check domain: should be `.lanonasis.com`
   - Check path: should be `/`
   - Check Secure: should be true in production
   - Check SameSite: should be `Lax`

2. Verify cookie domain matches:
```bash
# Check environment variable
echo $COOKIE_DOMAIN
# Should be: .lanonasis.com
```

3. Test cookie setting:
```bash
curl -v https://auth.lanonasis.com/web/login \
  -X POST \
  -d "email=test@example.com&password=test" \
  -c cookies.txt \
  -L

# Check if cookie was set
cat cookies.txt | grep lanonasis_session
```

**Possible Causes:**
- Cookie domain mismatch
- Browser blocking third-party cookies
- SameSite policy too strict
- HTTPS required but using HTTP

---

### Scenario 5: Redirect URI Mismatch
**Symptoms:**
- Authorization code generated
- Token exchange fails with "Redirect URI mismatch"

**Check:**
```sql
-- Compare stored redirect_uri with client config
SELECT 
    ac.id,
    ac.client_id,
    ac.redirect_uri as code_redirect_uri,
    oc.allowed_redirect_uris as client_allowed_uris
FROM auth_gateway.oauth_authorization_codes ac
JOIN auth_gateway.oauth_clients oc ON ac.client_id = oc.client_id
WHERE ac.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ac.created_at DESC
LIMIT 5;
```

**Possible Causes:**
- Client sends different `redirect_uri` in token request
- URI encoding differences (trailing slash, query params)
- Case sensitivity

**Fix:**
- Ensure client sends **exact same** `redirect_uri` in both requests
- Normalize URIs (remove trailing slashes, lowercase)

---

## Step-by-Step Manual Test

### Test 1: Check Service Health
```bash
curl https://auth.lanonasis.com/health
```

Expected: `{"status":"ok",...}`

---

### Test 2: Check OAuth Client Exists
```sql
SELECT * FROM auth_gateway.oauth_clients 
WHERE client_id = 'cursor-extension' 
  AND status = 'active';
```

---

### Test 3: Simulate Login Flow
```bash
# 1. Login (get session cookie)
curl -v https://auth.lanonasis.com/web/login \
  -X POST \
  -d "email=<your_email>&password=<your_password>" \
  -c cookies.txt \
  -L

# 2. Check cookie was set
cat cookies.txt

# 3. Use cookie to access authorize endpoint
curl -v "https://auth.lanonasis.com/oauth/authorize?\
client_id=cursor-extension&\
response_type=code&\
redirect_uri=http://localhost:8080/callback&\
code_challenge=test_challenge_base64url&\
code_challenge_method=S256&\
state=test_state" \
  -b cookies.txt \
  -L
```

Expected: Redirect to `http://localhost:8080/callback?code=<auth_code>&state=test_state`

---

### Test 4: Exchange Code for Tokens
```bash
# Extract code from previous redirect
AUTH_CODE="<code_from_previous_step>"
CODE_VERIFIER="<original_verifier>"

curl -X POST https://auth.lanonasis.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&\
code=${AUTH_CODE}&\
redirect_uri=http://localhost:8080/callback&\
client_id=cursor-extension&\
code_verifier=${CODE_VERIFIER}"
```

Expected: JSON with `access_token`, `refresh_token`, etc.

---

## PM2 Log Monitoring

### Watch OAuth Events in Real-Time
```bash
pm2 logs auth-gateway --lines 0 | grep -E "(oauth|authorize|token|error)"
```

### Check for Specific Errors
```bash
pm2 logs auth-gateway --lines 1000 | grep -i "invalid\|error\|failed" | tail -50
```

---

## Environment Variables to Check

```bash
# Required for OAuth flow
echo "COOKIE_DOMAIN: $COOKIE_DOMAIN"
echo "JWT_SECRET: ${JWT_SECRET:0:10}..."
echo "AUTH_CODE_TTL_SECONDS: $AUTH_CODE_TTL_SECONDS"
echo "ACCESS_TOKEN_TTL_SECONDS: $ACCESS_TOKEN_TTL_SECONDS"
echo "REFRESH_TOKEN_TTL_SECONDS: $REFRESH_TOKEN_TTL_SECONDS"
```

Expected values:
- `COOKIE_DOMAIN=.lanonasis.com`
- `AUTH_CODE_TTL_SECONDS=300` (5 minutes)
- `ACCESS_TOKEN_TTL_SECONDS=900` (15 minutes)
- `REFRESH_TOKEN_TTL_SECONDS=2592000` (30 days)

---

## Next Steps

1. **Run diagnostic queries** above to identify failure point
2. **Check PM2 logs** for specific error messages
3. **Test manually** using curl commands
4. **Verify environment variables** are set correctly
5. **Check database** for authorization codes and tokens
6. **Review browser console** for cookie/session issues

If issue persists, share:
- Results of diagnostic queries
- Relevant PM2 log entries
- Browser console errors
- Network request/response details

