# Database Sync Analysis Report

**Date:** 2025-12-01  
**System:** Lanonasis Auth Gateway  
**Analyzed By:** System Audit

---

## Executive Summary

The system uses a **dual-database architecture** with **Neon (primary)** and **Supabase (secondary)**. However, **NO automatic sync mechanism exists between the two databases**. The "sync" functions found are internal triggers that maintain consistency within individual schemas, not cross-database replication.

---

## Database Architecture

### 1. Neon Database (Primary)
- **Type:** Serverless Postgres
- **Connection:** Direct via `@neondatabase/serverless` pool
- **Usage:** Primary data store for all operations
- **Schemas:** 40+ schemas including:
  - `security_service` - API key management (primary location)
  - `public` - Legacy API keys, OAuth clients
  - `auth_gateway` - Auth service data
  - Multiple app-specific schemas

### 2. Supabase Database (Secondary)
- **Type:** Managed Postgres
- **Connection:** Via `@supabase/supabase-js` client
- **Usage:** Limited to public schema operations
- **Restriction:** Cannot access `security_service` schema (by design)
- **Schema Access:** Only `public` schema available via Supabase SDK

---

## Current Data Distribution

### API Key Tables Found

#### In Neon (All Accessible):
```
security_service.api_key_projects     (0 records)
security_service.stored_api_keys      (0 records)
security_service.api_keys             (0 records)
public.api_keys                       (0 records)
public.api_key_projects               (0 records)
public.stored_api_keys                (0 records)
public.client_api_keys                (0 records)
public.vendor_api_keys                (0 records)
app_lanonasis_maas.api_keys           (0 records)
app_onasis_core.api_keys              (0 records)
maas.api_key_usage                    (0 records)
vendors.api_keys                      (1 record)
```

#### In Supabase (Limited Access):
```
public.api_keys                       (accessible)
security_service.*                    (NOT accessible - schema restricted)
```

---

## "Sync" Mechanisms Found

### ✅ FOUND: Internal Consistency Triggers
**NOT** database replication - these are **field-level sync triggers**:

#### 1. `app_lanonasis_maas.sync_is_active()`
```sql
CREATE TRIGGER trigger_sync_is_active 
BEFORE INSERT OR UPDATE ON app_lanonasis_maas.api_keys
FOR EACH ROW EXECUTE FUNCTION sync_is_active()
```

**Purpose:** Syncs `is_active` flag with `revoked_at` timestamp within the same table:
- If `revoked_at` is set → `is_active` = false
- If `revoked_at` is null → `is_active` = true

#### 2. `app_onasis_core.sync_is_active()`
```sql
CREATE TRIGGER trigger_sync_is_active 
BEFORE INSERT OR UPDATE ON app_onasis_core.api_keys
FOR EACH ROW EXECUTE FUNCTION sync_is_active()
```

**Purpose:** Same as above, for app_onasis_core schema

### ❌ NOT FOUND: Cross-Database Sync
- No triggers that write to Supabase
- No background jobs/workers for replication
- No CDC (Change Data Capture) pipelines
- No dual-write logic in application code

---

## Code Analysis

### Database Client Usage (`db/client.ts`)

```typescript
// Neon Connection (Primary)
export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,  // Neon
  ssl: { rejectUnauthorized: false },
  max: 10
})

// Supabase Connection (Secondary)
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: { schema: 'public' }  // Limited to public schema
  }
)
```

### Service Layer Patterns

#### API Key Service (`src/services/api-key.service.ts`)
- **Writes:** Only to Supabase (`supabaseAdmin.from('api_keys')`)
- **Reads:** Multi-schema fallback:
  1. Try `security_service.stored_api_keys` (Supabase)
  2. Try `vsecure.lanonasis_api_keys` (legacy - fails)
  3. Try `public.api_keys` (Supabase)

#### Stored Keys Service (`src/services/stored-keys.service.ts`)
- **Writes:** Only to Neon (`dbPool` with `security_service` schema)
- **Reads:** Only from Neon
- **Uses:** `getClientWithSchema()` helper to set search_path

### Current Write Pattern
```typescript
// Example from api-key.service.ts (line 128)
const { data, error } = await supabaseAdmin
  .from('api_keys')
  .insert(apiKeyRecord)
  .select()
  .single()

// No corresponding Neon write!
```

---

## Schema Migration Status

