# API Key & Auth Schema Reference

**Location:** `/apps/onasis-core/docs/supabase-api/SCHEMA_REFERENCE.md`  
**Last Updated:** 2026-05-17  
**Source:** Live database verification via `$PG_URL`

---

## Overview

This document is the **single source of truth** for all API key-related table names, schema locations, and relationships in the Lan Onasis platform.

---

## Schema Taxonomy

### Primary Schemas

| Schema             | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `public`           | Main application tables, API keys, auth events |
| `auth`             | Supabase auth (managed separately)             |
| `analytics`        | Usage logs, audit trails, metrics              |
| `security_service` | Stored API keys (encrypted)                    |

---

## API Key Tables (ACTUAL LIVE STATE)

### 1. INTERNAL API Keys (User Authentication)

**Table:** `public.api_keys`  
**Purpose:** Platform API authentication - validates when users make API requests  
**Method:** SHA-256 hashing (`key_hash` column) + original key stored for display

| Column            | Type        | Description                       |
| ----------------- | ----------- | --------------------------------- |
| `id`              | UUID        | Primary key                       |
| `user_id`         | UUID        | FK → `auth.users`                 |
| `key`             | TEXT        | Plain key prefix (`vx_xxx...`)    |
| `key_hash`        | VARCHAR(64) | SHA-256 hash of full key          |
| `name`            | TEXT        | User-friendly name                |
| `service`         | TEXT        | Service scope (`all` or specific) |
| `is_active`       | BOOLEAN     | Active status                     |
| `access_level`    | TEXT        | `authenticated`, `admin`, etc.    |
| `expires_at`      | TIMESTAMPTZ | Expiration                        |
| `last_used_at`    | TIMESTAMPTZ | Usage tracking                    |
| `organization_id` | UUID        | FK → `organizations`              |
| `permissions`     | JSONB       | Scoped permissions                |
| `created_at`      | TIMESTAMPTZ | Creation timestamp                |

**Relationships:**

- FK → `auth.users(id)` ON DELETE CASCADE
- FK → `organizations(id)` ON DELETE CASCADE
- Referenced by `api_key_scopes`, `mcp_rate_limits`, `analytics.mcp_usage_logs`

**Indexes:**

- `idx_api_keys_key_hash` - For validation lookups
- `idx_api_keys_user_id` - User queries
- `idx_api_keys_organization_id` - Org queries
- `idx_api_keys_service` - Service filtering

---

### 2. API Key Scopes (MCP Service Mapping)

**Table:** `public.api_key_scopes`  
**Purpose:** Junction table - maps API keys to allowed MCP services

| Column                 | Type        | Description                |
| ---------------------- | ----------- | -------------------------- |
| `id`                   | UUID        | Primary key                |
| `api_key_id`           | UUID        | FK → `public.api_keys`     |
| `service_key`          | TEXT        | FK → `mcp_service_catalog` |
| `allowed_actions`      | TEXT[]      | Specific actions allowed   |
| `max_calls_per_minute` | INTEGER     | Rate limit                 |
| `max_calls_per_day`    | INTEGER     | Rate limit                 |
| `created_at`           | TIMESTAMPTZ | Creation timestamp         |

**Relationships:**

- FK → `public.api_keys(id)` ON DELETE CASCADE
- FK → `public.mcp_service_catalog(service_key)` ON DELETE CASCADE

---

### 3. API Key Projects

**Table:** `public.api_key_projects`  
**Purpose:** Projects that contain stored/encrypted API keys

| Column            | Type         | Description          |
| ----------------- | ------------ | -------------------- |
| `id`              | UUID         | Primary key          |
| `name`            | VARCHAR(255) | Project name         |
| `organization_id` | UUID         | FK → `organizations` |
| `owner_id`        | UUID         | FK → `users`         |
| `team_members`    | UUID[]       | Team member user IDs |
| `settings`        | JSONB        | Project settings     |

**Relationships:**

- FK → `organizations(id)`
- Referenced by `security_service.stored_api_keys`

---

### 4. Stored/Encrypted API Keys (Reference Table)

**Table:** `security_service.stored_api_keys`  
**Purpose:** Encrypted storage for third-party vendor keys  
**Method:** AES-256-GCM encryption (reversible)

> **Note:** This is a VIEW in `public` but actual table is in `security_service` schema.

| Column            | Type         | Description                            |
| ----------------- | ------------ | -------------------------------------- |
| `id`              | UUID         | Primary key                            |
| `name`            | VARCHAR(255) | Key name                               |
| `encrypted_value` | TEXT         | AES-encrypted key                      |
| `key_type`        | VARCHAR(50)  | `api_key`, `secret_key`, etc.          |
| `environment`     | VARCHAR(50)  | `development`, `staging`, `production` |
| `project_id`      | UUID         | FK → `api_key_projects`                |
| `organization_id` | UUID         | Organization                           |
| `status`          | VARCHAR(50)  | `active`, `inactive`, `revoked`        |

