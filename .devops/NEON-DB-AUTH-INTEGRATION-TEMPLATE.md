# Neon DB + Auth Gateway Integration Template
**Project**: the-fixer-initiative
**Organization**: Vercel: thefixer (org-winter-lake-21791320)
**Date**: 2025-10-20
**Status**: Architecture Design

---

## Executive Summary

Your Neon database (`super-night-54410645`) is already configured with **full Supabase role structure**, creating a perfect foundation for clean authentication. This document outlines how to integrate it with the new `services/auth-gateway/` architecture.

---

## Current Neon DB Configuration

### Project Details
```yaml
Project ID: super-night-54410645
Project Name: the-fixer-initiative
Region: aws-us-east-1
Organization: org-winter-lake-21791320 (Vercel: thefixer)
Database: neondb
Owner: neondb_owner
Branch: main (currently archived)
```

### Existing Database Roles (17 roles discovered)
```
Core Roles:
  ✓ neondb_owner          - Database owner
  ✓ postgres              - Superuser role
  ✓ authenticator         - Connection pooler role
  ✓ pgbouncer             - Connection pooling

Supabase Auth Roles:
  ✓ supabase_auth_admin        - Auth service admin
  ✓ authenticated              - Authenticated users
  ✓ anon                       - Anonymous users
  ✓ service_role               - Backend service role

Supabase Service Roles:
  ✓ supabase_admin             - Platform admin
  ✓ supabase_functions_admin   - Edge Functions
  ✓ supabase_storage_admin     - Storage service
  ✓ supabase_realtime_admin    - Realtime service
  ✓ supabase_replication_admin - Replication
  ✓ supabase_etl_admin         - ETL operations
  ✓ supabase_read_only_user    - Read-only access

Application Roles:
  ✓ cli_login_postgres         - CLI authentication
  ✓ dashboard_user             - Dashboard access
```

**Key Finding**: Your database is **already Supabase-ready**, eliminating migration complexity.

---

## Integration Architecture

### 1. Connection Strategy

#### Database URL Structure
```bash
# Primary connection (via connection pooling)
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

# Direct connection (for migrations)
DIRECT_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

# Supabase-compatible service role connection
SERVICE_ROLE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
```

#### Retrieve Connection Strings
```bash
# Get connection string with pooling
neonctl connection-string super-night-54410645 --role-name neondb_owner --pooled

# Get direct connection string
neonctl connection-string super-night-54410645 --role-name neondb_owner

# Get service role connection (for auth operations)
neonctl connection-string super-night-54410645 --role-name service_role
```

---

### 2. Auth Gateway Database Client

**File**: `services/auth-gateway/db/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { Pool } from '@neondatabase/serverless'

// Neon Postgres connection pool (for direct queries)
export const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

// Supabase client (for auth operations)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL=https://<project-ref>.supabase.co
  process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  }
)

// Health check
export async function checkDatabaseHealth() {
  try {
    const client = await dbPool.connect()
    const result = await client.query('SELECT NOW()')
    client.release()
    return { healthy: true, timestamp: result.rows[0].now }
  } catch (error) {
    return { healthy: false, error: error.message }
  }
}
```

---

### 3. Environment Configuration

**File**: `services/auth-gateway/.env.example`

```bash
# Neon Database Configuration
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
DIRECT_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

# Supabase Configuration (points to Neon DB)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY

# Alternative: Direct Neon + Supabase Auth
# Use Neon for data, Supabase for auth services
NEON_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
SUPABASE_AUTH_URL=https://<project-ref>.supabase.co/auth/v1

# JWT Configuration
JWT_SECRET=REDACTED_JWT_SECRET
JWT_EXPIRY="7d"

# Auth Gateway Configuration
PORT=4000
NODE_ENV="production"
CORS_ORIGIN="http://localhost:5173,https://your-domain.com"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL="info"
LOG_FORMAT="json"
```

---

### 4. Migration Strategy

#### Current State Analysis
```
Existing Setup:
  ✓ Supabase migrations in /supabase/migrations/
  ✓ Core audit logging (core.logs table)
  ✓ Vendor management schema
  ✓ Memory service (MaaS) schema
  ✓ API key management

Current Issues:
  ✗ Credential leaks in documentation (being remediated)
  ✗ Mixed authentication patterns (OAuth, JWT, API keys)
  ✗ No centralized auth gateway
  ✗ Neon DB branch archived (needs activation)
```

#### Migration Path

**Phase 1: Neon DB Preparation** ✓ (Current Phase)
```bash
# 1. Unarchive or create new branch
neonctl branches create --project-id super-night-54410645 --name main-active

# 2. Verify database connectivity
psql "postgresql://<user>:<password>@<host>:<port>/<db>"

# 3. Apply existing migrations
cd /Users/Seye/Onasis-CORE
for migration in supabase/migrations/*.sql; do
  psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
done

# 4. Create auth-specific schema
psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
```

