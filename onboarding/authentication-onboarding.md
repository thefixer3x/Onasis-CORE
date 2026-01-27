# Authentication Onboarding Guide

**Version:** 1.0  
**Last Updated:** November 1, 2025  
**Database:** Neon PostgreSQL 17.5 (super-night-54410645)

---

## Overview

This guide walks you through integrating your application with The Fixer Initiative's centralized authentication system, which supports:

- **OAuth 2.0** (Authorization Code Flow, Client Credentials, PKCE)
- **SAML 2.0** (Enterprise SSO)
- **SSO Domains** (Email domain-based authentication routing)
- **JWT Token Verification** (Via auth gateway)

---

## Prerequisites

### Database Access
- [ ] Neon database connection string (production or staging)
- [ ] Read access to `auth` schema
- [ ] Write access to `control_room.user_app_access` (for permissions)

### Application Requirements
- [ ] Application registered in `control_room.apps` table
- [ ] Unique `app_id` assigned
- [ ] Service endpoint configured in `control_room.service_endpoints`

### Environment Variables
\`\`\`bash
# Required
postgresql://<user>:<password>@<host>:<port>/<db>
AUTH_GATEWAY_URL=https://auth.yourdomain.com
TOKEN_VERIFY_ENDPOINT=https://auth.yourdomain.com/v1/auth/verify-token

# Optional (OAuth / PKCE)
OAUTH_CLIENT_ID=your_client_id_here
OAUTH_REDIRECT_URI=https://yourapp.com/auth/callback
OAUTH_AUTHORIZE_URL=https://auth.yourdomain.com/oauth/authorize
OAUTH_TOKEN_URL=https://auth.yourdomain.com/oauth/token
OAUTH_REFRESH_URL=https://auth.yourdomain.com/oauth/token/refresh
OAUTH_CODE_CHALLENGE_METHOD=S256

# Confidential clients only
OAUTH_CLIENT_SECRET=your_client_secret_here
\`\`\`

---

## Authentication Schemas

### `auth` Schema (18 tables)
Core Supabase-compatible authentication with enhancements:

| Table | Purpose |
|-------|---------|
| `users` | Primary user identities |
| `identities` | Linked provider identities (Google, GitHub, etc.) |
| `sessions` | Active user sessions with JWT |
| `refresh_tokens` | Long-lived tokens for session renewal |
| `mfa_factors` | Multi-factor authentication methods |
| `mfa_challenges` | Active MFA verification challenges |
| `oauth_clients` | OAuth 2.0 client applications |
| `oauth_authorizations` | User authorization grants |
| `oauth_consents` | User consent records |
| `saml_providers` | SAML 2.0 identity providers |
| `saml_relay_states` | SAML flow state tracking |
| `sso_providers` | Generic SSO provider configs |
| `sso_domains` | Email domain → SSO provider mapping |
| `one_time_tokens` | Password reset, email verification |
| `audit_log_entries` | Authentication event logging |
| `flow_state` | OAuth/SAML flow state management |
| `mfa_amr_claims` | Authentication method references |
| `instances` | Multi-instance support (Supabase compat) |

### `auth_gateway` Schema (12 tables)
API client management and admin access control:

| Table | Purpose |
|-------|---------|
| `api_clients` | API keys and client credentials |
| `sessions` | Gateway session tracking |
| `auth_codes` | OAuth authorization codes |
| `user_accounts` | Gateway user accounts |
| `admin_sessions` | Admin portal sessions |
| `admin_access_log` | Admin action audit log |
| `admin_override` | Emergency access overrides |
| `audit_log` | Comprehensive audit trail |
| `oauth_clients` | PKCE client registry (IDE, CLI, dashboard) |
| `oauth_authorization_codes` | Short-lived authorization codes with PKCE challenge |
| `oauth_tokens` | Issued access and refresh tokens |
| `oauth_audit_log` | OAuth2 event trail and anomaly tracking |

---

## Step 1: Register Your Application

### 1.1 Add to Control Room Registry

\`\`\`sql
-- Insert your app into the registry
INSERT INTO control_room.apps (
    app_id,
    app_name,
    target_schema,
    description,
    status,
    metadata
) VALUES (
    'app_your_service',          -- Unique app_id
    'Your Service Name',          -- Display name
    'app_your_service',           -- Target schema (must exist)
    'Description of your service', -- What it does
    'active',                     -- Status: active, inactive, deprecated
    jsonb_build_object(
        'version', '1.0.0',
        'repository', 'https://github.com/yourorg/yourapp',
        'auth_required', true,
        'auth_methods', ARRAY['oauth', 'jwt']
    )
) RETURNING id, app_id;
\`\`\`

### 1.2 Grant User Access

\`\`\`sql
-- Grant access to specific users
INSERT INTO control_room.user_app_access (
    user_id,
    app_id,
    granted_by,
    granted_at
) VALUES (
    'user-uuid-here',
    'app_your_service',
    'admin-uuid-here',
    NOW()
);
\`\`\`

---

## Step 2: OAuth 2.0 Setup

### 2.1 Register OAuth Client

```sql
-- Register OAuth 2.0 / PKCE client with auth-gateway
INSERT INTO auth_gateway.oauth_clients (
    client_id,
    client_name,
    client_type,
    require_pkce,
    allowed_redirect_uris,
    allowed_scopes,
    default_scopes,
    status,
    description
) VALUES (
    'yourapp-prod',
    'Your App Name',
    'public',
    TRUE,
    '["https://yourapp.com/auth/callback","http://localhost:3000/auth/callback"]'::jsonb,
    ARRAY['memories:read','profile'],
    ARRAY['memories:read'],
    'active',
    'OAuth client for Your App (PKCE)'
) ON CONFLICT (client_id) DO UPDATE
SET allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
    allowed_scopes       = EXCLUDED.allowed_scopes,
    status               = EXCLUDED.status,
    updated_at           = NOW()
