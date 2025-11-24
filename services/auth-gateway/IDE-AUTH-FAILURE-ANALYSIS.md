# IDE Authentication Failure Analysis

**Date:** 2025-11-24  
**Issue:** IDE auth failing even after successful user authentication - exchange seems to cut off somewhere

---

## 🔍 **Flow Summary**

### **Expected Flow:**
1. ✅ IDE opens browser → `/oauth/authorize?...` (with PKCE params)
2. ✅ If not authenticated → redirects to `/web/login?return_to=...`
3. ✅ User logs in → session cookie set → redirects back to `/oauth/authorize`
4. ✅ Authorization code generated → redirects to IDE callback with `code=...`
5. ❓ **IDE exchanges code for tokens** → `/oauth/token` (THIS IS WHERE IT FAILS)
6. ❌ Tokens not received → IDE auth fails

---

## 🔐 **SHA256 Implementation (Recent Change)**

### **What Changed:**
- Authorization codes are now **hashed with SHA256** before storage
- Tokens (access & refresh) are **hashed with SHA256** before storage
- PKCE code challenges use **SHA256** for S256 method

### **Key Files:**
- `src/utils/pkce.ts` - SHA256 hashing functions
- `src/services/oauth.service.ts` - Uses hashed codes/tokens
- Database stores only hashes, never plaintext

### **Security Model:**
```typescript
// Authorization code flow
code (plaintext) → SHA256 → code_hash (stored in DB)
code (from client) → SHA256 → lookup code_hash

// Token flow  
token (plaintext) → SHA256 → token_hash (stored in DB)
token (from client) → SHA256 → lookup token_hash
```

---

## 🐛 **Most Likely Failure Points**

### **1. Authorization Code Lookup Failing (HIGH PROBABILITY)**

**Symptom:** Token exchange returns `invalid_grant: Authorization code not found or expired`

**Why it happens:**
- Code hash mismatch (SHA256 calculation issue)
- Code expired (> 5 minutes)
- Code already consumed
- Cache miss + DB query fails

**Check:**
```sql
-- See recent codes
SELECT 
    id,
    client_id,
    consumed,
    expires_at,
    created_at,
    NOW() as now,
    EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_left
FROM auth_gateway.oauth_authorization_codes
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

**Debug:**
- Add logging in `consumeAuthorizationCode` to see hash comparison
- Check Redis cache is working
- Verify SHA256 implementation matches between create/consume

---

### **2. Session Cookie Not Persisting (MEDIUM PROBABILITY)**

**Symptom:** User logs in, but `/oauth/authorize` still redirects to login

**Why it happens:**
- Cookie domain mismatch
- Browser blocking cookies
- SameSite policy too strict
- Cookie not being sent on redirect

**Check:**
```bash
# In browser console after login
document.cookie
# Should show: lanonasis_session=...

# Check cookie attributes
# DevTools → Application → Cookies → lanonasis_session
# Domain: .lanonasis.com
# Path: /
# Secure: true (production)
# SameSite: Lax
```

**Fix:**
- Verify `COOKIE_DOMAIN=.lanonasis.com` in environment
- Check cookie is set with correct domain/path
- Ensure redirect preserves cookies

---

### **3. PKCE Verification Failing (MEDIUM PROBABILITY)**

**Symptom:** Token exchange returns `invalid_grant: Invalid code_verifier`

**Why it happens:**
- Client sends wrong `code_verifier`
- Base64URL encoding mismatch
- SHA256 calculation difference between client/server

**Check:**
```sql
-- Get stored challenge
SELECT code_challenge, code_challenge_method
FROM auth_gateway.oauth_authorization_codes
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 1;
```

**Debug:**
- Verify client is computing challenge correctly
- Check base64url encoding matches
- Add logging in `verifyCodeChallenge`

---

### **4. Redirect URI Mismatch (LOW PROBABILITY)**

**Symptom:** `invalid_grant: Redirect URI mismatch`

**Why it happens:**
- Different `redirect_uri` in token request vs authorize request
- URI encoding differences

**Fix:**
- Ensure client sends **exact same** URI in both requests

---

## 📋 **Immediate Action Items**

### **1. Check Recent OAuth Audit Logs**
```sql
SELECT 
    event_type,
    client_id,
    success,
    error_code,
    error_description,
    created_at
