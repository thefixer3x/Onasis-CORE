# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Role: Private Backend Engine

**DO NOT make this repository public.** It contains all backend secrets, database
migrations, and Edge Function source code.

This is the private backend engine powering the entire Lan Onasis platform.
Supabase Edge Functions (in `supabase/functions/`) are the actual business logic —
74+ EFs covering memory, intelligence, auth, payments, AI routing, and more.

---

## Supabase Edge Functions (`supabase/functions/`)

This is where ALL new backend logic goes.

| Suite | Functions | Auth |
|---|---|---|
| Memory (8 EFs) | memory-create, memory-get, memory-update, memory-delete, memory-list, memory-search, memory-stats, memory-bulk-delete | X-API-Key via `_shared/auth.ts` |
| Intelligence (12+ EFs) | intelligence-*, behavior-*, reasoning-* | alignedAuthMiddleware |
| Auth/System (5 EFs) | auth-status, organization-info, project-create, project-list, system-health | Various |
| Config (2 EFs) | config-get, config-set | X-API-Key |

**Deploy command:** `supabase functions deploy <name> --no-verify-jwt`
**Deploy memory suite:** `scripts/deploy-memory-edge-suite.sh`

Memory EFs and Intelligence EFs use `--no-verify-jwt` because they implement
custom auth via `_shared/auth.ts` (X-API-Key resolution) rather than Supabase JWT.

EF catalogue: `docs/supabase-api/DIRECT_API_ROUTES.md`

---

## Database — CRITICAL RULES

**Primary Supabase project:** `mxtsdg*********.supabase.co`
Vanity alias: `lanonasis.supabase.co` (both point to same project)
95+ tables currently in `public` schema.

**NEVER run `supabase db push`** — the remote ledger has diverged from local
migrations. Running `db push` would corrupt or destroy production data.

Always apply migrations via:
1. **Supabase MCP tool:** `apply_migration` (records in ledger + applies SQL atomically)
2. **Reviewed SQL** with operator approval, then manually recorded in source control

**New tables MUST go in domain schemas** (security_service, maas, etc.), NOT public schema.
Phase 1/2 context tables live in `security_service` schema with public views for backward compat.

Database docs: `docs/supabase-api/DIRECT_API_ROUTES.md` is the canonical EF inventory.

---

## Routing

**`_redirects` = Netlify routing (TRANSITIONAL).**
Netlify hosts `api.lanonasis.com` today. Being replaced by VPS nginx.
Migration plan: `.devops/context-engineering/architecture/netlify-to-vps-migration-plan.md`
DO NOT rely on `_redirects` as the permanent architecture.

**Intelligence routes:** `/api/v1/intelligence/*` → nginx rewrite → `/functions/v1/intelligence-*`
**Memory routes:** go through VPS unified-gateway :3000 (which calls Supabase EFs internally)

---

## React Frontend (`src/`)

Legacy. The real dashboard is `apps/dashboard` (dashboard.lanonasis.com).
The `src/` React app mostly redirects to dashboard.lanonasis.com.

---

## Authentication Model

EFs use custom auth (NOT Supabase JWT) via `_shared/auth.ts`:
- `X-API-Key` header with key prefixes: `lano_*` (canonical), `lms_*`, `lns_*`, `vibe_*`, `sk_*`, `pk_*`, `master_*` (compatibility)
- `Authorization: Bearer <token>` also accepted
- Service-internal calls use `SUPABASE_SERVICE_ROLE_KEY` (bypasses user quota)
- Deploy EFs with `--no-verify-jwt`

---

## Key File Locations

| Purpose | Location |
|---|---|
| Edge Functions | `supabase/functions/` |
| Shared auth/utils | `supabase/functions/_shared/` |
| EF deploy scripts | `scripts/deploy-memory-edge-suite.sh` |
| Database migrations | `supabase/migrations/` |
| Docs | `docs/supabase-api/DIRECT_API_ROUTES.md` |
| VPS migration plan | `.devops/context-engineering/architecture/netlify-to-vps-migration-plan.md` |
| Legacy React | `src/` (redirects to dashboard.lanonasis.com) |
| Legacy server/services | `server/`, `services/` (superseded by VPS gateways) |

---

## Environment Variables

Required for EF development:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LANONASIS_API_KEY` (platform key with `lano_*` prefix)

---

## Adding New Features

**New backend logic:** Create new EF in `supabase/functions/intelligence-<name>` or `supabase/functions/memory-<name>`
**New dashboard UI:** Add to `apps/dashboard/` NOT here
**New npm packages:** Add to `apps/lanonasis-maas/packages/`