---

### 5. Vendor API Keys

**Table:** `public.vendor_api_keys`  
**Alias:** Foreign keys, external keys  
**Purpose:** Storage for third-party vendor API keys (OpenAI, Anthropic, etc.)

| Column          | Type         | Description                         |
| --------------- | ------------ | ----------------------------------- |
| `id`            | UUID         | Primary key                         |
| `vendor_name`   | VARCHAR(100) | `openai`, `anthropic`, `perplexity` |
| `key_name`      | VARCHAR(200) | `primary`, `backup`                 |
| `encrypted_key` | TEXT         | AES-encrypted vendor key            |
| `description`   | TEXT         | Key description                     |
| `is_active`     | BOOLEAN      | Active status                       |
| `last_used_at`  | TIMESTAMPTZ  | Usage tracking                      |
| `created_at`    | TIMESTAMPTZ  | Creation timestamp                  |

**Unique Constraint:** `(vendor_name, key_name)`

**Relationships:**

- Referenced by `analytics.vendor_key_audit_log`

---

### 6. Auth Events (Event Sourcing)

**Table:** `public.auth_events` (VIEW)  
**Purpose:** Event store for auth-gateway events from Neon

| Column           | Type        | Description                      |
| ---------------- | ----------- | -------------------------------- |
| `event_id`       | UUID        | Primary key / idempotency key    |
| `aggregate_type` | TEXT        | `user`, `session`, `api_key`     |
| `aggregate_id`   | TEXT        | Aggregate UUID                   |
| `version`        | BIGINT      | Optimistic concurrency           |
| `event_type`     | TEXT        | `UserUpserted`, `SessionCreated` |
| `payload`        | JSONB       | Event data                       |
| `metadata`       | JSONB       | Context (IP, user-agent)         |
| `occurred_at`    | TIMESTAMPTZ | Event timestamp                  |
| `ingested_at`    | TIMESTAMPTZ | Ingestion timestamp              |

---

### 7. Auth Projections (Read-Optimized Views)

| View                        | Purpose                          |
| --------------------------- | -------------------------------- |
| `public.auth_users_view`    | Current user state from events   |
| `public.auth_sessions_view` | Active sessions                  |
| `public.auth_api_keys_view` | API key state from events (reads `auth_gateway.auth_events`) |
| `public.auth_events`        | Event store (redirect to source) |

---

### 8. Public Schema Facade Views (Verified 2026-05-17)

These are VIEW objects in `public` — reads go to their real base tables:

| View                       | Real Base Table                    | Notes                                              |
| -------------------------- | ---------------------------------- | -------------------------------------------------- |
| `public.stored_api_keys`   | `security_service.stored_api_keys` | Exposes `id, name, encrypted_value, key_type, ...` |
| `public.api_keys_compat`   | `security_service.stored_api_keys` | Legacy compat alias — maps `created_by → user_id`, hardcodes `service='all'` |
| `public.auth_api_keys_view`| `auth_gateway.auth_events`         | Event-sourced reconstruction of key state          |

**`public.api_keys` sync triggers** (base table → `security_service`):

| Trigger                          | Event    | Timing | Function                        |
| -------------------------------- | -------- | ------ | ------------------------------- |
| `trigger_api_key_sync_on_insert` | INSERT   | AFTER  | `trigger_sync_api_key()`        |
| `trigger_api_key_sync_on_update` | UPDATE   | AFTER  | `trigger_sync_api_key_update()` |
| `trigger_api_key_sync_on_delete` | DELETE   | AFTER  | `trigger_sync_api_key_delete()` |
| `trigger_api_keys_updated_at`    | UPDATE   | BEFORE | `update_mcp_router_updated_at()`|

`public.api_keys` is the **primary write target**. Triggers propagate changes to `security_service.stored_api_keys` for the encrypted-key audit trail. The compat views read from `security_service`, not from `public.api_keys` directly.

**RLS on `public.api_keys`:** Enabled. Two policies:
- `Service role can manage api_keys` — service role bypass (`qual: true`)
- `Users can manage own API keys` — `user_id = auth.uid()` AND org must match

---

## Analytics Tables

| Table                            | Purpose                    |
| -------------------------------- | -------------------------- |
| `analytics.mcp_usage_logs`       | MCP tool usage tracking    |
| `analytics.mcp_key_audit_log`    | Key access audit           |
| `analytics.key_usage_analytics`  | Internal key usage metrics |
| `analytics.vendor_key_audit_log` | Vendor key audit trail     |
| `analytics.vendor_usage_logs`    | Vendor API usage           |
| `analytics.usage_analytics`      | General usage metrics      |

---

## Key Type Mapping

