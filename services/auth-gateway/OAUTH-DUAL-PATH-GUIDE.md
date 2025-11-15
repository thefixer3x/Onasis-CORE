# OAuth Dual-Path Implementation Guide

**Status**: ✅ Ready for Deployment  
**Date**: November 12, 2025  
**Architecture**: Based on PORT_MAPPING_COMPLETE model

---

## 🎯 Overview

This implementation enables **simultaneous support** for both OAuth URL patterns:

1. **Pattern 1**: `/oauth/*` (Original)
   - Used by: VSCode Extensions, Windsurf IDE, Web Dashboard
   - Example: `https://api.lanonasis.com/oauth/authorize`

2. **Pattern 2**: `/api/v1/oauth/*` (CLI Compatible)
   - Used by: lanonasis-cli, REST API clients
   - Example: `https://api.lanonasis.com/api/v1/oauth/authorize`

Both patterns route to the **same OAuth handlers**, ensuring consistent behavior.

---

## 📋 Architecture (Port 4000)

```
┌─────────────────────────────────────────────────────────┐
│             NGINX (api.lanonasis.com:443)               │
│                          ↓                              │
│              Proxy to localhost:4000                    │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│         Auth-Gateway Service (Port 4000)                │
│         Running in PM2 Cluster Mode (x2)                │
│                                                         │
│  Route Mounting (src/index.ts):                        │
│  ├─ app.use('/oauth', oauthRoutes)        ← Pattern 1  │
│  └─ app.use('/api/v1/oauth', oauthRoutes) ← Pattern 2  │
│                                                         │
│  Both patterns share same route handlers:               │
│  ├─ /authorize   → oauth.controller.authorize()        │
│  ├─ /token       → oauth.controller.token()            │
│  ├─ /revoke      → oauth.controller.revoke()           │
│  └─ /introspect  → oauth.controller.introspect()       │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Neon PostgreSQL Database                   │
│  ├─ users                (user accounts)                │
│  ├─ sessions             (active sessions)              │
│  ├─ oauth_clients        (registered apps)              │
│  ├─ oauth_authorization_codes (PKCE codes)              │
│  ├─ oauth_tokens         (access & refresh tokens)      │
│  └─ oauth_audit_log      (audit trail)                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🔑 Supported Endpoints

### Pattern 1: `/oauth/*` (Original)

| Method | Endpoint            | Purpose                | Used By               |
| ------ | ------------------- | ---------------------- | --------------------- |
| GET    | `/oauth/authorize`  | Authorization request  | VSCode, Windsurf, Web |
| POST   | `/oauth/token`      | Token exchange/refresh | VSCode, Windsurf, Web |
| POST   | `/oauth/revoke`     | Token revocation       | VSCode, Windsurf, Web |
| POST   | `/oauth/introspect` | Token validation       | VSCode, Windsurf, Web |

### Pattern 2: `/api/v1/oauth/*` (CLI Compatible)

| Method | Endpoint                   | Purpose                | Used By       |
| ------ | -------------------------- | ---------------------- | ------------- |
| GET    | `/api/v1/oauth/authorize`  | Authorization request  | CLI, REST API |
| POST   | `/api/v1/oauth/token`      | Token exchange/refresh | CLI, REST API |
| POST   | `/api/v1/oauth/revoke`     | Token revocation       | CLI, REST API |
| POST   | `/api/v1/oauth/introspect` | Token validation       | CLI, REST API |

**Note**: All endpoints support OAuth2 PKCE (RFC 7636) with S256 challenge method.

---

## 🚀 Deployment

### Prerequisites

- SSH access to VPS (u139558452@69.49.243.218)
- auth-gateway service running on port 4000 via PM2
- Neon database configured with OAuth tables

### Deploy Using Automated Script

```bash
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/services/auth-gateway

# Run the deployment script
./deploy-oauth-dual-path.sh
```

The script will:

1. ✅ Verify implementation in src/index.ts
2. ✅ Test current production endpoints
3. ✅ Create backup of existing deployment
4. ✅ Upload updated files to VPS
5. ✅ Build TypeScript on VPS
6. ✅ Restart PM2 service (auth-gateway)
7. ✅ Verify both patterns are working

### Manual Deployment (Alternative)

If you prefer manual deployment:

```bash
# 1. SSH into VPS
ssh u139558452@69.49.243.218

# 2. Navigate to auth-gateway
cd /home/u139558452/domains/api.lanonasis.com/public_html

# 3. Backup current deployment
cp src/index.ts src/index.ts.backup

# 4. Edit src/index.ts (add the dual-path mounting)
nano src/index.ts

# Find the route mounting section and ensure it has:
app.use('/oauth', oauthRoutes)
app.use('/api/v1/oauth', oauthRoutes)  # ← Add this line

# 5. Rebuild
npm run build

# 6. Restart PM2
pm2 restart auth-gateway
pm2 save

# 7. Check logs
pm2 logs auth-gateway --lines 50
```

---

## ✅ Verification

### Automated Testing

```bash
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/services/auth-gateway

# Run comprehensive test suite
./test-oauth-endpoints.sh
```

Expected output:

```
✅ PASS - GET /oauth/authorize
✅ PASS - POST /oauth/token
✅ PASS - POST /oauth/revoke
✅ PASS - POST /oauth/introspect
✅ PASS - GET /api/v1/oauth/authorize
✅ PASS - POST /api/v1/oauth/token
✅ PASS - POST /api/v1/oauth/revoke
✅ PASS - POST /api/v1/oauth/introspect

🎉 ALL TESTS PASSED!
```

### Manual Testing

```bash
# Test Pattern 1 (Original)
curl -I "https://api.lanonasis.com/oauth/authorize?client_id=test"
# Expected: HTTP/2 200

# Test Pattern 2 (CLI)
curl -I "https://api.lanonasis.com/api/v1/oauth/authorize?client_id=lanonasis-cli"
# Expected: HTTP/2 200
```

---

## 🔍 Troubleshooting

### Issue: `/api/v1/oauth/*` returns 404

**Cause**: Routes not properly mounted or PM2 not restarted

**Solution**:

```bash
ssh u139558452@69.49.243.218
cd /home/u139558452/domains/api.lanonasis.com/public_html

# Check if dual-path is in source
grep "app.use('/api/v1/oauth'" src/index.ts

# Rebuild and restart
npm run build
pm2 restart auth-gateway
pm2 logs auth-gateway --lines 30
```

### Issue: Both patterns return 502 Bad Gateway

**Cause**: auth-gateway service not running

**Solution**:

```bash
ssh u139558452@69.49.243.218
pm2 list
pm2 restart auth-gateway

# If still failing, check logs
pm2 logs auth-gateway --err
```

### Issue: OAuth flow fails with CORS error

**Cause**: CORS origin not configured

**Solution**:
Check `.env` file has correct CORS_ORIGIN:

```bash
CORS_ORIGIN=https://dashboard.lanonasis.com,https://mcp.lanonasis.com,http://localhost:*
```

---

## 📊 Implementation Details

### Code Changes

**File**: `src/index.ts`

```typescript
// Original route mounting (Line ~56)
app.use("/oauth", oauthRoutes);

// New dual-path support (Line ~60)
app.use("/api/v1/oauth", oauthRoutes);
```

**Rationale**:

- Express.js supports multiple route mountings
- Same handler serves both patterns
- Zero code duplication
- Maintains single source of truth for OAuth logic

### Route Handler Reuse

The `oauthRoutes` router (from `src/routes/oauth.routes.ts`) defines:

```typescript
router.get('/authorize', ...)    // Handles both:
                                  // - /oauth/authorize
                                  // - /api/v1/oauth/authorize

router.post('/token', ...)        // Handles both:
                                  // - /oauth/token
                                  // - /api/v1/oauth/token

router.post('/revoke', ...)       // Handles both:
                                  // - /oauth/revoke
                                  // - /api/v1/oauth/revoke

router.post('/introspect', ...)   // Handles both:
                                  // - /oauth/introspect
                                  // - /api/v1/oauth/introspect
```

No changes needed to route handlers or controllers!

---

## 🎨 Benefits of Dual-Path Approach

### For Users

✅ **Backward Compatible**: Existing VSCode/Windsurf integrations keep working  
✅ **CLI Friendly**: lanonasis-cli works with familiar `/api/v1/*` pattern  
✅ **Future-Proof**: Can add more API versions without breaking changes  
✅ **Flexible**: Choose pattern based on client type and use case

### For Developers

✅ **DRY Principle**: Single handler serves both patterns (no duplication)  
✅ **Easy Maintenance**: Update OAuth logic once, both patterns get the fix  
✅ **Clear Versioning**: `/api/v1/` prefix makes API version explicit  
✅ **Standard REST**: Follows REST API best practices for versioning

### For Operations

✅ **Zero Downtime**: Deploy without breaking existing clients  
✅ **Easy Rollback**: Can remove `/api/v1/oauth` mounting anytime  
✅ **Simple Testing**: Test both patterns independently  
✅ **Audit Trail**: Same audit logs for both patterns

---

## 📚 Related Documentation

- **Port Mapping**: `auth-gateway-oauth2-pkce/PORT_MAPPING_COMPLETE.md`
- **OAuth Implementation**: `OAUTH2_PKCE_IMPLEMENTATION_PLAN.md`
- **CLI Migration**: `CLI-OAUTH2-MIGRATION.md`
- **Deployment Status**: `OAUTH-ROUTE-FIX.md`

---

## 🔐 Security Considerations

### Rate Limiting

Both patterns share the same rate limits (per IP):

- `/oauth/authorize` & `/api/v1/oauth/authorize`: 10 req/min
- `/oauth/token` & `/api/v1/oauth/token`: 10 req/min
- `/oauth/revoke` & `/api/v1/oauth/revoke`: 20 req/min

### CSRF Protection

Both patterns use the same CSRF middleware:

- Double-submit cookie pattern
- CSRF token in state parameter
- Referer validation for authorize endpoint

### PKCE Enforcement

Both patterns enforce PKCE with S256:

- `code_challenge` required on authorize
- `code_verifier` required on token exchange
- SHA256 challenge method only (S256)

---

## ✅ Production Checklist

Before deploying to production:

- [ ] Backup current src/index.ts
- [ ] Verify dual-path mounting in code
- [ ] Test on staging/local environment
- [ ] Run automated test suite
- [ ] Deploy to production
- [ ] Verify both patterns work
- [ ] Monitor PM2 logs for errors
- [ ] Update CLI documentation
- [ ] Notify team of new endpoint availability

---

## 📞 Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs auth-gateway`
2. Run test suite: `./test-oauth-endpoints.sh`
3. Verify nginx routing: `sudo nginx -t`
4. Check database connectivity
5. Review PORT_MAPPING_COMPLETE.md for architecture

---

**Status**: ✅ Ready for Deployment  
**Risk Level**: Low (backward compatible)  
**Rollback Time**: < 5 minutes  
**Expected Downtime**: Zero

---

## 🎯 Next Steps

After successful deployment:

1. Update CLI to use `/api/v1/oauth/*` endpoints
2. Add `/api/v1/oauth/*` examples to API documentation
3. Create client SDKs using new pattern
4. Monitor usage metrics for both patterns
5. Consider deprecating one pattern in future (if needed)

The dual-path model ensures **maximum compatibility** while providing **clear API versioning** for modern clients! 🚀
