# Quick Start: Apply Neon Migrations

## Prerequisites

1. **psql** installed (PostgreSQL client)
2. **Neon database connection strings** for:
   - `app_lanonasis_maas` (Memory Service)
   - `security_service` (Vendor Management & API Keys)

---

## Step 1: Set Environment Variables

```bash
# Export your Neon database connection strings
export MAAS_DATABASE_URL='postgresql://neondb_owner:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/app_lanonasis_maas?sslmode=require'

export SECURITY_DATABASE_URL='postgresql://neondb_owner:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/security_service?sslmode=require'
```

**Get your connection strings:**

```bash
# For MaaS database
neonctl connection-string <project-id> --database-name app_lanonasis_maas --role-name neondb_owner

# For Security Service database
neonctl connection-string <project-id> --database-name security_service --role-name neondb_owner
```

---

## Step 2: Run the Migration Script

```bash
cd apps/onasis-core
./apply-neon-migrations.sh
```

The script will:

1. ✅ Test database connections
2. ✅ Check for required extensions (vector, pgcrypto)
3. ✅ Apply MaaS migration (002_memory_service_maas.sql)
4. ✅ Apply Vendor Management migration (001_vendor_management.sql)
5. ✅ Apply External Vendor Keys migration (003_external_vendor_keys.sql)
6. ✅ Verify all schemas and functions

---

## Step 3: Verify Migrations

### Verify MaaS Database

```bash
psql "$MAAS_DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'maas' ORDER BY table_name;"
```

**Expected tables:**

- `maas.organizations`
- `maas.users`
- `maas.topics`
- `maas.memory_entries`
- `maas.memory_versions`
- `maas.api_key_usage`
- `maas.usage_analytics`

### Verify Security Service Database

```bash
psql "$SECURITY_DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vendor%' OR table_name LIKE 'external%' ORDER BY table_name;"
```

**Expected tables:**

- `vendor_organizations`
- `vendor_api_keys`
- `vendor_usage_logs`
- `vendor_billing_records`
- `vendor_platform_sessions`
- `external_vendor_keys`
- `external_vendor_key_audit_log`

---

## Step 4: Test the Setup

### Test MaaS Database

```sql
-- Connect to MaaS database
psql "$MAAS_DATABASE_URL"

-- Check demo organization
SELECT * FROM maas.organizations WHERE slug = 'demo-org';

-- Test vector search function
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'maas';
```

### Test Security Service Database

```sql
-- Connect to Security Service database
psql "$SECURITY_DATABASE_URL"

-- Check demo vendor
SELECT * FROM vendor_organizations WHERE vendor_code = 'ONASIS_DEMO';

-- Generate a test API key
SELECT * FROM generate_vendor_api_key(
    (SELECT id FROM vendor_organizations WHERE vendor_code = 'ONASIS_DEMO'),
    'Test API Key',
    'test',
    'development'
);
```

---

## Troubleshooting

### Error: "vector extension not available"

The `vector` extension is required for MaaS. Check if it's available:

```bash
psql "$MAAS_DATABASE_URL" -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"
```

If not available, contact Neon support or use a different Neon project that supports pgvector.

### Error: "pgcrypto extension not available"

```bash
psql "$SECURITY_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### Error: "connection refused"

Check your connection strings:

```bash
# Test connection
psql "$MAAS_DATABASE_URL" -c "SELECT NOW();"
psql "$SECURITY_DATABASE_URL" -c "SELECT NOW();"
```

### Error: "table already exists"

If you need to re-run migrations, drop the schemas first:

```sql
-- For MaaS (CAUTION: This deletes all data!)
DROP SCHEMA IF EXISTS maas CASCADE;

-- For Security Service (CAUTION: This deletes all data!)
DROP TABLE IF EXISTS vendor_platform_sessions CASCADE;
DROP TABLE IF EXISTS vendor_billing_records CASCADE;
DROP TABLE IF EXISTS vendor_usage_logs CASCADE;
DROP TABLE IF EXISTS vendor_api_keys CASCADE;
DROP TABLE IF EXISTS vendor_organizations CASCADE;
DROP TABLE IF EXISTS external_vendor_key_audit_log CASCADE;
DROP TABLE IF EXISTS external_vendor_keys CASCADE;
```

---

## Manual Migration (Alternative)

If the script doesn't work, you can apply migrations manually:

### MaaS Database

```bash
psql "$MAAS_DATABASE_URL" -f supabase/migrations/002_memory_service_maas.sql
```

### Security Service Database

```bash
psql "$SECURITY_DATABASE_URL" -f supabase/migrations/001_vendor_management.sql
psql "$SECURITY_DATABASE_URL" -f supabase/migrations/003_external_vendor_keys.sql
```

---

## What's Next?

After migrations are applied:

1. **Update your application code** to use the new database schemas
2. **Test the OAuth login flow** (should now work with the fixed routes)
3. **Generate API keys** for your vendors/clients
4. **Test the MaaS API** endpoints
5. **Monitor the audit logs** in both databases

---

## Migration Files Summary

| File                           | Target Database      | Purpose                                |
| ------------------------------ | -------------------- | -------------------------------------- |
| `002_memory_service_maas.sql`  | `app_lanonasis_maas` | Memory storage with vector embeddings  |
| `001_vendor_management.sql`    | `security_service`   | Vendor authentication and billing      |
| `003_external_vendor_keys.sql` | `security_service`   | Store external API keys (OpenAI, etc.) |

---

## Important Notes

1. **Table Name Change**: Migration 003 was renamed from `vendor_api_keys` to `external_vendor_keys` to avoid conflict with migration 001.

2. **Schema Separation**:
   - MaaS uses `maas` schema
   - Vendor management uses `public` schema
   - Core audit uses `core` schema (already applied)

3. **RLS Policies**: All tables have Row Level Security enabled. Use `service_role` for backend operations.

4. **Extensions Required**:
   - MaaS: `uuid-ossp`, `pgcrypto`, `vector`
   - Security Service: `uuid-ossp`, `pgcrypto`

---

**Ready to Execute!** 🚀

Run `./apply-neon-migrations.sh` to get started.