RETURNING id, client_id, status;
\`\`\`
> **Confidential clients** should set `client_type = 'confidential'` and store the client secret in the secret manager. Public clients (IDE, CLI, SPA) keep `client_type = 'public'` and rely solely on PKCE.

### 2.2 OAuth Flow Implementation

#### Authorization Request
```http
GET https://auth.lanonasis.com/oauth/authorize?
  response_type=code&
  client_id=yourapp-prod&
  redirect_uri=https://yourapp.com/auth/callback&
  scope=memories:read profile&
  state=random-state-string&
  code_challenge=QV18zwMT_0EMIEdsaPKL0Tn9Q_vhogqrFrpQCfABr28&
  code_challenge_method=S256
```

Generate a PKCE pair before redirecting the user:

```javascript
import crypto from "node:crypto";

export function createPkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}
```

#### Token Exchange
```http
POST https://auth.lanonasis.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=received_auth_code&
redirect_uri=https://yourapp.com/auth/callback&
client_id=yourapp-prod&
code_verifier=your_original_code_verifier
```

Confidential clients include `client_secret=your-client-secret` in the same body.

#### Refresh Token Exchange
```http
POST https://auth.lanonasis.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=stored_refresh_token&
client_id=yourapp-prod&
code_verifier=rotated_code_verifier
```

#### Response
\`\`\`json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_token_here",
  "scope": "openid profile email"
}
\`\`\`

---

## Step 3: SAML 2.0 Setup (Enterprise SSO)

### 3.1 Register SAML Provider

\`\`\`sql
-- Add SAML identity provider
INSERT INTO auth.saml_providers (
    id,
    sso_provider_id,            -- Links to sso_providers table
    entity_id,                  -- IdP entity ID (from IdP metadata)
    metadata_xml,               -- Full SAML metadata XML
    metadata_url,               -- URL to fetch metadata (optional)
    attribute_mapping,          -- Map SAML attributes to user fields
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'corporate-sso-uuid',
    'https://idp.yourcompany.com/saml/metadata',
    '<?xml version="1.0"?>...',  -- Paste IdP metadata XML
    'https://idp.yourcompany.com/saml/metadata',
    jsonb_build_object(
        'email', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        'firstName', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
        'lastName', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
    ),
    NOW(),
    NOW()
) RETURNING id;
\`\`\`

### 3.2 Configure SSO Provider

\`\`\`sql
-- Create SSO provider entry
INSERT INTO auth.sso_providers (
    id,
    provider_type,              -- 'saml' or 'oauth'
    provider_name,              -- Display name
    configuration,              -- Provider-specific config
    created_at,
    updated_at
) VALUES (
    'corporate-sso-uuid',
    'saml',
    'Corporate SSO',
    jsonb_build_object(
        'sso_url', 'https://idp.yourcompany.com/saml/sso',
        'issuer', 'https://yourapp.com',
        'certificate', 'MIIDXTCCAkWgAwIBAgI...'  -- X.509 certificate
    ),
    NOW(),
    NOW()
);
\`\`\`

### 3.3 Map Email Domains to SSO

\`\`\`sql
-- Route users by email domain
INSERT INTO auth.sso_domains (
    id,
    sso_provider_id,
    domain,                     -- Email domain (e.g., 'yourcompany.com')
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'corporate-sso-uuid',
    'yourcompany.com',
    NOW(),
    NOW()
);
\`\`\`

---

## Step 4: JWT Token Verification

### 4.1 Register Verification Endpoint

```sql
-- Register your verification endpoint in the service registry
INSERT INTO control_room.service_endpoints (
    service_id,
    environment,
    endpoint_type,
    protocol,
    url,
    status,
    notes
) VALUES (
    'app_your_service',
    'production',
    'token-verify',
    'https',
    'https://auth.lanonasis.com/v1/auth/verify-token',
    'live',
    'JWT verification for app_your_service'
) ON CONFLICT (service_id, environment, endpoint_type, url) DO UPDATE
SET status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW();
```
`\`

### 4.2 Verify Tokens in Your Application

#### Node.js Example
\`\`\`javascript
import fetch from 'node-fetch';

async function verifyToken(accessToken) {
  const response = await fetch(process.env.TOKEN_VERIFY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ token: accessToken })
  });

  if (!response.ok) {
    throw new Error('Token verification failed');
  }

  const { user, session } = await response.json();
  return { user, session };
}

// Middleware example (Express)
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const { user, session } = await verifyToken(token);
    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
\`\`\`

#### Python Example (FastAPI)
\`\`\`python
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import os

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            os.getenv('TOKEN_VERIFY_ENDPOINT'),
            json={'token': token},
            headers={'Authorization': f'Bearer {token}'},
            timeout=5.0
        )
    
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail='Invalid token')
    
    data = response.json()
    return data['user'], data['session']

# Usage in route
@app.get('/protected')
async def protected_route(user_session = Depends(verify_token)):
    user, session = user_session
    return {'user': user, 'session': session}
\`\`\`

---

## Step 5: Testing & Verification

### 5.1 Test Database Connectivity

```bash
# Run connectivity test
node test-db-connection.js

