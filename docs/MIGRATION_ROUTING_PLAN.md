# Migration Routing Plan for Neon Databases

**Date**: November 16, 2025  
**Status**: Ready to Execute

---

## Database Structure

### Neon Projects

1. **`security_service`** - Security and authentication
   - External vendor API keys
   - Authentication gateway
   - OAuth clients and sessions

2. **`app_lanonasis_maas`** - Memory as a Service
   - Memory entries with vector embeddings
   - Organizations and users
   - Topics and memory versions

3. **`the-fixer-initiative` (super-night-54410645)** - Core audit logging
   - Core audit logs
   - System-wide event tracking

---

## Migration Routing

### ✅ Already Applied (Core Audit)

**Target**: `the-fixer-initiative` (super-night-54410645)

- `00000000000001_create_core_logs.sql` ✅ Applied
  - Creates `core.logs` table
  - System-wide audit logging

---

### 🎯 To Apply: Memory Service (MaaS)

**Target**: `app_lanonasis_maas` database

#### Migration 002: Memory Service Schema

**File**: `002_memory_service_maas.sql`

**Contents**:

- `maas.organizations` - Multi-tenant organizations
- `maas.users` - Users within organizations
- `maas.topics` - Hierarchical topic organization
- `maas.memory_entries` - Core memory storage with vector embeddings
- `maas.memory_versions` - Audit trail and versioning
- `maas.api_key_usage` - Usage tracking
- `maas.usage_analytics` - Analytics partitioned by month

**Functions**:

- `match_memories()` - Vector similarity search
- `update_memory_access()` - Access tracking
- `create_memory_version()` - Version history trigger

**Extensions Required**:

- `uuid-ossp` ✅
- `pgcrypto` ✅
- `vector` ⚠️ (needs verification)

---

### 🔐 To Apply: Vendor Management & API Keys

**Target**: `security_service` database

#### Migration 001: Vendor Management

**File**: `001_vendor_management.sql`

**Contents**:

- `vendor_organizations` - Vendor organization management
- `vendor_api_keys` - Vendor authentication keys
- `vendor_usage_logs` - Usage tracking for billing
- `vendor_billing_records` - Billing records
- `vendor_platform_sessions` - Multi-platform SSO

**Functions**:

- `generate_vendor_api_key()` - Generate API key pairs
- `validate_vendor_api_key()` - Validate vendor credentials
- `log_vendor_usage()` - Log API usage
- `get_vendor_usage_summary()` - Usage summary for billing

**Extensions Required**:

- `uuid-ossp` ✅
- `pgcrypto` ✅

#### Migration 003: External Vendor API Keys

**File**: `003_vendor_api_keys.sql`

**Contents**:

- `vendor_api_keys` - Securely stored external vendor keys (OpenAI, Anthropic, etc.)
- `vendor_key_audit_log` - Audit trail for key access

**Note**: This stores YOUR API keys for external services (OpenAI, Anthropic, Perplexity)

---

## Migration Execution Order

### Phase 1: Memory Service (MaaS) ✅ Priority

```bash
# Target: app_lanonasis_maas
# Apply: 002_memory_service_maas.sql

# 1. Verify vector extension
psql "$MAAS_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 2. Apply migration
psql "$MAAS_DATABASE_URL" -f supabase/migrations/002_memory_service_maas.sql

# 3. Verify schema
psql "$MAAS_DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'maas';"
```

### Phase 2: Security Service (Vendor Management) ✅ Priority

```bash
# Target: security_service
# Apply: 001_vendor_management.sql, 003_vendor_api_keys.sql

# 1. Apply vendor management
psql "$SECURITY_DATABASE_URL" -f supabase/migrations/001_vendor_management.sql

# 2. Apply external API keys
psql "$SECURITY_DATABASE_URL" -f supabase/migrations/003_vendor_api_keys.sql

# 3. Verify schema
psql "$SECURITY_DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'vendor%';"
```

---

## Environment Variables Required

### For MaaS Database

```bash
MAAS_DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/app_lanonasis_maas?sslmode=require"
```

### For Security Service Database

```bash
SECURITY_DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/security_service?sslmode=require"
```

### For Core Audit Database (Already Applied)

```bash
CORE_DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

---

## Pre-Migration Checklist

### MaaS Database (`app_lanonasis_maas`)

- [ ] Verify database exists and is accessible
- [ ] Check if `vector` extension is available
- [ ] Backup existing data (if any)
- [ ] Verify connection string works

### Security Service Database (`security_service`)

- [ ] Verify database exists and is accessible
- [ ] Check if `pgcrypto` extension is enabled
- [ ] Backup existing data (if any)
- [ ] Verify connection string works

---

## Post-Migration Verification

### MaaS Database

```sql
-- Verify schema
SELECT table_name FROM information_schema.tables WHERE table_schema = 'maas';

-- Verify functions
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'maas';

-- Verify vector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Test demo organization
SELECT * FROM maas.organizations WHERE slug = 'demo-org';
```

### Security Service Database

```sql
-- Verify vendor tables
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vendor%';

-- Verify functions
SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%vendor%';

-- Verify demo vendor
SELECT * FROM vendor_organizations WHERE vendor_code = 'ONASIS_DEMO';

-- Test API key generation
SELECT * FROM generate_vendor_api_key(
    (SELECT id FROM vendor_organizations WHERE vendor_code = 'ONASIS_DEMO'),
    'Test Key',
    'test',
    'development'
);
```

---

## Rollback Plan

### If Migration Fails

#### MaaS Database

```sql
-- Drop schema and all objects
DROP SCHEMA IF EXISTS maas CASCADE;
```

#### Security Service Database

```sql
-- Drop vendor tables
DROP TABLE IF EXISTS vendor_platform_sessions CASCADE;
DROP TABLE IF EXISTS vendor_billing_records CASCADE;
DROP TABLE IF EXISTS vendor_usage_logs CASCADE;
DROP TABLE IF EXISTS vendor_api_keys CASCADE;
DROP TABLE IF EXISTS vendor_organizations CASCADE;
DROP TABLE IF EXISTS vendor_key_audit_log CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS generate_vendor_api_key CASCADE;
DROP FUNCTION IF EXISTS validate_vendor_api_key CASCADE;
DROP FUNCTION IF EXISTS log_vendor_usage CASCADE;
DROP FUNCTION IF EXISTS get_vendor_usage_summary CASCADE;
```

---

## Notes

1. **Migration 003 Conflict**: The `vendor_api_keys` table in migration 003 is for storing EXTERNAL vendor keys (OpenAI, Anthropic), while migration 001 has a table with the same name for YOUR API keys. Consider renaming one:
   - Migration 001: `vendor_api_keys` → Keep (for your API keys to vendors)
   - Migration 003: `vendor_api_keys` → Rename to `external_vendor_keys` or `stored_vendor_keys`

2. **Vector Extension**: The `vector` extension is required for MaaS. Verify it's available in your Neon project:

   ```bash
   psql "$MAAS_DATABASE_URL" -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"
   ```

3. **Schema Separation**:
   - MaaS uses `maas` schema (clean separation)
   - Vendor management uses `public` schema
   - Core audit uses `core` schema

4. **RLS Policies**: All tables have Row Level Security enabled. Ensure your application uses the correct role (`service_role` for backend operations).

---

**Ready to Execute**: Yes  
**Estimated Time**: 10-15 minutes  
**Risk Level**: Low (clean schemas, no data conflicts)