**Phase 2: Auth Gateway Scaffold**
```bash
# Create auth gateway structure
mkdir -p services/auth-gateway/{src,db,migrations,config,tests}
cd services/auth-gateway

# Initialize TypeScript project
npm init -y
npm install @supabase/supabase-js @neondatabase/serverless express
npm install -D typescript @types/node @types/express
```

**Phase 3: Database Schema Setup**

**File**: `services/auth-gateway/migrations/001_init_auth_schema.sql`

```sql
-- Auth Gateway Schema for Neon DB
-- Compatible with existing Supabase roles

-- Create auth gateway schema
CREATE SCHEMA IF NOT EXISTS auth_gateway;

-- Sessions table (for MCP/CLI sessions)
CREATE TABLE IF NOT EXISTS auth_gateway.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('mcp', 'cli', 'web', 'api')),
  token_hash TEXT NOT NULL,
  refresh_token_hash TEXT,
  client_id TEXT,
  scope TEXT[],
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sessions_user_id ON auth_gateway.sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON auth_gateway.sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON auth_gateway.sessions(expires_at);
CREATE INDEX idx_sessions_platform ON auth_gateway.sessions(platform);

-- API clients table (for OAuth apps)
CREATE TABLE IF NOT EXISTS auth_gateway.api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  redirect_uris TEXT[] NOT NULL,
  allowed_scopes TEXT[] NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_clients_client_id ON auth_gateway.api_clients(client_id);
CREATE INDEX idx_api_clients_owner_id ON auth_gateway.api_clients(owner_id);

-- Authorization codes table (OAuth flow)
CREATE TABLE IF NOT EXISTS auth_gateway.auth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES auth_gateway.api_clients(client_id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  redirect_uri TEXT NOT NULL,
  scope TEXT[],
  code_challenge TEXT,
  code_challenge_method TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_codes_expires_at ON auth_gateway.auth_codes(expires_at);

-- Audit log for auth events
CREATE TABLE IF NOT EXISTS auth_gateway.audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  client_id TEXT,
  platform TEXT,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON auth_gateway.audit_log(user_id);
CREATE INDEX idx_audit_log_event_type ON auth_gateway.audit_log(event_type);
CREATE INDEX idx_audit_log_created_at ON auth_gateway.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_success ON auth_gateway.audit_log(success) WHERE success = false;

-- Row Level Security
ALTER TABLE auth_gateway.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.audit_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own sessions" ON auth_gateway.sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all sessions" ON auth_gateway.sessions
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view their API clients" ON auth_gateway.api_clients
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Service role can manage API clients" ON auth_gateway.api_clients
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT USAGE ON SCHEMA auth_gateway TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth_gateway TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA auth_gateway TO service_role;

-- Comments
COMMENT ON SCHEMA auth_gateway IS 'Authentication gateway schema for centralized auth management';
COMMENT ON TABLE auth_gateway.sessions IS 'Active user sessions across all platforms';
COMMENT ON TABLE auth_gateway.api_clients IS 'OAuth API clients and applications';
COMMENT ON TABLE auth_gateway.audit_log IS 'Audit trail for authentication events';
```

**Phase 4: Integration Points**
```
Current Services → Auth Gateway:
  services/api-gateway/       → Use auth-gateway for JWT verification
  services/key-manager/       → Migrate to auth-gateway API key management
  src/services/auth.service.ts → Replace with auth-gateway client SDK
  test-mcp-auth.sh            → Update endpoints to auth-gateway URLs
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Browser  │  │   MCP    │  │   CLI    │  │   API    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
└───────┼─────────────┼─────────────┼─────────────┼──────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                      │
        ┌─────────────▼─────────────────────────┐
        │   services/auth-gateway/              │
        │   ┌───────────────────────────────┐   │
        │   │  Express/Fastify Server       │   │
        │   │  - /auth/login (OAuth)        │   │
        │   │  - /auth/cli-login (JWT)      │   │
        │   │  - /mcp/auth (MCP tokens)     │   │
        │   │  - /auth/verify-token         │   │
        │   └───────────┬───────────────────┘   │
        │               │                        │
        │   ┌───────────▼───────────────────┐   │
        │   │  Supabase Client (Auth)       │   │
        │   └───────────┬───────────────────┘   │
        └───────────────┼───────────────────────┘
                        │
        ┌───────────────▼───────────────────────┐
        │   NEON DATABASE (PostgreSQL)          │
        │   Project: the-fixer-initiative       │
        │   ┌───────────────────────────────┐   │
        │   │ Schema: auth (Supabase)       │   │
        │   │  - users                      │   │
        │   │  - refresh_tokens             │   │
        │   │  - sessions                   │   │
        │   ├───────────────────────────────┤   │
        │   │ Schema: auth_gateway          │   │
        │   │  - sessions (platform tokens) │   │
        │   │  - api_clients (OAuth apps)   │   │
        │   │  - audit_log (auth events)    │   │
        │   ├───────────────────────────────┤   │
        │   │ Schema: core                  │   │
        │   │  - logs (audit trail)         │   │
        │   ├───────────────────────────────┤   │
        │   │ Schema: public                │   │
        │   │  - vendor_apis                │   │
        │   │  - memory_service_logs        │   │
        │   └───────────────────────────────┘   │
        │                                        │
        │   Roles: service_role, authenticated, │
        │          anon, neondb_owner            │
        └────────────────────────────────────────┘
```

