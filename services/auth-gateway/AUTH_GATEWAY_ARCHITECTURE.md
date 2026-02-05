# Auth Gateway Architecture & Data Flow Reference

This document consolidates the configuration, database topology, and data-movement patterns inside the Auth Gateway service so an on-call engineer can understand the entire control plane at a glance.

## 1. Service Role & Runtime Envelope
- **Purpose:** Acts as the organization-wide authentication broker—terminates OAuth/OIDC flows, stores hashed API keys, projects audit events, and syncs trusted identities between Neon (command side) and Supabase (query/read side).
- **Runtime:** Express server listening on `PORT` (default 4000) with strict environment validation via a Zod schema in `config/env.ts` to ensure all gateway, OAuth, and sync secrets exist before boot.@config/env.ts#4-107
- **Security Baseline:** Requires `JWT_SECRET`, enforces PKCE by default, and toggles auth/session SLAs (TTL, rate limits, cookie domains) through env controls—centralizing hardening knobs for all clients.@config/env.ts#18-84

## 2. Environment Validation & Configuration Layers
1. **Core Connectivity** – Validates Postgres URLs (`DATABASE_URL`, optional Neon overrides) plus Supabase URLs/keys for both the Auth-Gateway project and the Main DB used for projections.@config/env.ts#4-38@config/env.ts#85-94
2. **Gateway UX & OAuth Controls** – Keeps dashboard URLs, issuer metadata, PKCE requirements, and token TTLs consistent across services.@config/env.ts#32-84
3. **Sync & Webhook Secrets** – Requires `WEBHOOK_SECRET` so only trusted Supabase edge functions can call the sync routes; failure to provide it blocks startup via schema validation.@config/env.ts#95-107

The result is a type-safe `env` object exported to every module, preventing silent misconfiguration across deployments.@config/env.ts#99-107

## 3. Database Topology & Client Initialization
The Auth Gateway speaks to three distinct databases, each with a dedicated client exported by `db/client.ts`:

| Client | Backing Store | Purpose | Implementation Highlights |
| --- | --- | --- | --- |
| `dbPool` | Neon (ep-snowy-surf) | Primary write model (auth_gateway & security_service schemas, event store, outbox) | Uses `@neondatabase/serverless` pool with TLS and advisory lock-friendly settings.@db/client.ts#1-15 |
| `supabaseAdmin` | Auth-Gateway Supabase project (ptnrwrgzrsbocgxlpvhd) | OAuth client registry + public-api mirrors | Service-role client scoped to `public` schema, no session persistence.@db/client.ts#16-28 |
| `supabaseUsers` | Main Supabase project (mxtsdgkwzjzlttpotole) | Read-side projection target for `auth_events` + user metadata | Falls back to Auth-Gateway URL if Main DB absent to avoid crashes; used by outbox forwarder.@db/client.ts#30-46 |

`getClientWithSchema()` pins the Neon connection `search_path` to `security_service` for API-key operations, ensuring queries hit the correct schema even if callers forget to qualify tables.@db/client.ts#65-74

## 4. Schema Foundation (Neon Command Side)
Migrations under `migrations/` set up two major schema families:

1. **`auth_gateway` schema** – Holds user accounts, sessions, OAuth clients/codes/tokens, audit log, and event-store tables. Includes helper triggers plus RLS policies so service-role keys administer everything while users see only their resources.@migrations/001_init_auth_schema.sql#1-132
2. **`security_service` schema** – Owns API key lifecycle (projects, stored keys, rotation policies, analytics, MCP tooling metadata) to isolate sensitive material from general auth tables.@migrations/006_api_key_management_service.sql#1-200
3. **PKCE-specific artifacts** – Dedicated `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`, and `oauth_audit_log` tables extend OAuth flows with hashed codes, PKCE requirements, and cleanup routines.@migrations/002_oauth2_pkce.sql#8-200

These migrations ensure Neon is the authoritative command database for secrets, events, and RLS-enforced identity records.

## 5. Sync Webhooks: Bridging Supabase → Neon
Supabase edge functions call Express routes under `/v1/sync/*` to push source-of-truth updates into Neon. Each route verifies the shared `X-Webhook-Secret`, wraps writes in a transaction, and emits CQRS events.

