# Auth Gateway — Live Architecture (Audited 2026-05-17)

**Source:** Live VPS SSH inspection + Supabase DB queries  
**Status:** CURRENT — verified against running production services

---

## Two Supabase Projects

The platform uses two distinct Supabase projects:

| Alias | Project ID | Purpose |
|---|---|---|
| `supabase2` | `ptnrwrgzrsbocgxlpvhd` | auth-gateway DB (security_service schema) |
| `supabase` | `mxtsdg*` | Main platform DB (memory_entries, maas, etc.) |

**Critical:** These are separate projects with separate connection strings. Do not conflate them.

---

## Live VPS Process Inventory (PM2)

```
auth-gateway    cluster  :4000/:4001   /opt/lanonasis/onasis-core/services/auth-gateway/
mcp-core        fork     :3104         /opt/lanonasis/mcp-core/
openclaw-action-bridge  fork  (internal)
ops-webhook     fork     (internal)
```

Auth gateway runs in cluster mode across two ports for load distribution.

---

## `requireAuth` Middleware — Actual Resolution Order

Live source: `/opt/lanonasis/onasis-core/services/auth-gateway/src/middleware/auth.ts`

```
1. Authorization: Bearer <token>
   → if token contains '.' (has dots): treat as JWT, verify with Supabase
   → if token has NO dots (no-dot token): treat as OAuth introspection call
   
2. X-API-Key header
   → resolve via validateAPIKey() in api-key.service.ts
   → builds req.user with keyContext from DB
```

**IMPORTANT:** A `lano_*` key sent as `Authorization: Bearer lano_xxx` hits the **OAuth introspection path** (no dots → introspection), which fails → 401. API keys (`lano_*`, `lms_*`, etc.) MUST be sent via `X-API-Key` header, never `Authorization: Bearer`.

---

## `key_context` End-to-End Chain

```
api_keys.key_context (DB column)
  → validateAPIKey() reads column
  → buildUnifiedUserFromApiKey({ keyContext: validation.keyContext })
  → req.user.keyContext = 'personal' | 'team' | 'enterprise'
  → EF: resolveMemoryContext(req.user) 
  → applyMemoryBoundary(query, context)
    - personal: adds WHERE user_id = req.user.id filter
    - team: org-level filter
    - enterprise: full org access
```

Valid values: `'personal'`, `'team'`, `'enterprise'` (see `VALID_API_KEY_CONTEXTS` in api-key.service.ts)

---

## auth-gateway DB Schema (security_service)

Live tables confirmed in `ptnrwrgzrsbocgxlpvhd`:

```
security_service.api_keys
security_service.users  
security_service.organizations
security_service.memory_entries
```

**Missing (confirmed absent):** `security_service.org_members` — planning docs that reference this table are INCORRECT.

**`security_service.organizations` columns (live):**
```
id, name, plan, settings, created_at, updated_at
```
NOT present: `slug`, `description`, `is_active` — any migration SQL referencing these columns will fail.

---

## Main DB Schema (`mxtsdg*` project)

- `security_service.memory_entries` — 748 records, canonical memory store
- `maas.memory_entries` — empty (unused)
- `public.organizations` — does NOT exist; organizations live in `client_services`, `maas`, `security_service`, `vendors` schemas

---

## Key Corrections to Prior Planning Docs

| Prior assumption | Reality |
|---|---|
| D5 migration needed (personal org for admin) | NOT needed — `key_context='personal'` + `user_id` filter handles isolation |
| `Authorization: Bearer lano_xxx` works | BROKEN — hits OAuth introspection, returns 401 |
| `security_service.org_members` exists | Does NOT exist in auth-gateway DB |
| `public.organizations` exists | Does NOT exist in main DB |

---

## Dashboard API Key Sections

The dashboard has two distinct API key sections backed by the same `api_keys` table:

| Section | Component | Key Prefix | Purpose |
|---|---|---|---|
| Memory Operations | `ApiKeyManager.tsx` | `lano_*` | REST API access for memory read/write |
| MCP Connectors | `APIKeysPage.tsx` | `vx_prod_*` | MCP Router service access, rate-limited |

The `key_context` field applies to Memory Operations keys and controls memory boundary scoping. MCP Router keys use `scope_type` (all/specific) for service scoping instead.

---

## Authentication Flow for Dashboard Clients

```
Dashboard → api-client.ts:
  vx_* keys:  Authorization: <key>  +  X-API-Key: <key>   ✓ works
  lano_* keys: X-API-Key: <key>                            ✓ works (fixed 2026-05-17)
  lano_* keys: Authorization: Bearer <key>                 ✗ 401 (OAuth introspection path)

Supabase JWT sessions: Authorization: Bearer <jwt>         ✓ works (JWT path)
```
