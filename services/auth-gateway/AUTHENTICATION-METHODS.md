# Authentication Methods Reference

> **Last Updated:** January 2026
> **Auth-Gateway Version:** 2.x
> **Maintainer:** Lan Onasis Team

This document provides a comprehensive reference for all authentication methods supported by the Auth-Gateway service.

---

## Overview

The Auth-Gateway supports **10 authentication methods** to accommodate different client types:

| Method | Primary Use Case | Standards |
|--------|-----------------|-----------|
| Email/Password | Web browsers | - |
| OTP (Passwordless) | CLI, Mobile | RFC 6238 |
| OAuth 2.0 PKCE | Web apps, SPAs | RFC 7636 |
| Device Code | CLI, IDE extensions | RFC 8628 |
| API Key | Server-to-server | Custom |
| JWT Bearer | Session access | RFC 7519 |
| Supabase OAuth 2.1 | Integrated apps | OAuth 2.1 |
| Refresh Token | Token renewal | RFC 6749 |
| Admin Bypass | Emergency access | Custom |
| CLI Login | Terminal apps | Custom |

---

## 1. Email/Password Authentication

**Endpoint:** `POST /web/login`
**Use Case:** Browser-based web applications
**Flow:** Traditional form-based login

### Request
```http
POST /web/login
Content-Type: application/x-www-form-urlencoded

email=user@example.com&password=secret&return_to=/dashboard
```

### Response
- **Success:** Sets `lanonasis_session` cookie, redirects to `return_to`
- **Failure:** Redirects to `/web/login?error=<message>`

### Session Cookies Set
| Cookie | Purpose | HttpOnly | Secure |
|--------|---------|----------|--------|
| `lanonasis_session` | JWT access token | Yes | Yes (prod) |
| `lanonasis_user` | User info (id, email, role) | No | Yes (prod) |

---

## 2. OTP (One-Time Password) Authentication

**Endpoints:**
- `POST /v1/auth/otp/send` - Request OTP
- `POST /v1/auth/otp/verify` - Verify OTP

**Use Case:** CLI tools, mobile apps, passwordless login
**Flow:** Email-based magic code

### Step 1: Request OTP
```http
POST /v1/auth/otp/send
Content-Type: application/json

{
  "email": "user@example.com",
  "platform": "cli"
}
```

### Step 2: Verify OTP
```http
POST /v1/auth/otp/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "token": "123456",
  "platform": "cli"
}
```

### Response (Success)
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 900,
  "token_type": "Bearer"
}
```

---

## 3. OAuth 2.0 PKCE (Authorization Code)

**Endpoints:**
- `GET /oauth/authorize` - Authorization request
- `POST /oauth/token` - Token exchange

**Use Case:** Web applications, SPAs, MCP clients
**Flow:** Authorization Code with PKCE (RFC 7636)

### Step 1: Authorization Request
```http
GET /oauth/authorize?
  client_id=my-app&
  response_type=code&
  redirect_uri=http://localhost:8080/callback&
  scope=memories:read+memories:write&
  code_challenge=<SHA256_BASE64URL>&
  code_challenge_method=S256&
  state=<random>
```

### Step 2: Token Exchange
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=<auth_code>&
redirect_uri=http://localhost:8080/callback&
client_id=my-app&
code_verifier=<original_verifier>
```

### Response
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "memories:read memories:write"
}
```

### Auto-Registration
MCP clients with `localhost` redirect URIs are **automatically registered** - no pre-registration needed.

---

## 4. Device Code Authentication (RFC 8628)

**Endpoints:**
- `POST /oauth/device` - Request device code
- `GET /oauth/device` - User verification page
- `POST /oauth/device/verify` - Submit email
- `POST /oauth/device/authorize` - Complete with OTP

**Use Case:** CLI tools, IDE extensions, devices without browsers
**Flow:** GitHub-style device authorization

### Step 1: Request Device Code
```http
POST /oauth/device
Content-Type: application/json

{
  "client_id": "vscode-extension",
  "scope": "memories:read memories:write"
}
```

### Response
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNh...",
  "user_code": "ABCD-1234",
  "verification_uri": "https://auth.lanonasis.com/device",
  "verification_uri_complete": "https://auth.lanonasis.com/device?code=ABCD-1234",
  "expires_in": 900,
  "interval": 5
}
```

### Step 2: User Visits Verification URL
User opens `verification_uri_complete` in browser, enters email, receives OTP via email, enters OTP.