# Expected output:
# ✅ Database connection successful!
# Database: neondb
# PostgreSQL Version: 17.5
```

```bash
node scripts/test-connectivity.cjs
```

### 5.2 Verify OAuth Client Registration

```sql
-- Check your OAuth client
SELECT 
    client_id,
    client_name,
    client_type,
    allowed_redirect_uris,
    allowed_scopes,
    status,
    updated_at
FROM auth_gateway.oauth_clients
WHERE client_id = 'yourapp-prod';

\`\`\`

### 5.3 Test Token Verification

\`\`\`bash
# Get a test token (from your auth flow)
export TEST_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test verification endpoint
curl -X POST https://auth.lanonasis.com/v1/auth/verify-token \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "'$TEST_TOKEN'"}'
\`\`\`

### 5.4 Check User Access Permissions

\`\`\`sql
-- Verify user has access to your app
SELECT 
    u.email,
    uaa.app_id,
    uaa.granted_at,
    uaa.granted_by
FROM control_room.user_app_access uaa
JOIN auth.users u ON uaa.user_id = u.id
WHERE uaa.app_id = 'app_your_service';
\`\`\`

---

## Step 6: CICD Integration

### 6.1 Environment Variable Setup

Add to your CI/CD pipeline (GitHub Actions, GitLab CI, etc.):

\`\`\`yaml
# .github/workflows/deploy.yml
env:
postgresql://<user>:<password>@<host>:<port>/<db>
  AUTH_GATEWAY_URL: ${{ secrets.AUTH_GATEWAY_URL }}
  TOKEN_VERIFY_ENDPOINT: ${{ secrets.TOKEN_VERIFY_ENDPOINT }}
  OAUTH_CLIENT_ID: ${{ secrets.OAUTH_CLIENT_ID }}
  OAUTH_REDIRECT_URI: ${{ secrets.OAUTH_REDIRECT_URI }}
  OAUTH_AUTHORIZE_URL: ${{ secrets.OAUTH_AUTHORIZE_URL }}
  OAUTH_TOKEN_URL: ${{ secrets.OAUTH_TOKEN_URL }}
  OAUTH_REFRESH_URL: ${{ secrets.OAUTH_REFRESH_URL }}
  OAUTH_CODE_CHALLENGE_METHOD: S256
  OAUTH_CLIENT_SECRET: ${{ secrets.OAUTH_CLIENT_SECRET }} # optional (confidential clients)
\`\`\`

### 6.2 Database Migration in CI

\`\`\`yaml
- name: Run Auth Migrations
  run: |
    # Check if app exists
    psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    
    # Register if not exists
    if [ $? -ne 0 ]; then
      psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    fi
\`\`\`

### 6.3 Health Check Script

\`\`\`bash
#!/bin/bash
# scripts/health_check.sh

echo "Testing auth gateway..."
curl -f $AUTH_GATEWAY_URL/health || exit 1

echo "Testing token verification..."
curl -f $TOKEN_VERIFY_ENDPOINT -H "Authorization: Bearer test" || exit 1

echo "Testing database connection..."
node test-db-connection.js || exit 1

echo "✅ All health checks passed"
\`\`\`

---

## Common Issues & Troubleshooting

### Issue: "Token verification failed"
**Cause:** Invalid token or expired session  
**Solution:**
\`\`\`sql
-- Check session validity
SELECT 
    s.id,
    s.user_id,
    s.created_at,
    s.not_after,
    s.not_after < NOW() as is_expired
FROM auth.sessions s
WHERE s.user_id = 'user-uuid';

-- Revoke expired sessions
DELETE FROM auth.sessions WHERE not_after < NOW();
\`\`\`

### Issue: "OAuth redirect_uri mismatch"
**Cause:** Callback URL not in allowed list  
**Solution:**
```sql
-- Update allowed redirect URIs
UPDATE auth_gateway.oauth_clients
SET 
    allowed_redirect_uris = "[\"https://yourapp.com/auth/callback\",\"http://localhost:3000/auth/callback\"]"::jsonb,
    updated_at = NOW()