### 5.1 API Key Sync (`POST /v1/sync/api-key`)
1. **Auth & Validation** – Rejects requests without webhook secret, `id`, `user_id`, `name`, `key_hash`, or `organization_id` to guarantee RLS isolation and hashed storage only.@src/routes/sync.routes.ts#24-66
2. **Neon Upsert** – Uses `dbPool` to insert or update `security_service.api_keys`, handling CREATE/UPDATE/ROTATE as upserts and REVOKE as status flip while never storing raw keys.@src/routes/sync.routes.ts#67-126
3. **Event Emit** – Calls `appendEventWithOutbox` with aggregate type `api_key`, capturing metadata (permissions, expiry) without persisting hashes in the event payload.@src/routes/sync.routes.ts#127-151
4. **Response** – Confirms hashed key persisted plus event type derived from webhook intent.@src/routes/sync.routes.ts#152-161

### 5.2 User Sync (`POST /v1/sync/user`)
1. Authenticates via same secret, validates `id`+`email` fields.
2. Upserts `auth_gateway.user_accounts`, normalizing emails to lowercase and tracking metadata plus last sign-in times.
3. Emits `UserUpserted` event for downstream projections.
4. Returns success payload with user identifier.@src/routes/sync.routes.ts#176-263

### 5.3 Backfill Endpoint (`POST /v1/sync/backfill-api-keys`)
Bulk-synchronizes historical keys using trusted payloads, sharing the same insert/upsert logic for each record to repair drift between Supabase and Neon.@src/routes/sync.routes.ts#282-363

## 6. Event Sourcing & Outbox Pattern
The gateway records every change to `auth_gateway.events` and queues delivery work via `auth_gateway.outbox`.

1. **Event Append** – `appendEvent()` acquires per-aggregate advisory locks to compute sequential versions, then writes the event row with payload + metadata.@src/services/event.service.ts#40-126
2. **Outbox Enqueue** – `enqueueOutbox()` inserts a `pending` row referencing the event plus destination (default `supabase`).@src/services/event.service.ts#128-146
3. **Transactional Helper** – `appendEventWithOutbox()` ensures both writes occur atomically inside the caller’s transaction, preventing orphaned rows.@src/services/event.service.ts#148-160
4. **Outbox Management** – Helpers fetch pending batches, mark rows sent/failed, and compute health stats for observability surfaces.@src/services/event.service.ts#162-280

This CQRS layer decouples write-path secrets from read-path consumers so dashboards and analytics never query Neon directly.

## 7. Projection Worker (Outbox Forwarder)
A standalone script at `src/workers/outbox-forwarder.ts` drains pending events and delivers them to the Main Supabase database.

- **Credential Guardrails:** Exits immediately if `MAIN_SUPABASE_URL` or `MAIN_SUPABASE_SERVICE_ROLE_KEY` are missing, preventing projection into the wrong database.@src/workers/outbox-forwarder.ts#14-40
- **Delivery Logic:** Upserts each event into the Main DB’s `auth_events` table via `supabaseUsers`, preserving aggregate metadata and version numbers.@src/workers/outbox-forwarder.ts#42-66
- **Retry Strategy:** Processes batches of up to 50, applies exponential backoff capped at 5 minutes, and marks rows as `failed` after 5 attempts for manual intervention.@src/workers/outbox-forwarder.ts#67-106

Running this worker on a schedule (PM2, cron, or one-shot) keeps Supabase consumers fully in sync with Neon without granting them write access.

## 8. Health & Drift Detection
The `check-dual-db-status.mjs` script offers a holistic diagnostic:
- Inspects Neon schemas/tables, counts API-key assets, and verifies `security_service` availability.
- Uses Supabase service-role client to ensure public tables exist (and documents expected failures when private schemas are blocked).
- Scans Neon for sync triggers/functions to confirm dual-write mechanisms are registered.
- Prints an analysis summary recommending Neon for sensitive operations when Supabase schema access is restricted.@check-dual-db-status.mjs#1-198

This script is ideal for smoke tests after migrations or during incident response to confirm both databases are aligned.

## 9. End-to-End Flow Summary
1. **Edge Event** – Supabase edge function (API key or user change) invokes `/v1/sync/*` with the shared secret.
2. **Command Write** – Route-level transaction mutates Neon tables (`security_service.*` or `auth_gateway.user_accounts`).
3. **Event Store** – `appendEventWithOutbox` records the mutation and queues outbox work inside the same transaction.
4. **Outbox Forwarder** – Worker drains pending rows, projects them to the Main Supabase DB’s `auth_events`, and retries on failure.
5. **Consumers** – Dashboards, CLI, or other services subscribe to Supabase changes or query `auth_events`, ensuring they never need direct access to Neon secrets.

This architecture cleanly separates trusted writes, hashed secrets, and downstream read models while providing multiple validation hooks (env schema, webhook secret checks, dual-DB health script) to catch misconfiguration early.
