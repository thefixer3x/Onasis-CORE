# Memory Edge Auth Deployment

This runbook keeps the memory Edge suite aligned on the same authentication mode.

## Why this exists

Memory REST routes rely on custom auth resolution in [`_shared/auth.ts`](/Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/supabase/functions/_shared/auth.ts), including `X-API-Key` support. If some functions are deployed with JWT verification enabled and others are not, route behavior diverges even when `_redirects` is correct.

Symptoms of drift:

- `memory-stats` works with `X-API-Key`
- `memory-list` or `memory-search` return `401`
- direct `functions/v1` and `api.lanonasis.com` disagree

## Canonical deployment

Deploy the whole memory suite together:

```bash
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core
./scripts/deploy-memory-edge-suite.sh
```

This deploys:

- `memory-create`
- `memory-get`
- `memory-update`
- `memory-delete`
- `memory-list`
- `memory-search`
- `memory-stats`
- `memory-bulk-delete`

All are deployed with:

- `--use-api`
- `--no-verify-jwt`

## Verification

Set:

```bash
export LANONASIS_API_KEY='...'
export LANONASIS_PROJECT_SCOPE='...'
```

Then run:

```bash
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core
./scripts/verify-memory-edge-auth.sh
```

Expected:

- all checks return `200`
- `api.lanonasis.com` and direct `functions/v1` agree

## Schema compatibility note

The main Supabase `public.api_keys` table does not currently expose a `project_scope` column. For API-key flows, [`_shared/auth.ts`](/Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/supabase/functions/_shared/auth.ts) reads project scope from `X-Project-Scope` when provided instead of selecting a non-existent column from `public.api_keys`.