WHERE client_id = 'yourapp-prod';
````\`

### Issue: "User doesn't have access to app"
**Cause:** Missing entry in `user_app_access`  
**Solution:**
\`\`\`sql
-- Grant access
INSERT INTO control_room.user_app_access (user_id, app_id, granted_by)
VALUES ('user-uuid', 'app_your_service', 'admin-uuid')
ON CONFLICT (user_id, app_id) DO NOTHING;
\`\`\`

### Issue: "SAML SSO not working"
**Cause:** Domain mapping missing  
**Solution:**
\`\`\`sql
-- Check domain mappings
SELECT d.domain, p.provider_name
FROM auth.sso_domains d
JOIN auth.sso_providers p ON d.sso_provider_id = p.id;

-- Add missing domain
INSERT INTO auth.sso_domains (id, sso_provider_id, domain)
VALUES (gen_random_uuid(), 'provider-uuid', 'yourcompany.com');
\`\`\`

---

## Security Best Practices

1. **Never commit credentials**
   - Use `.env.local` (in `.gitignore`)
   - Store secrets in CI/CD secrets manager
   - Rotate OAuth client secrets regularly

2. **Use HTTPS everywhere**
   - Enforce TLS 1.2+ for all endpoints
   - Validate SSL certificates
   - Use secure cookies for sessions

3. **Implement token rotation**
   \`\`\`javascript
   // Refresh tokens before expiry
   if (tokenExpiresIn < 300) { // 5 minutes
     const newToken = await refreshAccessToken(refreshToken);
     updateTokenInStorage(newToken);
   }
   \`\`\`

4. **Enable audit logging**
   \`\`\`sql
   -- Track authentication events
   INSERT INTO auth.audit_log_entries (
       instance_id, user_id, action, ip_address, user_agent
   ) VALUES (
       '00000000-0000-0000-0000-000000000000',
       user_id,
       'token.refreshed',
       client_ip,
       user_agent
   );
   \`\`\`

5. **Monitor failed attempts**
   \`\`\`sql
   -- Alert on excessive failures
   SELECT 
       user_id,
       COUNT(*) as failed_attempts,
       MAX(created_at) as last_attempt
   FROM auth.audit_log_entries
   WHERE action LIKE '%failed%'
       AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY user_id
   HAVING COUNT(*) > 10;
   \`\`\`

---

## Support & Resources

- **Documentation:** `/db-setup-kit/auth_gateway_registry.md`
- **Schema Reference:** `/database_schema_summary.md`
- **Migration Scripts:** `/scripts/neon_02_supabase_auth.sql`, `/scripts/merge_auth_oauth_saml.sql`
- **Test Scripts:** `test-db-connection.js`, `scripts/test-connectivity.cjs`

### Contact
- **Repository:** https://github.com/thefixer3x/db-recovery-tfi-v0
- **Issues:** https://github.com/thefixer3x/db-recovery-tfi-v0/issues

---

**Next Steps:**
1. Copy this guide to your repository
2. Update environment variables
3. Run registration scripts
4. Test authentication flow
5. Deploy to staging
6. Monitor audit logs
7. Roll out to production

✅ **Ready to integrate!**
