# Lanonasis Authentication Architecture

## Overview

Lanonasis uses a unified authentication system centered on `auth.lanonasis.com` that supports multiple authentication methods while maintaining security through SHA-256 hashing and PKCE (Proof Key for Code Exchange).

## Authentication Methods

### 1. OAuth 2.0 with PKCE (VS Code Extension, CLI)

**Flow:** Authorization Code Flow with PKCE

```
┌─────────────┐     ┌────────────────────┐     ┌─────────────────┐
│  VS Code    │     │  auth.lanonasis.com │     │    Supabase     │
│  Extension  │     │   (Auth Gateway)    │     │   (User Store)  │
└─────────────┘     └────────────────────┘     └─────────────────┘
      │                      │                         │
      │ 1. Generate PKCE     │                         │
      │    code_verifier     │                         │
      │    + code_challenge  │                         │
      │                      │                         │
      │ 2. /oauth/authorize  │                         │
      │    + code_challenge  │                         │
      │    + state           │                         │
      │─────────────────────>│                         │
      │                      │                         │
      │ 3. Login form        │                         │
      │<─────────────────────│                         │
      │                      │                         │
      │ 4. User credentials  │                         │
      │─────────────────────>│                         │
      │                      │ 5. Validate user        │
      │                      │────────────────────────>│
      │                      │                         │
      │                      │ 6. User validated       │
      │                      │<────────────────────────│
      │                      │                         │
      │ 7. Redirect with     │                         │
      │    authorization_code│                         │
      │<─────────────────────│                         │
      │                      │                         │
      │ 8. /oauth/token      │                         │
      │    + code_verifier   │                         │
      │    + auth_code       │                         │
      │─────────────────────>│                         │
      │                      │                         │
      │ 9. Verify PKCE       │                         │
      │    SHA256(verifier)  │                         │
      │    == code_challenge │                         │
      │                      │                         │
      │ 10. access_token +   │                         │
      │     refresh_token    │                         │
      │<─────────────────────│                         │
```

**Security Features:**
- PKCE code challenge using SHA-256 (S256 method)
- Authorization codes are SHA-256 hashed before storage
- Tokens are opaque (not JWTs) and stored as SHA-256 hashes
- Tokens bound to client_id and user_id
- Refresh token rotation with chain revocation
- Full audit logging

**Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/oauth/authorize` | GET | Start authorization flow |
| `/oauth/token` | POST | Exchange code for tokens |
| `/oauth/revoke` | POST | Revoke tokens |
| `/oauth/introspect` | POST | Validate/inspect tokens |

### 2. API Key Authentication (Programmatic Access)

**Use Case:** Server-to-server, scripts, integrations

```
┌─────────────┐     ┌────────────────────┐     ┌─────────────────┐
│   Client    │     │  api.lanonasis.com  │     │    Database     │
│ (API call)  │     │   (Netlify/VPS)     │     │   (Supabase)    │
└─────────────┘     └────────────────────┘     └─────────────────┘
      │                      │                         │
      │ Request +            │                         │
      │ X-API-Key: lano_xxx  │                         │
      │─────────────────────>│                         │
      │                      │                         │
      │                      │ SHA256(api_key)         │
      │                      │ lookup in api_keys      │
      │                      │────────────────────────>│
      │                      │                         │
      │                      │ user_id, permissions    │
      │                      │<────────────────────────│
      │                      │                         │
      │ Response             │                         │
      │<─────────────────────│                         │
```

**Key Format:**
- Current: `lano_` prefix + 64 hex characters
- Legacy (deprecated): `vx_`, `lns_` prefixes

**Storage:**
- Keys stored as SHA-256 hashes (never in plain text)
- Multiple schema support for migration:
  - `security_service.stored_api_keys` (primary)
  - `vsecure.lanonasis_api_keys` (legacy Neon)
  - `public.api_keys` (user-generated)

### 3. Session Cookies (Web Dashboard)

**Use Case:** Browser-based access to dashboard.lanonasis.com

```
┌─────────────┐     ┌────────────────────┐     ┌─────────────────┐
│   Browser   │     │  auth.lanonasis.com │     │    Supabase     │
│             │     │   (Auth Gateway)    │     │                 │
└─────────────┘     └────────────────────┘     └─────────────────┘
      │                      │                         │
      │ /web/login           │                         │
      │─────────────────────>│                         │
      │                      │                         │
      │ Login form           │                         │
      │<─────────────────────│                         │
      │                      │                         │
      │ POST credentials     │                         │
      │─────────────────────>│                         │
      │                      │ signInWithPassword      │
      │                      │────────────────────────>│
      │                      │                         │
      │                      │ user + session          │
      │                      │<────────────────────────│
      │                      │                         │
      │ Set-Cookie:          │                         │
      │   lanonasis_session  │                         │
      │   domain=.lanonasis.com                        │
      │<─────────────────────│                         │
