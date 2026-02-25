# Memory Write Governance Rollout (2026-02-25)

## Scope

This runbook deploys the write-governance hardening for:

- Idempotent create race prevention (DB-enforced uniqueness + duplicate-key recovery)
- Continuity merge race prevention (optimistic concurrency with retry)
- `write_intent=new` override semantics (bypass idempotent short-circuit)
- CLI network fallback when MCP DNS fails (`mcp.lanonasis.com` -> `api.lanonasis.com`)

Code included:

- `apps/onasis-core/supabase/functions/memory-create/index.ts`
- `apps/onasis-core/supabase/migrations/20260225_003_memory_idempotency_unique_index.sql`
- `apps/lanonasis-maas/cli/src/utils/api.ts`

## Preflight

1. Confirm no duplicate idempotency keys exist for non-`new` writes.

```sql
SELECT
  organization_id,
  user_id,
  metadata->>'idempotency_key' AS idempotency_key,
  COUNT(*) AS duplicate_count
FROM security_service.memory_entries
WHERE
  metadata ? 'idempotency_key'
  AND NULLIF(metadata->>'idempotency_key', '') IS NOT NULL
  AND COALESCE(metadata->>'write_intent', 'auto') <> 'new'
GROUP BY 1,2,3
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

2. If duplicates are returned, clean them before applying the unique index.

```sql
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, user_id, metadata->>'idempotency_key'
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM security_service.memory_entries
  WHERE
    metadata ? 'idempotency_key'
    AND NULLIF(metadata->>'idempotency_key', '') IS NOT NULL
    AND COALESCE(metadata->>'write_intent', 'auto') <> 'new'
)
DELETE FROM security_service.memory_entries m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;
```

3. Confirm CLI publish target version is `3.9.7+` before promoting users.  
Older global installs (`3.9.6`) may still surface MCP-host DNS failures.

## Rollout Order

1. Apply DB migration (first).

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f apps/onasis-core/supabase/migrations/20260225_003_memory_idempotency_unique_index.sql
```

2. Deploy Edge Function update.

```bash
cd apps/onasis-core
supabase functions deploy memory-create --project-ref "$SUPABASE_PROJECT_REF"
```

3. Deploy/publish CLI update with gateway fallback.

```bash
cd apps/lanonasis-maas/cli
npm run build
npm pack --dry-run
# npm publish --access public
```

4. Run smoke suite (below) against staging first, then production.

## Canary Metrics (first 60 minutes)

1. `memory-create` HTTP `5xx` rate should not increase.
2. `memory-create` `409` responses (continuity conflicts) should remain low and self-recover on retry.
3. Duplicate-key DB errors (`23505`) should not bubble as client-facing failures for idempotent retries.
4. Search reliability: no hard-fail from MCP DNS (`ENOTFOUND mcp.lanonasis.com`) for CLI `memory search`.
5. Duplicate idempotency rows should remain `0`:

```sql
SELECT COUNT(*) AS duplicate_groups
FROM (
  SELECT 1
  FROM security_service.memory_entries
  WHERE
    metadata ? 'idempotency_key'
    AND NULLIF(metadata->>'idempotency_key', '') IS NOT NULL
    AND COALESCE(metadata->>'write_intent', 'auto') <> 'new'
  GROUP BY organization_id, user_id, metadata->>'idempotency_key'
  HAVING COUNT(*) > 1
) d;
```

## Smoke Tests

Use:

- `apps/onasis-core/scripts/test/memory-write-governance-smoke.sh`

Required env:

- `BASE_URL` (default: `https://lanonasis.supabase.co/functions/v1`)
- `AUTH_TOKEN` (required; Bearer token or compatible auth token)

The script validates:

1. Idempotent concurrent creates return one stable memory id.
2. `write_intent=new` allows fresh create even with reused idempotency key.
3. Continuity concurrent appends preserve both payloads (no lost update).

## Rollback

1. Roll back function deployment to last known good revision.
2. Keep indexes in place unless rollback requires schema parity with old code.
3. If schema rollback is required:

```sql
DROP INDEX IF EXISTS security_service.memory_entries_idempotency_key_unique_idx;
DROP INDEX IF EXISTS security_service.memory_entries_continuity_key_lookup_idx;
DROP INDEX IF EXISTS public.memory_entries_idempotency_key_unique_idx;
DROP INDEX IF EXISTS public.memory_entries_continuity_key_lookup_idx;
```

4. Re-run smoke tests after rollback.

## Notes

- The idempotency guarantee relies on the DB unique index and duplicate-key recovery path together.
- Continuity now uses optimistic concurrency; brief `409` under high contention is expected and should be retried by clients.