FROM auth_gateway.oauth_audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND (event_type LIKE '%token%' OR event_type LIKE '%authorize%')
ORDER BY created_at DESC
LIMIT 50;
```

This will show:
- If authorization codes are being generated
- If token exchanges are being attempted
- What errors are occurring

---

### **2. Check PM2 Logs for Specific Errors**
```bash
pm2 logs auth-gateway --lines 500 | grep -E "(token|authorize|invalid|error|failed)" | tail -100
```

Look for:
- `invalid_grant` errors
- `Authorization code not found`
- `Invalid code_verifier`
- Database connection errors
- Redis cache errors

---

### **3. Verify Session Cookie Flow**

**Test manually:**
```bash
# 1. Login
curl -v https://auth.lanonasis.com/web/login \
  -X POST \
  -d "email=<email>&password=<password>" \
  -c cookies.txt \
  -L

# 2. Check cookie
cat cookies.txt | grep lanonasis_session

# 3. Use cookie for authorize
curl -v "https://auth.lanonasis.com/oauth/authorize?client_id=cursor-extension&response_type=code&redirect_uri=http://localhost:8080/callback&code_challenge=test&code_challenge_method=S256" \
  -b cookies.txt \
  -L
```

---

### **4. Check Database State**

**Recent authorization codes:**
```sql
SELECT 
    client_id,
    consumed,
    expires_at > NOW() as not_expired,
    created_at,
    NOW() - created_at as age
FROM auth_gateway.oauth_authorization_codes
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Recent token issues:**
```sql
SELECT 
    token_type,
    client_id,
    revoked,
    expires_at > NOW() as not_expired,
    created_at
FROM auth_gateway.oauth_tokens
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## 🔧 **Code Locations to Review**

### **Authorization Code Creation:**
- `src/services/oauth.service.ts:212-253` - `createAuthorizationCode()`
- `src/utils/pkce.ts:40-42` - `hashAuthorizationCode()`

### **Authorization Code Consumption:**
- `src/services/oauth.service.ts:261-325` - `consumeAuthorizationCode()`
- Checks cache first, then database
- Validates expiration, consumption status, client match

### **Token Exchange:**
- `src/controllers/oauth.controller.ts:168-293` - `token()`
- `src/controllers/oauth.controller.ts:186-228` - authorization_code grant handling

### **PKCE Verification:**
- `src/utils/pkce.ts:21-38` - `verifyCodeChallenge()`
- `src/utils/pkce.ts:12-19` - `deriveCodeChallenge()`

### **Session Cookie Validation:**
- `src/middleware/session.ts:8-54` - `validateSessionCookie()`
- `src/utils/jwt.ts:48-60` - `verifyToken()`

---

## 🎯 **Recommended Next Steps**

1. **Run diagnostic queries** from `DIAGNOSE-OAUTH-FLOW.md`
2. **Check OAuth audit logs** for recent failures
3. **Review PM2 logs** for specific error messages
4. **Test session cookie** persistence manually
5. **Verify SHA256 hashing** is consistent between create/consume
6. **Check Redis cache** is working (if enabled)

---

## 📝 **Files Created**

1. **AUTH-GATEWAY-FLOW-TRACE.md** - Complete flow documentation
2. **DIAGNOSE-OAUTH-FLOW.md** - Diagnostic queries and tests
3. **IDE-AUTH-FAILURE-ANALYSIS.md** - This file (summary)

---

## 💡 **Key Insights**

1. **SHA256 is used throughout** - codes and tokens are hashed before storage
2. **Authorization codes expire in 5 minutes** - client must exchange quickly
3. **Session cookie is critical** - must persist across redirects
4. **PKCE verification is strict** - code_verifier must match exactly
5. **Cache is used for performance** - but DB is authoritative

---

## 🚨 **Critical Check: CSRF Errors in Logs**

Logs show CSRF token errors, but `/oauth/token` should NOT use CSRF (removed per `SECURITY_VERIFICATION.md`). These errors might be from:
- Other endpoints
- Old code still running
- Misconfigured middleware

**Verify:**
```typescript
// src/routes/oauth.routes.ts:43
router.post("/token", tokenRateLimit, oauthController.token);  // ✅ No CSRF middleware
```

---

## ✅ **Success Criteria**

IDE auth will work when:
- [ ] User can login and get session cookie
- [ ] Session cookie persists across redirects
- [ ] Authorization code is generated successfully
- [ ] Authorization code is found during token exchange
- [ ] PKCE verification succeeds
- [ ] Tokens are returned to IDE

---

**Next:** Run the diagnostic queries and share results to pinpoint exact failure point.