---

## Implementation Checklist

### Database Setup
- [ ] Unarchive Neon main branch or create new active branch
- [ ] Obtain fresh connection strings (pooled + direct)
- [ ] Verify Supabase role permissions
- [ ] Apply existing migrations to Neon DB
- [ ] Create `auth_gateway` schema
- [ ] Test database connectivity from local environment

### Auth Gateway Scaffold
- [ ] Create `services/auth-gateway/` directory structure
- [ ] Initialize package.json with dependencies
- [ ] Set up TypeScript configuration
- [ ] Create database client wrapper
- [ ] Implement health check endpoint
- [ ] Configure environment variables

### Integration
- [ ] Update `.env.example` with Neon credentials template
- [ ] Create database migration for auth schema
- [ ] Implement session management service
- [ ] Add OAuth client registration
- [ ] Wire up audit logging to `auth_gateway.audit_log`
- [ ] Update existing services to use auth-gateway

### Testing
- [ ] Update `test-mcp-auth.sh` for new endpoints
- [ ] Create integration tests for auth flows
- [ ] Test Neon connection pooling under load
- [ ] Verify RLS policies work correctly
- [ ] Test credential rotation

### Security
- [ ] Rotate all exposed credentials from leak
- [ ] Store Neon credentials in secure vault (Vercel env vars)
- [ ] Enable Neon IP allowlist (if needed)
- [ ] Configure connection SSL/TLS
- [ ] Set up database backup strategy
- [ ] Implement rate limiting on auth endpoints

---

## Key Decisions Required

### 1. Runtime Preference
- **Option A**: Express (wider ecosystem, mature middleware)
- **Option B**: Fastify (lighter, better for edge deployment)
- **Recommendation**: Fastify for edge-compatible performance

### 2. Deployment Target
- **Option A**: Vercel Edge Functions (integrated with your org)
- **Option B**: Fly.io (closer to Neon DB region aws-us-east-1)
- **Option C**: Platform-neutral Docker container
- **Recommendation**: Fly.io in aws-us-east-1 for minimal latency

### 3. Supabase Usage Pattern
- **Option A**: Full Supabase (hosted auth + Neon as external DB)
- **Option B**: Supabase Local (self-hosted with Neon backend)
- **Option C**: Neon-only (custom auth implementation)
- **Recommendation**: Option B - Local Supabase pointing to Neon

### 4. Branch Strategy
- **Option A**: Unarchive existing `main` branch
- **Option B**: Create new production branch
- **Recommendation**: Create fresh `main-production` branch

---

## Next Steps

1. **Answer key decisions** (runtime, deployment, Supabase pattern)
2. **Activate Neon database** (unarchive or create new branch)
3. **Scaffold auth-gateway** with chosen stack
4. **Apply migrations** to Neon DB
5. **Wire up first endpoint** (health check)
6. **Test connectivity** from local environment
7. **Deploy to staging** environment
8. **Migrate one service** as proof of concept

---

## Connection Commands Reference

```bash
# List all Neon projects
neonctl projects list --org-id org-winter-lake-21791320

# Get project details
neonctl project get super-night-54410645

# Create new branch
neonctl branches create --project-id super-night-54410645 --name main-production

# Get connection string
neonctl connection-string super-night-54410645 --role-name service_role --pooled

# Connect via psql
psql "$(neonctl connection-string super-night-54410645 --role-name neondb_owner)"

# List database roles
neonctl roles list --project-id super-night-54410645

# Create new role (if needed)
neonctl roles create --project-id super-night-54410645 --name auth_gateway_service
```

---

## Security Considerations

1. **Credential Management**
   - Store Neon connection strings in Vercel environment variables
   - Use different credentials for development/staging/production
   - Rotate credentials monthly or after any suspected exposure

2. **Network Security**
   - Neon supports IP allowlists - consider enabling for production
   - Always use SSL/TLS connections (`sslmode=require`)
   - Deploy auth-gateway in same region as Neon (aws-us-east-1)

3. **Database Access**
   - Use `service_role` for auth operations (full access)
   - Use `authenticated` role for user-scoped queries
   - Never expose `neondb_owner` credentials to application layer

4. **Audit Trail**
   - All auth events logged to `auth_gateway.audit_log`
   - Cross-reference with `core.logs` for system-wide auditing
   - Set up alerts for failed login attempts

---

**Status**: Ready for scaffold phase pending runtime/deployment decisions
**Contact**: Generated 2025-10-20
**Neon Project**: the-fixer-initiative (super-night-54410645)
