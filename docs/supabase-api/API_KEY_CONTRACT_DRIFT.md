# API Key Contract Drift Analysis

**Generated:** 2026-05-26  
**Scope:** CLI ↔ auth-gateway ↔ Supabase DB contract verification  
**Status:** Active — resolution pipeline pending

---

## TL;DR

Three separate systems describe API key management in incompatible ways.
Nothing is catastrophically broken because the CLI's CRUD commands route to the VPS
auth-gateway (`:4000`) which has its own runtime, but the analytics/MCP/rotation
layers are completely broken — the routes don't exist, the tables are empty, and
the two docs files contradict each other.

---

## Confirmed Drifts (Live DB vs Docs vs CLI)

### DRIFT 1 — Route Path Mismatch (Critical)

| Layer | Path used |
|---|---|
| `ROUTING_ARCHITECTURE.md` | `/api/v1/keys/*` → Supabase EFs |
| `DIRECT_API_ROUTES.md` | `generate-api-key`, `hash-api-key`, `verify-api-key` (EF names) |
| CLI `api-keys.ts` | `/api/v1/api-keys` → VPS auth-gateway `:4000` |

**Result:** CLI does not call what either doc describes. The CLI path `/api/v1/api-keys`
routes to the VPS auth-gateway, not Supabase Edge Functions. The two docs contradict
each other on function names. Neither doc accurately describes the live routing.

**Canonical truth:** CLI → VPS auth-gateway `:4000` → `public.api_keys` (Neon DB).

---

### DRIFT 2 — Two API Key Tables, Different Schemas, Different Data

| Table | Schema | Rows | What it is |
|---|---|---|---|
| `api_keys` | `public` | **40 rows** | Live operational table, auth-gateway writes here |
| `stored_api_keys` | `security_service` | **0 rows** | New encrypted storage, migration 005 applied, nothing writes here |

**Result:** The richer key management system (`stored_api_keys` with `key_type`,
rotation policies, MCP proxy tokens) was migrated into the DB but is completely
unused. All live data is in the old `public.api_keys` table via auth-gateway.

The CLI's `PlatformApiKey` interface includes `key_context` and `service_scopes[]`
which are fields on the new model — their presence on the old `public.api_keys`
schema is unverified.

---

### DRIFT 3 — MCP Key Management Tables All Empty

The following tables exist in the live DB (from migration 005) but have 0 rows
and nothing currently writes to them:

| Table | Schema | Rows |
|---|---|---|
| `api_key_projects` | `public` | 0 |
| `key_rotation_policies` | `public` | 0 |
| `key_security_events` | `public` | 0 |
| `mcp_key_tools` | `public` | 0 |
| `mcp_key_access_requests` | `public` | 0 |
| `mcp_key_sessions` | `public` | 0 |
| `mcp_proxy_tokens` | `public` | 0 |

The CLI MCP subcommands (`api-keys mcp register-tool`, `api-keys mcp request-access`)
are explicitly blocked with `exitUnsupported()` because the auth-gateway routes
don't exist yet. These tables are waiting for routing that was never wired.

---

### DRIFT 4 — Analytics Table Missing from Live DB

The CLI has `api-keys analytics usage` and `api-keys analytics security-events`
commands blocked with `exitUnsupported()`. The reason:

- `key_usage_analytics` does **not appear** in the live `list_tables` output —
  the table from migration 005 was either not applied or renamed.
- Live DB has `maas.api_key_usage` (0 rows) and `maas.usage_analytics` (0 rows),
  which are the maas-schema equivalents, also unused.
- `key_security_events` exists (0 rows) but no auth-gateway route exposes it.

**Result:** Analytics pipeline has no data source and no route. Both ends are missing.

---

### DRIFT 5 — Memory Schema Split (maas vs security_service)

| Table | Schema | Rows |
|---|---|---|
| `memory_entries` | `security_service` | **779 rows** — all live data |
| `memory_entries` | `maas` | 0 rows — empty |
| `memory_chunks` | `public` | 0 rows |
| `memory_chunks` | `maas` | 0 rows |
| `memory_versions` | `public` | 0 rows |
| `memory_versions` | `maas` | 0 rows |

Live memory data lives in `security_service.memory_entries`. The `maas` schema
parallel tables are empty. `DIRECT_API_ROUTES.md` documents `/rest/v1/memory_entries`
which points to the `public` schema — no data there (PostgREST default is `public`).

---

### DRIFT 6 — Users/Organizations Schema Split

| Table | Schema | Rows |
|---|---|---|
| `users` | `security_service` | **16 rows** — live users |
| `users` | `maas` | 0 rows |
| `organizations` | `public` | **1 row** — live org |
| `organizations` | `maas` | 0 rows |

The `maas` schema was provisioned as the future multi-tenant plane but has no
data. All current users and the single organization are in `security_service`
and `public` respectively.

---

### DRIFT 7 — EF Name Inconsistency Between Docs

