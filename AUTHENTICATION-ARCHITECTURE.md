# Lanonasis Authentication Architecture

## Executive Summary

**Auth Pages**: Currently **static HTML files** in `/opt/lanonasis/onasis-core/auth/` - NOT hosted by VPS services  
**Hosting**: Auth pages need to be served (CDN, static hosting, or added to auth-gateway)  
**OAuth**: Partial implementation - OAuth provider configuration missing  

---

## Current Architecture

### Services Running on VPS

```
┌─────────────────────────────────────────────────────────────┐
│ VPS Server (168.231.74.29)                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 1. auth-gateway (Port 4000) - Main Auth Gateway            │
│    - Handles: API authentication, JWT tokens, sessions      │
│    - No frontend hosting (backend API only)                  │
│                                                              │
│ 2. auth (Port 3005) - Quick Auth Server                     │
│    - Handles: CLI authentication, Supabase integration      │
│    - No frontend hosting (backend API only)                  │
│                                                              │
│ 3. mcp-core (Port 3001) - MCP Core                          │
│                                                              │
│ 4. onasis (Port 3000) - Onasis Gateway                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

### 1. Dashboard Users Flow

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser    │ ────>│  Auth Page   │ ────>│ Auth Gateway│
│              │      │ (STATIC HTML)│      │   (API)     │
└──────────────┘      └──────────────┘      └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   Database   │
                                        │   + JWT      │
                                        └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │  Dashboard   │
                                        │  (Frontend)  │
                                        └──────────────┘
```

**Current Status**: Auth page exists as static HTML but NOT hosted on VPS

---

### 2. CLI Users Flow

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  CLI Tool    │ ────>│ Auth Gateway│ ────>│   Database   │
│              │      │ /auth/cli-   │      │              │
│              │      │   login     │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   Return     │
                                        │   JWT Token  │
                                        └──────────────┘
```

**Status**: ✅ Working - CLI authentication functional

---

### 3. API Key Validation Flow

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Client     │ ────>│ Auth Gateway│ ────>│   Database   │
│   App        │      │   /v1/auth/  │      │              │
│              │      │   verify     │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   Validate   │
                                        │   & Return   │
                                        └──────────────┘
```

**Status**: ✅ Working - API key validation functional

---

### 4. OAuth Provider Flow (NEEDS CONFIGURATION)

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser    │ ────>│   GitHub/    │ ────>│   OAuth     │
│              │      │   Google     │      │   Callback  │
└──────────────┘      └──────────────┘      └──────────────┘
                                                        │
                                                        ▼
                                               ┌──────────────┐
                                               │ Auth Gateway│
                                               │  /callback  │
                                               └──────────────┘
                                                        │
                                                        ▼
                                               ┌──────────────┐
                                               │   Return    │
                                               │   JWT Token │
                                               └──────────────┘
```

**Status**: ❌ NOT CONFIGURED - OAuth providers need setup

---

## Current Implementation Status

### ✅ Working Features

1. **CLI Authentication**
   - Endpoint: `POST /auth/cli-login`
   - Purpose: Authenticate CLI users
   - Returns: JWT tokens, session info

2. **Dashboard Authentication**
   - Endpoint: `POST /v1/auth/login`
   - Purpose: Authenticate web users
   - Returns: JWT tokens, user info

3. **API Key Validation**
   - Endpoint: `POST /v1/auth/verify`
   - Purpose: Validate JWT tokens
   - Returns: Validation status

4. **Session Management**
   - Endpoint: `GET /v1/auth/sessions`
   - Purpose: List active sessions
   - Returns: Session list

### ❌ Missing Features

1. **OAuth Provider Configuration**
   - GitHub OAuth
   - Google OAuth
   - Other providers

2. **Frontend Hosting**
   - Auth pages exist but not served
   - Need CDN or static hosting

3. **OAuth Callback Handler**
   - Callback page exists (`callback.html`)
   - No backend route configured

---

## Files Location

### Auth Pages (Static HTML)
```
/opt/lanonasis/onasis-core/auth/
├── login.html        # Login page
├── register.html     # Registration page  
├── callback.html     # OAuth callback page
└── auth.html         # Main auth page
```

**Status**: Files exist but NOT hosted on VPS

### Auth Gateway API
```
/opt/lanonasis/services/auth-gateway/
├── src/routes/
│   ├── auth.routes.ts     # Main auth routes
│   ├── cli.routes.ts      # CLI auth routes
│   ├── admin.routes.ts    # Admin routes
│   └── mcp.routes.ts      # MCP routes
└── src/controllers/
    └── auth.controller.ts  # Auth logic
