# Auth Gateway – Event-Sourcing + CQRS Implementation Plan  
**Scope:** Align auth-gateway with the multi-hop flow (REST API → Netlify functions → Supabase → remote MCP → Neon → auth-gateway → platforms/clients) using the roadmap in `docs/AUTH_MIGRATION_ROADMAP_2025-11-05.md` and the flows in `docs/AUTHENTICATION.md`.

---

## Objectives
- Keep Neon as the **command side** (strong consistency for login/session/API-key issuance).
- Use Supabase as the **read side** and central data hub for downstream consumers (Netlify, MCP, dashboard).
- Provide **event log + outbox** in Neon to mirror auth facts into Supabase projections.
- Preserve existing routes and PKCE/OAuth behavior while enabling compatibility for legacy REST/Netlify consumers.

---

## Data Flow (end-to-end)
1) **Clients (CLI/SDK/IDE/Dashboard)** → auth-gateway (`/oauth`, `/v1/auth`, `/api/v1/auth/api-keys`).
2) **auth-gateway command pipeline (Neon)**  
   - Append event → mutate state (sessions, user_accounts, api clients/keys) → queue outbox row.
3) **Outbox forwarder** pushes events to **Supabase** (service role) → builds projections.
4) **Supabase projections** feed **Netlify functions** and **remote MCP** (read-optimized tables / views).
5) **REST API (Netlify)** uses gateway `/oauth/introspect` for bearer tokens and Supabase projections for business data.

---

## Neon (command side) tasks
- **Schema additions (auth_gateway)**  
  - `events`: `event_id UUID PK`, `aggregate_type`, `aggregate_id`, `version BIGINT`, `event_type`, `payload JSONB`, `metadata JSONB`, `occurred_at TIMESTAMPTZ DEFAULT now()`.  
  - `outbox`: `id BIGSERIAL PK`, `event_id UUID`, `destination TEXT DEFAULT 'supabase'`, `status TEXT CHECK (status IN ('pending','sent','failed')) DEFAULT 'pending'`, `attempts INT DEFAULT 0`, `next_attempt_at TIMESTAMPTZ DEFAULT now()`, `error TEXT`.
- **Wrap mutations in tx + events**  
  - `src/services/user.service.ts`: emit `UserUpserted` when upserting Supabase user into Neon.  
  - `src/services/session.service.ts`: emit `SessionCreated` / `SessionRevoked`.  
  - `src/services/api-key.service.ts`: choose source of truth (see “API keys strategy” below) and emit `ApiKeyCreated/Rotated/Revoked`.  
  - `src/services/audit.service.ts`: move to `appendAuthEvent` that writes to `events` + `outbox` (still keeps best-effort console log on failure).
- **Worker**  
  - `src/workers/outbox-forwarder.ts`: poll pending outbox rows, deliver to Supabase via `supabaseAdmin`, mark `sent` or schedule retry with backoff; DLQ after N attempts.

---

## Supabase (read side) tasks
- **Tables**  
  - `public.auth_events` (mirror of Neon events; `event_id` PK for idempotency).  
  - Projections (pick minimal to start):  
    - `public.auth_sessions_view` (user_id, platform, expires_at, last_used_at).  
    - `public.auth_users_view` (user profile + provider metadata).  
    - `public.auth_api_keys_view` (if API keys mirrored here).
- **Ingest function**  
  - RPC or REST endpoint `POST /rpc/apply_auth_event` that upserts `auth_events` and updates projections. Idempotent on `event_id`.
- **Netlify + MCP consumption**  
  - Netlify functions read projections; still call `/oauth/introspect` for bearer tokens.  
  - MCP HTTP routes can read projections for enrichment; still validate API keys via Supabase (service role).

---

## API keys strategy (pick one)
1) **Supabase remains source of truth (lowest risk)**  
   - Keep writes in `api-key.service.ts` using Supabase.  
   - Emit `ApiKey*` events into Neon for audit and to drive projections back into Supabase (`auth_api_keys_view` fed by `auth_events`).  
   - Requires outbox forwarding but avoids dual-write of secrets.
