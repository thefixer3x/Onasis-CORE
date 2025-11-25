# CSP and Authentication Fixes

**Date:** 2025-11-24

---

## ✅ **Issue 1: CSP Violation Blocking Login Form - FIXED**

### **Error:**
```
Sending form data to 'https://auth.lanonasis.com/web/login' violates the following 
Content Security Policy directive: "form-action 'self'". The request has been blocked.
```

### **Root Cause:**
- `oauthSecurityHeaders` middleware was applying strict CSP to ALL routes
- When user redirected from `/oauth/authorize` to `/web/login`, CSP was still active
- `form-action 'self'` was blocking form submission to `/web/login`

### **Fix Applied:**
**File:** `onasis-core/services/auth-gateway/src/middleware/cors.ts:101-106`

```typescript
export function oauthSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
    // Strict CSP for OAuth endpoints
    // Only apply to OAuth routes, not web routes (web routes need form submission)
    if (req.path.startsWith('/web/')) {
        return next() // Skip CSP for web routes
    }
    
    // Strict CSP for OAuth endpoints only
    res.setHeader('Content-Security-Policy', "...")
}
```

**Result:** Web routes (like `/web/login`) no longer have restrictive CSP, allowing form submission.

---

## ✅ **Issue 2: Master API Key Authentication Failing - FIXED**

### **Error:**
```
Failed to load memories: Invalid authentication credentials
```

### **Root Cause:**
- IDE extension hashes API keys client-side before sending: `ensureApiKeyHashBrowser(apiKey)`
- mcp-core was only checking raw master API key: `key === masterApiKey`
- Hashed key never matched raw key, causing authentication failure

### **Fix Applied:**
**File:** `mcp-core/src/core/auth-handler.ts:191-240`

```typescript
async authenticateApiKey(key: string): Promise<AuthenticationResult> {
  const masterApiKey = process.env.MASTER_API_KEY;
  if (masterApiKey) {
    // Check raw key match
    if (key === masterApiKey) {
      // ... authenticate
    }
    
    // Check hashed key match (for client-side hashed keys)
    const hashedMasterKey = crypto.createHash('sha256').update(masterApiKey).digest('hex');
    if (key === hashedMasterKey || key.toLowerCase() === hashedMasterKey.toLowerCase()) {
      // ... authenticate
    }
  }
}
```

**Result:** Master API key authentication now works with both:
- Raw keys (for server-to-server)
- Hashed keys (for IDE extensions that hash client-side)

---

## 🔍 **Why IDE Extension Hashes Keys**

The IDE extension uses `ensureApiKeyHashBrowser()` to hash keys before sending:
- **Security:** Raw keys never leave the client
- **Consistency:** All API keys are hashed before transmission
- **Standard:** Matches the database storage format (SHA-256 hashes)

**Location:** `lanonasis-maas/IDE-EXTENSIONS/vscode-extension/src/services/memory-client-sdk.ts:89`

```typescript
if (this.config.apiKey && !this.config.authToken) {
  headers['X-API-Key'] = await ensureApiKeyHashBrowser(this.config.apiKey);
}
```

---

## 📋 **Testing**

### **Test CSP Fix:**
1. Navigate to `/oauth/authorize` (should redirect to `/web/login` if not authenticated)
2. Fill in login form
3. Submit form
4. **Expected:** Form submits successfully, no CSP violation

### **Test Master API Key:**
```bash
# Test with raw key
curl -H "X-API-Key: lano_master_key_2024" \
  https://mcp.lanonasis.com/api/v1/memory

# Test with hashed key (what IDE sends)
HASHED=$(echo -n "lano_master_key_2024" | sha256sum | cut -d' ' -f1)
curl -H "X-API-Key: $HASHED" \
  https://mcp.lanonasis.com/api/v1/memory
```

Both should return `200 OK` with memory data.

---

## 🚀 **Deployment**

1. **Rebuild auth-gateway:**
   ```bash
   cd /opt/lanonasis/onasis-core/services/auth-gateway
   npm run build
   pm2 restart auth-gateway
   ```

2. **Rebuild mcp-core:**
   ```bash
   cd /opt/lanonasis/mcp-core
   npm run build
   pm2 restart mcp-core
   ```

3. **Verify:**
   - Login form should work without CSP errors
   - IDE memory access should work with master API key

---

## 📝 **Files Modified**

1. `/opt/lanonasis/onasis-core/services/auth-gateway/src/middleware/cors.ts` - Skip CSP for web routes
2. `/opt/lanonasis/mcp-core/src/core/auth-handler.ts` - Support hashed master API keys

---

## ✅ **Status**

- [x] CSP violation fixed
- [x] Master API key authentication fixed (supports both raw and hashed)
- [ ] TypeScript errors in memory-tool.ts need fixing (separate issue)
- [ ] Services need to be rebuilt and restarted