`ROUTING_ARCHITECTURE.md` describes the API key Edge Functions as:
```
api-key-create, api-key-list, api-key-rotate, api-key-revoke, api-key-delete
```

`DIRECT_API_ROUTES.md` lists them as:
```
generate-api-key, hash-api-key, verify-api-key, sync-api-key, sync-user
```

These are not the same functions. The routing doc describes a CRUD surface that
doesn't match the utility functions in the EF inventory. Neither set matches
what the CLI actually calls (VPS auth-gateway).

---

## Live Table State Summary (API Key Domain)

```
public.api_keys                    ← 40 rows, LIVE (old schema, auth-gateway)
security_service.stored_api_keys   ← 0 rows, schema exists (new schema, unused)
public.api_key_projects            ← 0 rows (MCP key org layer, unused)
public.key_rotation_policies       ← 0 rows (rotation engine, unused)
public.key_security_events         ← 0 rows (security audit, unused)
public.mcp_key_tools               ← 0 rows (MCP tool registry, unused)
public.mcp_key_access_requests     ← 0 rows (MCP access workflow, unused)
public.mcp_key_sessions            ← 0 rows (MCP session tokens, unused)
public.mcp_proxy_tokens            ← 0 rows (proxy token store, unused)
public.api_key_scopes              ← 0 rows (scope definitions, unused)
public.mcp_rate_limits             ← 0 rows (rate limiting, unused)
maas.api_key_usage                 ← 0 rows (analytics, unused)
```

---

## Security Advisory (Live — Not Documented)

8 tables in `security_service` schema have RLS **disabled**. They are fully
exposed to any caller with the anon key:

```
security_service.users_backup
security_service.memory_entries_backup
security_service.memory_revisions
security_service.memory_inference_jobs
security_service.memory_inference_batches
security_service.memory_inferred_conclusions
security_service.memory_profiles
security_service.memory_profile_versions
```

**Do not enable RLS without policies** — all access will be blocked. Add
appropriate policies before applying:

```sql
ALTER TABLE security_service.users_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_entries_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_inference_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_inference_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_inferred_conclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_service.memory_profile_versions ENABLE ROW LEVEL SECURITY;
```

---

## Resolution Pipeline

The following items need to be resolved in sequence to close the drift and
achieve the unified security management goal:

### Phase 0 — Docs correctness (no code changes)
- [ ] Update `ROUTING_ARCHITECTURE.md` API key section to reflect reality:
  CLI → `/api/v1/api-keys` → VPS auth-gateway `:4000` → `public.api_keys`
- [ ] Update `DIRECT_API_ROUTES.md` API key EF names to match what is actually deployed
- [ ] Annotate `stored_api_keys`, `api_key_projects`, etc. as "provisioned, not active"

### Phase 1 — Verify `public.api_keys` column schema
- [ ] Run `list_tables(verbose: true)` on `public.api_keys` to confirm whether
  `key_context`, `service_scopes`, `key_type` columns exist
- [ ] Reconcile CLI's `PlatformApiKey` interface against actual column list
- [ ] If columns are missing, write migration to add them (review + MCP apply)

### Phase 2 — Add missing auth-gateway routes
- [ ] `POST /api/v1/api-keys/:id/rotate` — enables key rotation from CLI
- [ ] `POST /api/v1/api-keys/:id/revoke` — immediate invalidation (separate from delete)
- [ ] `GET /api/v1/api-keys/analytics` — unblocks `api-keys analytics usage`
- [ ] `GET /api/v1/api-keys/security-events` — unblocks `api-keys analytics security-events`

### Phase 3 — Wire prescan → key management bridge
- [ ] When `lanonasis prescan` detects a live secret, POST a security event to
  `/api/v1/api-keys/security-events` for remediation tracking
- [ ] This creates the detection → management → enforcement loop

### Phase 4 — RLS remediation — COMPLETED
- [x] Add policies to 8 RLS-disabled tables before enabling — verified via live DB inspection (2026-06-02)
- [x] Priority: `memory_revisions` (111 rows, sensitive) — relrowsecurity=true, all policies present

---

## What Currently Works End-to-End

```
lanonasis api-keys create     ✅ → auth-gateway → public.api_keys
lanonasis api-keys list       ✅ → auth-gateway → public.api_keys
lanonasis api-keys get        ✅ → auth-gateway → public.api_keys
lanonasis api-keys update     ✅ → auth-gateway → public.api_keys
lanonasis api-keys delete     ✅ → auth-gateway → public.api_keys
lanonasis api-keys projects   ✅ → auth-gateway (project scoping)
lanonasis prescan scan/audit  ✅ → @lanonasis/secret-prescan (file scan only)

lanonasis api-keys mcp *      🔴 exitUnsupported() — no gateway routes
lanonasis api-keys analytics  🔴 exitUnsupported() — no gateway routes
key rotation                  🔴 no route, no scheduled job
key revocation event          🔴 no route (only hard delete)
prescan → key mgmt bridge     🔴 not connected
```
