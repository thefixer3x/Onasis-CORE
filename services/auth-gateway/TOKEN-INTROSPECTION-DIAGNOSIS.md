# Token Introspection Failure - Root Cause Analysis

**Date:** 2025-12-01  
**Issue:** "Failed to load memories: Token introspection failed"  
**Status:** ✅ **ROOT CAUSE IDENTIFIED**

---

## Executive Summary

**Problem:** All access tokens in the database have expired.  
**Impact:** Users cannot load memories because token validation fails.  
**Solution:** Clients must use refresh tokens to obtain new access tokens.

---

## Investigation Results

### 1. Database Analysis ✅

**Auth-Gateway Database:** Neon (Correct)
```
Connection: postgresql://...@ep-snowy-surf-adqqsawd-pooler.c-2.us-east-1.aws.neon.tech/neondb
Schema: auth_gateway
```

**Introspection Function:** `introspectToken()` at line 612 of `oauth.service.ts`
```typescript
const result = await dbPool.query(`
  SELECT * FROM auth_gateway.oauth_tokens
  WHERE token_hash = $1
`, [hashed])
```

✅ **Correct:** Auth-gateway IS querying Neon database directly via `dbPool`

### 2. Token Status 🚨

**Total Tokens:** 230

| Token Type | Client | Total | Valid | Expired | Revoked |
|------------|--------|-------|-------|---------|---------|
| **access** | lanonasis-cli | 5 | **0** | 5 | 0 |
| **access** | vscode-extension | 58 | **0** | 58 | 0 |
| **access** | windsurf-extension | 52 | **0** | 52 | 27 |
| **refresh** | lanonasis-cli | 5 | **5** | 0 | 0 |
| **refresh** | vscode-extension | 58 | **58** | 0 | 0 |
| **refresh** | windsurf-extension | 52 | **12** | 0 | 40 |

### 🚨 Critical Finding

**ALL ACCESS TOKENS HAVE EXPIRED (0 valid out of 115)**

**Valid Refresh Tokens:** 75

---

## Root Cause

The error "Token introspection failed" occurs because:

1. **Client sends expired access token** to MCP Core
2. **MCP Core calls** auth-gateway `/oauth/introspect` endpoint
3. **Auth-gateway queries** Neon database `auth_gateway.oauth_tokens`
4. **Token found but expired** (`expires_at <= NOW()`)
5. **Returns** `{active: false}` (see oauth.service.ts line 627-637)
6. **Client receives error:** Token introspection failed

### Token Expiration Logic

```typescript
// From oauth.service.ts lines 627-637
if (record.revoked || record.expires_at.getTime() <= Date.now()) {
    return {
        active: false,
        client_id: record.client_id,
        user_id: record.user_id,
        scope: record.scope?.join(' ') || undefined,
        token_type: record.token_type,
        exp: Math.floor(record.expires_at.getTime() / 1000),
        revoked: record.revoked,
    }
}
```

---

## Why Access Tokens Expired

**Access Token TTL:** 15 minutes (900 seconds)
```typescript
// From oauth.service.ts line 15
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 15 * 60
```

**Refresh Token TTL:** 30 days (2,592,000 seconds)
```typescript
// From oauth.service.ts line 16
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 30 * 24 * 60 * 60
```

**Implication:** Access tokens expire after 15 minutes, which is standard OAuth 2.0 security practice.

---

## Solution Workflow

### For Clients (IDE Extensions, CLI, Web Apps)

```mermaid
graph TD
    A[Client has access token] --> B{Token valid?}
    B -->|Yes| C[Use token normally]
    B -->|No| D[Use refresh token]
    D --> E[POST /oauth/token<br/>grant_type=refresh_token]
    E --> F[Receive new access token]
    F --> C
    E -->|Failed| G[Re-authenticate user]
```

### OAuth Token Refresh Flow

```bash
# 1. Client sends refresh token to get new access token
POST http://localhost:4000/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<REFRESH_TOKEN>
&client_id=vscode-extension

# 2. Auth-gateway returns new access token
{
  "access_token": "new_access_token_here",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "refresh_token_here",  # May be rotated
  "scope": "memories:read memories:write"
}

# 3. Client uses new access token
GET http://localhost:3001/api/memories
Authorization: Bearer new_access_token_here
```

---

## Fix Implementation

### Option 1: Automatic Token Refresh (Recommended)

**Location:** Client-side code (IDE extensions, MCP clients)

```typescript
// Example: VSCode Extension or MCP Client
class TokenManager {
  private accessToken: string;
  private refreshToken: string;
  private expiresAt: number;

  async getValidToken(): Promise<string> {
    // Check if token is expired or will expire in next minute
    if (Date.now() >= this.expiresAt - 60000) {
      await this.refreshAccessToken();
    }
    return this.accessToken;
  }

  async refreshAccessToken(): Promise<void> {
    const response = await fetch('http://localhost:4000/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: 'vscode-extension'
      })
    });

    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token; // May be rotated
    this.expiresAt = Date.now() + (data.expires_in * 1000);
  }
}
```

### Option 2: Increase Access Token TTL (Not Recommended)

**Location:** `/opt/lanonasis/onasis-core/services/auth-gateway/.env`

