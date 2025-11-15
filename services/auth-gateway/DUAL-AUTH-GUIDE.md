# Auth Gateway Dual-Auth Interoperability Guide

## Architecture Overview

```
Port 4000 (auth-gateway) - Single Service, Dual Auth
├── JWT Auth (Legacy)
│   ├── /v1/auth/login          → Returns JWT token
│   ├── /v1/auth/refresh        → Refreshes JWT
│   ├── /auth/cli-login         → CLI JWT login
│   └── /mcp/auth               → MCP JWT auth
│
└── OAuth2 PKCE (New)
    ├── /oauth/authorize        → Authorization code + PKCE
    ├── /oauth/token            → Access + Refresh tokens
    ├── /oauth/revoke           → Revoke tokens
    └── /oauth/introspect       → Token introspection
```

## How Both Auth Methods Work Together

### 1. **Token Format Distinction**

**JWT Tokens (Legacy):**
```json
{
  "sub": "user-id",
  "email": "admin@example.com",
  "role": "authenticated",
  "iat": 1699999999,
  "exp": 1700604799
}
```

**OAuth2 Access Tokens:**
```json
{
  "access_token": "oauth2_xyz123...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_abc456...",
  "scope": "read write"
}
```

### 2. **Client Detection Strategy**

The auth-gateway automatically detects which auth method based on:

**Route-Based Detection:**
- Request to `/v1/auth/*` → JWT handler
- Request to `/oauth/*` → OAuth2 handler

**Header-Based Detection:**
- `Authorization: Bearer jwt_token` → JWT validation
- `Authorization: Bearer oauth2_access_token` → OAuth2 validation

### 3. **Middleware Chain**

```typescript
// Unified auth middleware (handles both)
app.use('/api/*', authenticateRequest)

async function authenticateRequest(req, res, next) {
  const token = extractBearerToken(req)
  
  // Try JWT first (faster, stateless)
  const jwtPayload = verifyJWT(token)
  if (jwtPayload) {
    req.user = jwtPayload
    return next()
  }
  
  // Try OAuth2 (requires DB lookup)
  const oauth2Session = await verifyOAuth2Token(token)
  if (oauth2Session) {
    req.user = oauth2Session.user
    req.oauth = oauth2Session
    return next()
  }
  
  return res.status(401).json({ error: 'Unauthorized' })
}
```

## Implementation Plan

### Phase 1: Update Environment (5 min)

```bash
# Backup current config
cp /opt/lanonasis/onasis-core/services/auth-gateway/.env \
   /opt/lanonasis/onasis-core/services/auth-gateway/.env.backup

# Apply dual-auth config
cp /tmp/auth-gateway-dual-auth.env \
   /opt/lanonasis/onasis-core/services/auth-gateway/.env

# Verify
cat /opt/lanonasis/onasis-core/services/auth-gateway/.env | grep -E "(JWT_ENABLED|OAUTH_ENABLED)"
```

### Phase 2: Test Auth Methods (10 min)

**Test JWT (CLI):**
```bash
# Should work as before
curl -X POST https://auth.lanonasis.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@2024!"}'
```

**Test OAuth2 (IDE Extension):**
```bash
# Authorization URL
https://auth.lanonasis.com/oauth/authorize?
  response_type=code&
  client_id=lanonasis-ide-extension&
  redirect_uri=http://localhost:3000/callback&
  scope=read+write&
  code_challenge=PKCE_CHALLENGE&
  code_challenge_method=S256
```

### Phase 3: Restart Service (2 min)

```bash
cd /opt/lanonasis/onasis-core/services/auth-gateway
pm2 restart auth-gateway
pm2 logs auth-gateway --lines 50
```

## Client Configuration

### CLI/MaaS (JWT) - No Changes Needed ✅

Your existing config works as-is:
```json
{
  "authMethod": "jwt",
  "discoveredServices": {
    "auth_base": "https://auth.lanonasis.com"
  }
}
```

**API Calls:**
- Login: `POST /v1/auth/login`
- Headers: `Authorization: Bearer <jwt_token>`

### IDE Extension (OAuth2) - New Config

```json
{
  "authMethod": "oauth2",
  "oauth": {
    "issuer": "https://auth.lanonasis.com",
    "authorization_endpoint": "https://auth.lanonasis.com/oauth/authorize",
    "token_endpoint": "https://auth.lanonasis.com/oauth/token",
    "client_id": "lanonasis-ide-extension",
    "redirect_uri": "http://localhost:3000/callback",
    "pkce": true
  }
}
```

## Token Validation Comparison

| Feature | JWT | OAuth2 PKCE |
|---------|-----|-------------|
| **Stateless** | ✅ Yes | ❌ No (requires DB) |
| **Validation Speed** | Fast (~1ms) | Slower (~10ms) |
| **Revocation** | ❌ Not supported | ✅ Instant |
| **Refresh** | ✅ Simple | ✅ With rotation |
| **Best For** | APIs, CLI, MCP | IDE extensions, Web apps |

## Security Considerations

### JWT (Legacy)
- **Pros:** Fast, stateless, works offline
- **Cons:** Can't revoke before expiry, larger token size
- **Use Case:** Internal services, CLI tools, APIs

### OAuth2 PKCE (New)
- **Pros:** Revocable, fine-grained scopes, secure for public clients
- **Cons:** Requires database lookup, more complex
- **Use Case:** Third-party apps, IDE extensions, mobile apps

## Migration Strategy

**No migration needed!** Both methods run simultaneously:

1. **Existing clients (CLI, MCP, APIs)** → Continue using JWT
2. **New clients (IDE extensions)** → Use OAuth2 PKCE
3. **Gradual migration** → Move services to OAuth2 as needed

## Troubleshooting

### Issue: "Invalid token format"
**Cause:** Client sent OAuth2 token to JWT endpoint
**Fix:** Ensure client uses correct endpoint:
- JWT: `/v1/auth/*`
- OAuth2: `/oauth/*`

### Issue: "Token expired"
**JWT:** Request new token via `/v1/auth/refresh`
**OAuth2:** Use refresh token at `/oauth/token` with `grant_type=refresh_token`

### Issue: "CORS error on OAuth endpoints"
**Fix:** Ensure IDE extension origin is in CORS_ORIGIN:
```bash
CORS_ORIGIN="...,http://localhost:3000,vscode-webview://..."
```

## Next Steps

1. ✅ Apply dual-auth `.env` configuration
2. ✅ Restart auth-gateway service
3. ✅ Test JWT auth (CLI login)
4. ✅ Test OAuth2 flow (IDE extension)
5. ✅ Register IDE extension as OAuth client
6. ✅ Update IDE extension with OAuth credentials