### Step 3: Client Polls for Token
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code&
device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNh...&
client_id=vscode-extension
```

### Poll Responses
| Response | Meaning |
|----------|---------|
| `authorization_pending` | User hasn't authorized yet |
| `slow_down` | Polling too fast |
| `access_denied` | User denied request |
| `expired_token` | Device code expired |
| `{ access_token: ... }` | Success! |

### Benefits
- No localhost server needed
- Works in SSH, containers, remote environments
- User authenticates on trusted device

---

## 5. API Key Authentication

**Header:** `X-API-Key: <key>` or `Authorization: ApiKey <key>`
**Use Case:** Server-to-server, automated scripts

### Request
```http
GET /api/v1/memories
X-API-Key: lano_live_abc123...
X-Project-Scope: my-project
```

### API Key Management
- `POST /api/v1/auth/api-keys` - Create key
- `GET /api/v1/auth/api-keys` - List keys
- `DELETE /api/v1/auth/api-keys/:id` - Revoke key
- `POST /api/v1/auth/api-keys/:id/rotate` - Rotate key

### Key Format
```
lano_<environment>_<random>
```
Examples:
- `lano_live_k8j2m9...` (production)
- `lano_test_x7y3p4...` (test)

---

## 6. JWT Bearer Token

**Header:** `Authorization: Bearer <token>`
**Use Case:** Session-based API access after login

### Request
```http
GET /api/v1/memories
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Claims
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "authenticated",
  "platform": "web",
  "project_scope": "my-project",
  "iat": 1704067200,
  "exp": 1704068100
}
```

---

## 7. Supabase OAuth 2.1 Provider

**Endpoint:** `GET /oauth/consent`
**Use Case:** Apps using Supabase's built-in OAuth server

This uses Supabase's OAuth 2.1 Provider feature with `authorization_id`:

```http
GET /oauth/consent?authorization_id=<supabase_auth_id>
```

The consent page calls:
- `supabase.auth.getAuthorizationDetails()`
- `supabase.auth.approveAuthorization()`

---

## 8. Refresh Token

**Endpoint:** `POST /oauth/token`
**Use Case:** Renewing expired access tokens

### Request
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=eyJ...&
client_id=my-app&
scope=memories:read
```

### Response
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Note:** Refresh tokens are rotated on each use (one-time use).

---

## 9. Admin Bypass Login

**Endpoint:** `POST /admin/bypass-login`
**Use Case:** Emergency access when normal auth fails

### Request
```http
POST /admin/bypass-login
Content-Type: application/json

{
  "email": "admin@example.com",
  "admin_secret": "<ADMIN_SECRET>"
}
```

### Security
- Rate limited (5 attempts per 15 minutes)
- Requires `ADMIN_SECRET` environment variable
- All attempts are audit logged

---

## 10. CLI Login

**Endpoint:** `POST /auth/cli-login`
**Use Case:** Dedicated CLI authentication form

Similar to web login but optimized for terminal workflows:
- Terminal-styled UI
- Automatic redirect handling for CLI callbacks

---

## OAuth Discovery Endpoints

### Authorization Server Metadata (RFC 8414)
```http
GET /.well-known/oauth-authorization-server
```

Returns:
```json
{
  "issuer": "https://auth.lanonasis.com",
  "authorization_endpoint": "https://auth.lanonasis.com/oauth/authorize",
  "token_endpoint": "https://auth.lanonasis.com/oauth/token",
  "device_authorization_endpoint": "https://auth.lanonasis.com/oauth/device",
  "grant_types_supported": [
    "authorization_code",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code"
  ],
  "code_challenge_methods_supported": ["S256", "plain"]
}
```

### Dynamic Client Registration (RFC 7591)
```http
POST /register
Content-Type: application/json

{
  "client_name": "My MCP Client",
  "redirect_uris": ["http://localhost:8080/callback"],
  "grant_types": ["authorization_code"],
  "scope": "memories:read memories:write mcp:connect"
}
```

---

## OAuth Client Types

The `oauth_clients` table supports these application types:

| Type | Description | Example |
|------|-------------|---------|
| `native` | Mobile/desktop apps | iOS app |
| `cli` | Command-line tools | `@lanonasis/cli` |
| `mcp` | MCP protocol clients | Claude Desktop |
| `web` | Browser applications | Dashboard |
| `server` | Server-to-server | Backend service |

---

## Recommended Auth Method by Client Type

| Client Type | Recommended Method | Fallback |
|-------------|-------------------|----------|
| **Web Browser** | Email/Password → Session Cookie | OAuth PKCE |
| **SPA** | OAuth PKCE | - |
| **CLI Tool** | Device Code | OTP |
| **IDE Extension** | Device Code | OAuth PKCE |
| **MCP Client** | OAuth PKCE (auto-register) | - |
| **Mobile App** | OTP | OAuth PKCE |
| **Server** | API Key | JWT Bearer |

---

## Token Lifetimes

| Token Type | Default TTL | Environment Variable |
|------------|-------------|---------------------|
| Authorization Code | 5 minutes | `AUTH_CODE_TTL_SECONDS` |
| Access Token | 15 minutes | `ACCESS_TOKEN_TTL_SECONDS` |
| Refresh Token | 30 days | `REFRESH_TOKEN_TTL_SECONDS` |
| Device Code | 15 minutes | (hardcoded) |
| Session Cookie | 7 days | (hardcoded) |

---

## Security Features

### Rate Limiting
| Endpoint | Limit | Window |
|----------|-------|--------|
| `/v1/auth/login` | 5 requests | 15 minutes |
| `/oauth/token` | 5 requests | 15 minutes |
| `/admin/bypass-login` | 5 requests | 15 minutes |
| General API | 100 requests | 15 minutes |

### PKCE Requirements
- All OAuth flows require PKCE
- Supported methods: `S256` (recommended), `plain`

### Cookie Security
- `HttpOnly` for session tokens
- `Secure` in production
- `SameSite=None` for cross-origin (production)
- Domain: `.lanonasis.com`

---

## Related Documentation

- [OAUTH-DUAL-PATH-GUIDE.md](./OAUTH-DUAL-PATH-GUIDE.md) - OAuth implementation details
- [CLI-OAUTH2-MIGRATION.md](./CLI-OAUTH2-MIGRATION.md) - CLI authentication guide
- [EMERGENCY-ADMIN-ACCESS.md](./EMERGENCY-ADMIN-ACCESS.md) - Admin bypass procedures
- [API-KEY-DEPLOYMENT-GUIDE.md](./API-KEY-DEPLOYMENT-GUIDE.md) - API key management
