# Memory Context Guardrails

Date: 2026-03-30

## Source Of Truth

Use the monorepo execution spec as the canonical source:

- `docs/plans/memory-context-separation.md`

Treat the Notion capstone as a research and status artifact, not the execution spec.

## Current Invariants

- Platform keys live behind `/api/v1/auth/api-keys`.
- Platform key scopes are stored in `security_service.api_keys.permissions`.
- Keep the single `lano_` prefix. Do not make `lms_p_` or `lms_t_` a dependency.
- Use `security_service.org_members`. Do not create `organization_memberships`.
- Voyage is the active embedding provider for behavior memory writes.
- New Voyage behavior writes must land in `voyage_trigger_embedding`, not `trigger_embedding`.

## Release Flow

1. Deploy `mcp-core`.
2. Deploy auth-gateway if the platform key contract changed.
3. Deploy Supabase behavior functions:
   - `intelligence-behavior-record`
   - `intelligence-behavior-recall`
   - `intelligence-behavior-suggest`
4. Run:

```bash
AUTH_TOKEN=<REDACTED> \
DATABASE_URL=<REDACTED> \
apps/onasis-core/scripts/test/behavior-release-smoke.sh
```

This smoke script verifies:

- platform key creation using the current auth-gateway contract
- response envelope shape for list and get
- behavior record success
- behavior recall returns the new pattern
- the inserted row uses the correct embedding column for Voyage

## Drift Audit

Run this after deployments and on a regular cadence:

```bash
AUTH_TOKEN=<REDACTED> \
DATABASE_URL=<REDACTED> \
apps/onasis-core/scripts/check-memory-context-drift.sh
```

If your shell defaults `DATABASE_URL` to a local Supabase Docker instance such as `127.0.0.1:54322`, override it with the production pooler URL before running the audit.

This audit checks:

- `security_service.behavior_patterns` has both embedding columns
- post-cutover rows are not writing only to `trigger_embedding`
- `security_service.api_keys` still uses `permissions`
- `key_context` remains visible as a tracked blocker
- the `20260212_001_behavior_patterns` migration ledger state matches the intended rollout

## Log Watch

On the VPS, keep an eye on:

```bash
ssh vps
pm2 logs mcp-core --lines 50
```

Look for:

- `expected 1536 dimensions`
- behavior record insert failures
- auth-gateway route errors around `/api/v1/auth/api-keys`

## Remaining Blocker

The next real product blocker is still auth-gateway support for explicit `key_context` and team-membership validation. The CLI and docs are aligned now, but personal vs team key issuance is not complete until that server-side support lands.