```

**Status**: ✅ Running on port 4000

---

## What Needs to Be Done

### 1. Host Auth Pages ⚠️

**Option A**: Add to auth-gateway
```typescript
// In src/index.ts
app.use(express.static('../auth'))
```

**Option B**: Use CDN/Static Hosting
- Upload `/opt/lanonasis/onasis-core/auth/` to CDN
- Configure CORS for auth-gateway API

**Option C**: Separate Service
- Create new service to serve static files
- Configure nginx to route appropriately

### 2. Configure OAuth Providers ⚠️

#### GitHub OAuth
```bash
# In Supabase Dashboard
# Settings > Auth > Providers > GitHub
```

#### Google OAuth
```bash
# In Supabase Dashboard  
# Settings > Auth > Providers > Google
```

### 3. Add OAuth Callback Route ⚠️

```typescript
// Add to src/routes/auth.routes.ts
router.get('/oauth/callback', authController.oauthCallback)
```

### 4. Configure Redirect URLs ⚠️

Update `.env`:
```bash
AUTH_SUCCESS_REDIRECT="https://dashboard.lanonasis.com"
AUTH_FAILURE_REDIRECT="https://api.lanonasis.com/auth/login"
CLI_REDIRECT="https://api.lanonasis.com/auth/cli"
```

---

## Session Management

### Current Implementation

**Storage**: Database (PostgreSQL)  
**Type**: Token-based (JWT)  
**Expiry**: Configurable (default 7 days)  
**Refresh**: Yes, automatic  

### Database Tables

```sql
auth_gateway.user_sessions
auth_gateway.admin_sessions
auth_gateway.admin_access_log
```

---

## Security Considerations

### ✅ Implemented
- JWT token signing
- Password hashing (bcrypt)
- Session validation
- CORS configuration
- Admin bypass (emergency access)

### ⚠️ Missing
- OAuth state validation
- CSRF protection
- Rate limiting (partial)
- IP whitelisting
- Token rotation

---

## End-to-End Flow Example

### Dashboard User Login

```
1. User visits dashboard.lanonasis.com
2. Not authenticated -> Redirect to auth page
3. Auth page (login.html) loads from static hosting
4. User enters credentials
5. Auth page calls: POST https://api.lanonasis.com:4000/v1/auth/login
6. Auth Gateway validates credentials
7. Auth Gateway creates session in database
8. Auth Gateway returns JWT token
9. Auth page stores token (localStorage/cookie)
10. Auth page redirects back to dashboard
11. Dashboard includes token in requests
12. Auth Gateway validates token on each request
```

---

## Testing the Flow

### Test Dashboard Auth
```bash
# 1. Start auth-gateway (already running)
pm2 status auth-gateway

# 2. Test login endpoint
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# 3. Test with token
curl http://localhost:4000/v1/auth/session \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test CLI Auth
```bash
curl -X POST http://localhost:4000/auth/cli-login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

---

## Recommendations

### Immediate (Required)
1. ✅ Host auth pages (choose Option A, B, or C above)
2. ✅ Configure OAuth providers in Supabase
3. ✅ Add OAuth callback route to auth-gateway
4. ✅ Test complete flow end-to-end

### Short-term (Recommended)
1. Add CSRF protection
2. Implement rate limiting
3. Add session monitoring dashboard
4. Configure automatic token rotation

### Long-term (Nice to have)
1. Add SSO support
2. Implement biometric auth
3. Add device fingerprinting
4. Build admin monitoring tools

---

**Last Updated**: October 23, 2025  
**Status**: Backend Complete, Frontend Hosting Required