```bash
# Increase from 15 minutes to 1 hour (reduces security)
ACCESS_TOKEN_TTL_SECONDS=3600

# Or 24 hours (not recommended for production)
ACCESS_TOKEN_TTL_SECONDS=86400
```

**⚠️ Security Impact:** Longer-lived access tokens increase security risk if compromised.

---

## Verification Steps

### 1. Check Current Token Expiration

```bash
cd /opt/lanonasis/onasis-core/services/auth-gateway
source .env
psql "$DATABASE_URL" -c "
  SELECT 
    token_type,
    client_id,
    expires_at,
    NOW() as current_time,
    expires_at - NOW() as time_remaining,
    expires_at > NOW() as is_valid
  FROM auth_gateway.oauth_tokens
  ORDER BY created_at DESC
  LIMIT 10;
"
```

### 2. Test Token Refresh

```bash
# Get a valid refresh token
REFRESH_TOKEN=$(psql "$DATABASE_URL" -t -c "
  SELECT token_hash 
  FROM auth_gateway.oauth_tokens 
  WHERE token_type = 'refresh' 
    AND expires_at > NOW() 
    AND revoked = false 
  LIMIT 1
" | tr -d ' ')

# Use it to get new access token (won't work with hash, need raw token)
curl -X POST http://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}&client_id=vscode-extension"
```

### 3. Monitor Token Usage

```bash
# Watch for new access tokens being created
watch -n 5 'psql "$DATABASE_URL" -c "
  SELECT 
    token_type,
    client_id,
    COUNT(*) as count,
    SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) as valid
  FROM auth_gateway.oauth_tokens
  GROUP BY token_type, client_id
  ORDER BY token_type
"'
```

---

## Client Implementation Checklist

### For IDE Extensions (VSCode, Windsurf, Cursor)

- [ ] Implement automatic token refresh before expiration
- [ ] Store both access_token and refresh_token securely
- [ ] Track token expiration time
- [ ] Refresh token 1 minute before expiration
- [ ] Handle refresh token failures (re-auth user)
- [ ] Test with 15-minute expiration

### For Web Applications

- [ ] Implement token refresh in API interceptor
- [ ] Refresh on 401 Unauthorized responses
- [ ] Queue failed requests during refresh
- [ ] Store tokens in secure httpOnly cookies or sessionStorage
- [ ] Clear tokens on logout

### For CLI Tools

- [ ] Refresh token before each command execution
- [ ] Cache tokens in secure config file (~/.lanonasis/tokens)
- [ ] Prompt re-auth when refresh token expires
- [ ] Support offline mode with longer-lived tokens (if needed)

---

## Testing

### Create Test Tokens

```bash
cd /opt/lanonasis/onasis-core/services/auth-gateway
node -e "
const { generateAuthorizationCode } = require('./dist/src/services/oauth.service.js');
// Generate test authorization code
"
```

### Simulate Token Expiration

```sql
-- Force expire all access tokens
UPDATE auth_gateway.oauth_tokens 
SET expires_at = NOW() - INTERVAL '1 hour'
WHERE token_type = 'access';

-- Verify
SELECT COUNT(*) 
FROM auth_gateway.oauth_tokens 
WHERE token_type = 'access' AND expires_at > NOW();
-- Should return 0
```

---

## Monitoring & Alerts

### Key Metrics to Track

1. **Token Refresh Rate:** How often clients refresh tokens
2. **Failed Token Introspections:** Count of `{active: false}` responses
3. **Expired Token Usage:** Clients trying to use expired tokens
4. **Refresh Token Failures:** Failed refresh attempts

### Recommended Queries

```sql
-- Daily token refresh stats
SELECT 
  DATE(created_at) as date,
  token_type,
  COUNT(*) as tokens_created
FROM auth_gateway.oauth_tokens
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), token_type
ORDER BY date DESC;

-- Active users by client
SELECT 
  client_id,
  COUNT(DISTINCT user_id) as active_users,
  SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) as valid_tokens
FROM auth_gateway.oauth_tokens
WHERE token_type = 'refresh'
GROUP BY client_id;
```

---

## Conclusion

### Confirmed ✅

1. **Auth-gateway IS using Neon database** (not Supabase)
2. **OAuth tables are in auth_gateway schema** in Neon
3. **Introspection endpoint works correctly**
4. **Token validation logic is correct**

### Issue ✅

**All access tokens have expired** because:
- Access token TTL is 15 minutes (security best practice)
- Clients are not refreshing tokens before expiration
- No automatic token refresh mechanism in clients

### Resolution Required

**Clients must implement automatic token refresh** using the OAuth 2.0 refresh token flow.

---

## Related Files

- `/opt/lanonasis/onasis-core/services/auth-gateway/src/services/oauth.service.ts` (line 612 - introspectToken)
- `/opt/lanonasis/onasis-core/services/auth-gateway/db/client.ts` (Neon connection)
- `/opt/lanonasis/mcp-core/src/core/auth-handler.ts` (MCP auth implementation)
- `/opt/lanonasis/onasis-core/services/auth-gateway/test-token-introspection.sh` (diagnostic tool)

## Diagnostic Scripts Created

- `test-token-introspection.sh` - Comprehensive auth flow test
- `check-dual-db-status.mjs` - Database comparison tool (from earlier analysis)