### ✅ Successfully Migrated to Neon:
- `security_service.api_key_projects`
- `security_service.stored_api_keys`
- All tables have proper structure and foreign keys

### ⚠️ Supabase Limitations:
- Cannot access `security_service` schema (Supabase SDK restriction)
- Only `public` schema operations work
- This is **by design** - Supabase restricts schema access for security

---

## Critical Findings

### 🚨 Issue 1: Data Inconsistency Risk
**Problem:** API keys created via `api-key.service.ts` only go to Supabase, not Neon.

**Impact:**
- Data exists in Supabase `public.api_keys` but not in Neon
- If Supabase fails, API key data could be lost
- No backup in Neon database

### 🚨 Issue 2: Schema Access Confusion
**Problem:** Code tries to access `security_service` schema via Supabase SDK, which always fails.

**Impact:**
- Error logs (now suppressed)
- Wasted API calls
- Confusing for developers

### 🚨 Issue 3: Split Data Model
**Problem:** Two different API key systems:
1. **Dashboard/User Keys:** `public.api_keys` (via Supabase)
2. **MCP/Stored Keys:** `security_service.stored_api_keys` (via Neon)

**Impact:**
- Code complexity
- Different validation logic paths
- Potential for missed keys during validation

---

## Recommendations

### 1. Immediate: Clarify Database Roles

**Option A: Neon-Primary Strategy (Recommended)**
```typescript
// Use Neon for ALL writes
import { dbPool } from '../../db/client.js'

async function createApiKey(...) {
  const client = await dbPool.connect()
  try {
    await client.query('SET search_path TO public')
    const result = await client.query(
      'INSERT INTO api_keys (...) VALUES (...)'
    )
    return result.rows[0]
  } finally {
    client.release()
  }
}
```

**Option B: Supabase-Only Strategy**
- Remove Neon dependency for API keys
- Consolidate to `public.api_keys` only
- Migrate MCP keys to public schema

### 2. Medium-Term: Implement True Sync (If Needed)

If dual-database is required:

```typescript
// Dual-write wrapper
async function createApiKeyWithSync(data) {
  // Write to Neon first (source of truth)
  const neonKey = await writeToNeon(data)
  
  try {
    // Then replicate to Supabase
    await writeToSupabase(neonKey)
  } catch (error) {
    // Log replication failure but don't fail operation
    console.error('Supabase sync failed:', error)
  }
  
  return neonKey
}
```

Or use database-level solutions:
- Postgres logical replication
- Debezium CDC
- Custom replication service

### 3. Long-Term: Consolidate

**Unified API Key Table:**
```sql
-- Single source of truth
CREATE TABLE IF NOT EXISTS public.api_keys_unified (
  id UUID PRIMARY KEY,
  key_hash TEXT NOT NULL,
  user_id UUID NOT NULL,
  key_type VARCHAR(50), -- 'user' or 'mcp'
  -- ... other fields
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Current State Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| **Neon → Supabase Sync** | ❌ No | No automatic replication |
| **Supabase → Neon Sync** | ❌ No | No automatic replication |
| **Dual Writes** | ❌ No | Code writes to one DB at a time |
| **Internal Triggers** | ✅ Yes | Field-level consistency only |
| **Schema Access** | ⚠️ Mixed | Neon: full access, Supabase: public only |
| **Data Consistency** | ⚠️ At Risk | Writes split between databases |

---

## Testing Performed

1. ✅ Inspected Neon schemas and tables
2. ✅ Verified Supabase schema restrictions
3. ✅ Analyzed sync triggers and functions
4. ✅ Reviewed service layer code
5. ✅ Checked for dual-write patterns

---

## Conclusion

**The "recently implemented fix that auto syncs both databases" does NOT exist.**

What was found:
- Internal field sync triggers (`is_active` ↔ `revoked_at`)
- Multi-schema read fallback logic
- No cross-database replication

**Action Required:** Choose one of the recommended strategies above to ensure data consistency.

---

## Files Analyzed

- `/opt/lanonasis/onasis-core/services/auth-gateway/db/client.ts`
- `/opt/lanonasis/onasis-core/services/auth-gateway/src/services/api-key.service.ts`
- `/opt/lanonasis/onasis-core/services/auth-gateway/src/services/stored-keys.service.ts`
- Database schemas via SQL queries

## Generated Scripts

- `check-dual-db-status.mjs` - Database comparison tool
- `inspect-sync-functions.mjs` - Trigger/function analyzer