| Logical Type       | Code Labels                                    | Actual Table                       | Schema             |
| ------------------ | ---------------------------------------------- | ---------------------------------- | ------------------ |
| **Internal Keys**  | `internal`, `platform`                         | `public.api_keys`                  | `public`           |
| **User Auth Keys** | `user_key`, `auth_key`                         | `public.api_keys`                  | `public`           |
| **API Key Scopes** | `scopes`, `mcp_scopes`                         | `public.api_key_scopes`            | `public`           |
| **Stored Keys**    | `stored`, `encrypted`                          | `security_service.stored_api_keys` | `security_service` |
| **Vendor Keys**    | `vendor`, `external`, `foreign`, `third_party` | `public.vendor_api_keys`           | `public`           |
| **Project Keys**   | `project_keys`                                 | `public.api_key_projects`          | `public`           |

---

## Supporting Tables

| Table                            | Purpose                 |
| -------------------------------- | ----------------------- |
| `public.mcp_service_catalog`     | Available MCP services  |
| `public.mcp_rate_limits`         | Per-key rate limits     |
| `public.organizations`           | Organization management |
| `public.accounts`                | User accounts           |
| `analytics.vendor_key_audit_log` | Vendor key operations   |

---

## API Key Lifecycle

### Internal Keys (Authentication)

```
1. User creates key → Dashboard/CLI
2. Key generated with prefix (vx_xxx...)
3. SHA-256 hash stored in key_hash column
4. Plain key returned to user ONCE
5. User sends key in X-API-Key header
6. Server hashes incoming key, compares to key_hash
7. Usage logged in analytics.mcp_usage_logs
```

### Vendor Keys (Third-Party)

```
1. Admin stores vendor key → POST /v1/keys/vendors
2. Key encrypted with AES-256-GCM
3. Stored in vendor_api_keys.encrypted_key
4. Admin retrieves decrypted key via API
5. Key used for vendor API calls
6. Usage logged in analytics.vendor_key_audit_log
```

### MCP Session Keys

```
1. User creates key with specific service scopes
2. api_key_scopes entry created per scope
3. MCP session validates key + scope
4. Rate limits applied per mcp_rate_limits
```

---

## Security Notes

### What NOT to Expose in Error Messages

❌ **NEVER expose in production alerts:**

- `public.api_keys`
- `public.vendor_api_keys`
- `public.api_key_scopes`
- `public.stored_api_keys`
- `security_service.stored_api_keys`
- Column names like `key_hash`, `encrypted_key`

✅ **USE generic messages:**

- `"Invalid API key"`
- `"API key not found or inactive"`
- `"Authentication failed"`
- `"Key validation error"`

### Why

Exposing table/column names in error messages helps attackers map your schema for targeted attacks.

---

## Code References

### Frontend Components

| File                    | Key Tables Used                            |
| ----------------------- | ------------------------------------------ |
| `APIKeysPage.tsx`       | `public.api_keys`, `public.api_key_scopes` |
| `VendorKeyManager.tsx`  | `public.vendor_api_keys`                   |
| `KeyUsageDashboard.tsx` | `analytics.mcp_usage_logs`                 |

### Backend Services

| Service                  | Tables                                     |
| ------------------------ | ------------------------------------------ |
| `api-key.service.ts`     | `public.api_keys`                          |
| `stored-keys.service.ts` | `security_service.stored_api_keys`         |
| `vendor-key.service.ts`  | `public.vendor_api_keys`                   |
| `mcp-auth.ts`            | `public.api_keys`, `public.api_key_scopes` |

---

## Migration Status

| Migration                          | Status         | Notes                                  |
| ---------------------------------- | -------------- | -------------------------------------- |
| `public.api_keys`                  | ✅ Active      | Core authentication keys               |
| `public.api_key_scopes`            | ✅ Active      | MCP service mapping                    |
| `public.api_key_projects`          | ✅ Active      | Project grouping                       |
| `public.vendor_api_keys`           | ✅ Active      | Vendor key storage                     |
| `security_service.stored_api_keys` | ✅ Active      | Encrypted keys                         |
| `vsecure.*` tables                 | ❌ NOT applied | Archived migrations, not in production |

---

## Common Queries

### Get Active API Keys for User

```sql
SELECT
  id,
  name,
  key_prefix(key) as key_preview,
  is_active,
  expires_at,
  created_at
FROM public.api_keys
WHERE user_id = auth.uid()
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > NOW());
```

### Get Vendor Keys

```sql
SELECT
  id,
  vendor_name,
  key_name,
  description,
  is_active,
  last_used_at
FROM public.vendor_api_keys
WHERE is_active = true;
```

### Get Key Scopes

```sql
SELECT
  aks.service_key,
  aks.allowed_actions,
  aks.max_calls_per_minute
FROM public.api_key_scopes aks
JOIN public.api_keys ak ON aks.api_key_id = ak.id
WHERE ak.user_id = auth.uid();
```

---

## Version History

| Date       | Change                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| 2026-05-17 | Initial creation - live DB verification                                   |
| 2026-05-17 | Added security guidelines for error messages                              |
| 2026-05-17 | Added facade view map + sync triggers on public.api_keys (live DB query)  |