2) **Move API key writes to Neon (higher change)**  
   - Store key hashes in Neon; outbox to Supabase.  
   - Update dashboard/Netlify to read from Supabase projection only.  
   - More invasive; do after initial event plumbing.

Recommendation: start with **Option 1** to minimize churn.

---

## Gateway code changes (incremental)
- Add **event + outbox helpers** under `src/services/event.service.ts` (new):  
  - `appendEvent({aggregate_type, aggregate_id, event_type, payload, metadata}, client?)`  
  - `enqueueOutbox(event_id, client?)`  
  - Supports optional existing PG client for transactional writes.
- **Refactor services to emit events**  
  - `user.service.ts` → wrap `upsertUserAccount` with tx: append `UserUpserted`.  
  - `session.service.ts` → on create/revoke, append `SessionCreated/SessionRevoked`.  
  - `audit.service.ts` → append `AuditLogged` event instead of direct insert (keep fallback insert if desired).  
  - `auth.controller.ts` → no behavioral change; relies on services now emitting events.
- **Outbox forwarder**  
  - Add `src/workers/outbox-forwarder.ts` and a script `npm run outbox:forward` (e.g., `tsx src/workers/outbox-forwarder.ts`).  
  - PM2 process entry for forwarder (staging/prod).
- **Health/observability**  
  - Extend `/health` to include `outbox_depth` and `oldest_pending_age`.

---

## Integration points
- **REST API (Netlify)**  
  - Token auth: call gateway `/oauth/introspect` (already planned in roadmap).  
  - Data reads: switch to Supabase projections fed by events.  
  - Keep legacy fallback until projections stable.
- **Remote MCP**  
  - For API-key validation, continue Supabase RPC path.  
  - For bearer tokens, prefer gateway introspection.
- **Platforms (CLI/IDE/Dashboard/SDK)**  
  - No route changes; PKCE + API-key flows stay the same.  
  - Benefit: more reliable propagation to Supabase/Netlify/MCP via projections.

---

## Milestones
1) **Scaffold**: add event/outbox tables + `event.service.ts`; unit tests for hashing/idempotency.  
2) **Session/User events**: wrap `upsertUserAccount`, `createSession`, `revokeSession`; expose outbox health.  
3) **Outbox forwarder**: deliver to Supabase `auth_events`; idempotent apply function.  
4) **API key events**: emit `ApiKey*` events (Option 1: Supabase source).  
5) **Cutover**: REST/Netlify reads Supabase projections; monitor lag; enable alerts.

---

## File map (to create/update)
- `apps/onasis-core/services/auth-gateway/src/services/event.service.ts` (new)
- `apps/onasis-core/services/auth-gateway/src/services/audit.service.ts` (refactor to emit events)
- `apps/onasis-core/services/auth-gateway/src/services/user.service.ts` (tx + event)
- `apps/onasis-core/services/auth-gateway/src/services/session.service.ts` (tx + event)
- `apps/onasis-core/services/auth-gateway/src/services/api-key.service.ts` (emit events; keep Supabase writes for now)
- `apps/onasis-core/services/auth-gateway/src/workers/outbox-forwarder.ts` (new)
- `apps/onasis-core/services/auth-gateway/migrations/009_event_store.sql` (new schema for events/outbox)
- `apps/onasis-core/services/auth-gateway/src/index.ts` (health surface for outbox)
- Supabase: `apps/onasis-core/docs/supabase/auth_events_projection.sql` (new) for ingestion + projections.

---

## Notes
- Keep all events small and non-PII; if PII needed, encrypt or store references only.  
- Use `event_type_version` in payload for future evolution.  
- Idempotency: apply function in Supabase should upsert by `event_id`; outbox forwarder should handle retries with exponential backoff.  
- Start with staging (port 3005); deploy forwarder as a separate PM2 process before production cutover.
