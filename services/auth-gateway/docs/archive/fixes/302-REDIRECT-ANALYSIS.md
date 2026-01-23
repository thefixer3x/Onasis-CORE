# 302 Redirect Analysis - OAuth Authorize Endpoint

**Date:** 2025-11-24  
**Request:** `GET /oauth/authorize?client_id=vscode-extension&...`  
**Response:** `302 Redirect` to `http://localhost:8080/callback?code=...`

---

## ✅ **302 is CORRECT - Not an Error!**

A **302 redirect is the expected OAuth2 response** when:
1. ✅ User is authenticated (session cookie present)
2. ✅ Authorization code is generated successfully
3. ✅ Server redirects back to client's `redirect_uri` with the authorization code

**This is working as designed!**

---

## ⚠️ **However, There's a Critical Issue**

### **Invalid PKCE Parameters**

Looking at your request URL:
```
code_challenge=JAM_DOES_NOT_SAVE_SECRETS
code_challenge_method=JAM_DOES_NOT_SAVE_SECRETS
```

**These are NOT valid PKCE values!**

### **What Should Be Sent:**

1. **code_challenge_method** should be:
   - `S256` (SHA256 - recommended)
   - `plain` (not recommended)

2. **code_challenge** should be:
   - Base64URL-encoded SHA256 hash of `code_verifier`
   - 43-256 characters long
   - Example: `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`

### **Validation Schema:**

```typescript
// From oauth.controller.ts:30-31
code_challenge: z.string().min(43).max(256),
code_challenge_method: z.enum(['S256', 'plain']).default('S256'),
```

**Problem:** 
- `JAM_DOES_NOT_SAVE_SECRETS` is only 23 characters (fails `min(43)` check)
- `JAM_DOES_NOT_SAVE_SECRETS` is not in enum `['S256', 'plain']`

**But the request succeeded!** This suggests:
1. The validation might be using the default `'S256'` for `code_challenge_method`
2. The `code_challenge` validation might be lenient or bypassed
3. Or the extension is somehow bypassing validation

---

## 🔍 **Why This Will Fail Later**

When the IDE extension tries to exchange the authorization code for tokens:

```http
POST /oauth/token
grant_type=authorization_code
&code=nahEg11tvmkVAZxBcwCKYQ0mTRtjE4vinnrXGo2ATCFlOZAIuFzE27CdNs5PLUiF
&code_verifier=<original_verifier>
```

**The PKCE verification will fail** because:
1. The stored `code_challenge` is `JAM_DOES_NOT_SAVE_SECRETS` (invalid)
2. The `code_verifier` won't match this challenge
3. Server will return: `invalid_grant: Invalid code_verifier`

---

## 🐛 **Root Cause: IDE Extension Issue**

The VSCode/Cursor extension is:
1. **Not generating proper PKCE values** - sending placeholder text instead
2. **Not storing the code_verifier** - using `JAM_DOES_NOT_SAVE_SECRETS` as placeholder
3. **Not computing SHA256 hash** - should compute `SHA256(code_verifier)` → base64url

---

## 🔧 **Fix Required in IDE Extension**

The extension needs to:

1. **Generate code_verifier:**
   ```typescript
   const codeVerifier = base64url(crypto.randomBytes(32)); // 43 chars
   ```

2. **Compute code_challenge:**
   ```typescript
   const codeChallenge = base64url(
     crypto.createHash('sha256')
       .update(codeVerifier)
       .digest()
   );
   ```

3. **Store code_verifier securely:**
   ```typescript
   await context.secrets.store('lanonasis_code_verifier', codeVerifier);
   ```

4. **Send proper values:**
   ```
   code_challenge=<computed_SHA256_hash>
   code_challenge_method=S256
   ```

5. **Use stored verifier for token exchange:**
   ```typescript
   const codeVerifier = await context.secrets.get('lanonasis_code_verifier');
   // Send in token request
   ```

---

## 📊 **Current Flow (Broken)**

```
1. Extension sends: code_challenge=JAM_DOES_NOT_SAVE_SECRETS ❌
2. Server accepts (should reject but doesn't) ⚠️
3. Server generates auth code ✅
4. Server redirects 302 with code ✅
5. Extension receives code ✅
6. Extension tries to exchange code ❌
   - Sends code_verifier (if it has one)
   - Server verifies: SHA256(verifier) === "JAM_DOES_NOT_SAVE_SECRETS"
   - FAILS: invalid_grant
```

---

## ✅ **Expected Flow (Fixed)**

```
1. Extension generates code_verifier (random 43+ chars)
2. Extension computes code_challenge = SHA256(verifier) → base64url
3. Extension stores code_verifier securely
4. Extension sends: code_challenge=<hash>, code_challenge_method=S256 ✅
5. Server validates and generates auth code ✅
6. Server redirects 302 with code ✅
7. Extension receives code ✅
8. Extension exchanges code with stored code_verifier ✅
9. Server verifies: SHA256(verifier) === stored_challenge ✅
10. Server returns tokens ✅
```

---

## 🧪 **Testing**

### **Check if validation is working:**
```bash
# This should fail validation
curl "https://auth.lanonasis.com/oauth/authorize?\
client_id=vscode-extension&\
response_type=code&\
redirect_uri=http://localhost:8080/callback&\
code_challenge=JAM_DOES_NOT_SAVE_SECRETS&\
code_challenge_method=JAM_DOES_NOT_SAVE_SECRETS"
```

### **Check stored authorization code:**
```sql
SELECT 
    code_challenge,
    code_challenge_method,
    created_at
FROM auth_gateway.oauth_authorization_codes
WHERE client_id = 'vscode-extension'
ORDER BY created_at DESC
LIMIT 5;
```

---

## 🎯 **Action Items**

1. ✅ **302 redirect is working correctly** - this is not an error
2. ⚠️ **Fix IDE extension** to generate proper PKCE values
3. ⚠️ **Strengthen server validation** to reject invalid `code_challenge` values
4. ⚠️ **Add logging** to track when invalid PKCE values are accepted

---

## 📝 **Server-Side Validation Enhancement**

Consider adding stricter validation:

```typescript
// In oauth.controller.ts, after line 93
if (payload.code_challenge_method === 'S256') {
  // Validate code_challenge is base64url format (43-128 chars, URL-safe)
  const base64urlPattern = /^[A-Za-z0-9_-]{43,128}$/;
  if (!base64urlPattern.test(payload.code_challenge)) {
    throw new OAuthServiceError(
      'Invalid code_challenge format for S256 method',
      'invalid_request',
      400
    );
  }
}
```

This would reject `JAM_DOES_NOT_SAVE_SECRETS` as invalid.

---

## ✅ **Summary**

- **302 redirect = SUCCESS** ✅
- **Invalid PKCE parameters = WILL FAIL at token exchange** ❌
- **Fix needed in IDE extension** to generate proper PKCE values
- **Server validation could be stricter** to catch this earlier