```

**Cookie Configuration:**
```javascript
{
  name: 'lanonasis_session',
  domain: '.lanonasis.com',  // Shared across all subdomains
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax'
};
```

## Single Sign-On (SSO) Architecture

### How SSO Works Across Subdomains

Because cookies are set with `domain=.lanonasis.com`, a user authenticated on any subdomain is automatically authenticated across all Lanonasis services:

| Domain | Access |
|--------|--------|
| `auth.lanonasis.com` | Authentication gateway |
| `dashboard.lanonasis.com` | Web dashboard |
| `api.lanonasis.com` | API endpoints |
| `*.lanonasis.com` | Any future subdomains |

### Token Validation for Services

Services can validate tokens using the introspection endpoint:

**Request:**
```bash
curl -X POST https://api.lanonasis.com/api/v1/auth/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=<access_token>"
```

**Response (valid token):**
```json
{
  "active": true,
  "client_id": "vscode-extension",
  "user_id": "c482cb8c-dc40-41dc-986d-daf0bcb078e5",
  "scope": "memories:read memories:write",
  "token_type": "access",
  "exp": 1733123456,
  "iat": 1733122556
}
```

**Response (invalid/expired token):**
```json
{
  "active": false
}
```

## Authentication Decision Matrix

| Client Type | Method | Token Type | Storage |
|-------------|--------|------------|---------|
| VS Code Extension | OAuth PKCE | Opaque access/refresh | Extension storage |
| CLI | OAuth PKCE | Opaque access/refresh | Keychain/file |
| Web Browser | Session cookie | JWT in cookie | Browser cookie |
| Server/Script | API Key | SHA-256 hashed key | Database |
| MCP Server | Bearer token | Opaque access | Memory |

## Security Considerations

### Token Security
- **No JWTs for OAuth:** Opaque tokens prevent token inspection by clients
- **SHA-256 everywhere:** All secrets hashed before storage
- **PKCE required:** Prevents authorization code interception attacks
- **Token rotation:** Refresh tokens rotated on use, invalidating chains

### API Key Security
- **One-way hash:** Keys cannot be recovered from database
- **Expiration support:** Keys can have optional expiration dates
- **Audit trail:** `last_used_at` tracked for monitoring

### Session Security
- **HttpOnly cookies:** Prevents XSS token theft
- **Secure flag:** HTTPS only
- **SameSite=Lax:** CSRF protection
- **Domain scope:** Controlled subdomain access

## Database Schema

### OAuth Tables (auth_gateway schema)

```sql
-- OAuth clients (VS Code, CLI, etc.)
auth_gateway.oauth_clients (
  client_id, client_name, client_type, require_pkce,
  allowed_redirect_uris, allowed_scopes, status
)

-- Authorization codes (short-lived)
auth_gateway.oauth_authorization_codes (
  code_hash, client_id, user_id, code_challenge,
  code_challenge_method, redirect_uri, scope, expires_at
)

-- Tokens (access + refresh)
auth_gateway.oauth_tokens (
  token_hash, token_type, client_id, user_id,
  scope, expires_at, revoked, parent_token_id
)

-- Sessions
auth_gateway.sessions (
  user_id, platform, token_hash, refresh_token_hash,
  expires_at, last_used_at
)

-- Audit log
auth_gateway.oauth_audit_log (
  event_type, client_id, user_id, success, error_code
)
```

### API Keys Table (public schema)

```sql
public.api_keys (
  id, name, key_hash, user_id, access_level,
  permissions, expires_at, last_used_at, is_active
)
```

## Environment Variables

```env
# Auth Gateway
AUTH_GATEWAY_URL=https://auth.lanonasis.com
COOKIE_DOMAIN=.lanonasis.com

# Token TTLs
AUTH_CODE_TTL_SECONDS=300        # 5 minutes
ACCESS_TOKEN_TTL_SECONDS=900     # 15 minutes
REFRESH_TOKEN_TTL_SECONDS=2592000 # 30 days

# Database
postgresql://<user>:<password>@<host>:<port>/<db>
https://<project-ref>.supabase.co
REDACTED_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
```

## Troubleshooting

### "invalid_request" on login
- Usually means OAuth callback from Supabase hit wrong URL
- Check Supabase Auth settings: Site URL should be `https://api.lanonasis.com`
- Verify Netlify `_redirects` has `/auth/callback` proxy rule

### "bad_oauth_state" error
- State mismatch between authorize and callback
- Clear browser cookies and try again
- Check Redis is running for session storage

### API key not working
- Verify key hasn't expired (`expires_at`)
- Check key is active (`is_active = true`)
- Ensure correct prefix (`lano_`)
- Verify header name is `X-API-Key` (case-insensitive)

### Session cookie not shared
- Verify cookie domain is `.lanonasis.com` (with leading dot)
- Check browser allows third-party cookies
- Ensure HTTPS is used on all domains

## API Reference

See `/opt/lanonasis/onasis-core/services/auth-gateway/src/routes/` for full route definitions:

- `oauth.routes.ts` - OAuth 2.0 endpoints
- `auth.routes.ts` - User authentication
- `api-keys.routes.ts` - API key management
- `web.routes.ts` - Web login pages
- `cli.routes.ts` - CLI-specific auth
