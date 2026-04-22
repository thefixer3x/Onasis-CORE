# HA Canonical Auth Gateway on `https://auth.lanonasis.com`

## Summary

Build a single-issuer, failover-safe auth-gateway behind `auth.lanonasis.com` with **active-passive first** traffic policy and **hybrid-bridge** signing:

- Keep one canonical public issuer and discovery identity: `https://auth.lanonasis.com`.
- Put Cloudflare Load Balancing in front of two origins, but do not expose origin URLs to clients.
- Make **Postgres the mandatory correctness store** for OAuth/device/session state; keep Redis as an accelerator, not the source of truth.
- Keep current legacy symmetric session/JWT validation temporarily for existing cookies and internal consumers, while adding **canonical asymmetric signing + JWKS** for the issuer-facing OIDC contract.
- Treat current `/health` as insufficient; introduce a true `/ready` contract for load balancer decisions.
- First implementation prerequisite: **advance monorepo submodule pointers** to the already-existing upstream hardening commits in `apps/onasis-core` and `apps/mcp-core`.

### Target architecture

```text
Clients
  Browser / PKCE / CLI / Device / Token Refresh
        |
        v
https://auth.lanonasis.com
  Cloudflare DNS + Load Balancer
    - monitors /ready only
    - routes only to healthy origins
    - active-passive first
        |
        +--> auth-gateway-primary
        |      |
        |      +--> Shared Postgres (authoritative auth state)
        |      +--> Shared Redis (optional accel: cache/rate-limit only)
        |      +--> Central secret manager (signing keys, cookie/JWT secrets, encryption keys)
        |
        +--> auth-gateway-secondary
               |
               +--> Same Postgres / Redis / secret manager
```

## Key Changes

### 1. Canonical issuer and discovery

- Keep `AUTH_BASE_URL` fixed to `https://auth.lanonasis.com` on every origin.
- Continue serving `/.well-known/oauth-authorization-server` from the canonical host only.
- Add `/.well-known/openid-configuration` and `/oauth/jwks.json` on the same canonical host.
- Discovery metadata must be byte-for-byte equivalent across origins for issuer-facing fields.
- Production discovery must advertise `code_challenge_methods_supported: ["S256"]` only. Do not advertise `plain` in production.

### 2. Shared state and key material

Move or enforce all correctness-critical auth state into shared backends:

- Authorization codes and consumed status: Postgres only.
- Device codes, user codes, pending email/OTP state: Postgres-backed shared store.
- OAuth state and magic-link state: shared store only.
- Refresh token lineage, revocation, rotation history: Postgres only.
- Session lookup / invalidation records: Postgres only.
- Dynamic client registrations and redirect URI allowlists: Postgres only.
- Signing keyset and active `kid`: centralized secret manager, identical on all origins.
- Cookie/JWT verification secrets and encryption keys: identical on all origins.

Make explicitly non-authoritative:

- In-process UAI memory cache.
- Redis caches when Postgres fallback exists.
- Any local process memory CSRF/state store.

Remove or replace the current in-memory CSRF token store with one of:
- Postgres-backed `oauth_states` reuse, recommended.
- Redis with Postgres fallback.
- Stateless double-submit cookie only, if sufficient for that route.

### 3. Signing / JWKS bridge

Use hybrid bridge defaults:

- Keep legacy `JWT_SECRET` verification enabled for existing session cookies and any internal legacy validators during migration.
- Introduce asymmetric signing for the canonical issuer contract with centralized private key material and stable `kid`.
- Publish only the asymmetric public keys in JWKS.
- New issuer-facing metadata points to the canonical JWKS.
- Do not introduce a second issuer URL and do not change redirect URI semantics.

### 4. Health and readiness contract

Define two endpoints with different purposes:

- `GET /health`
  - Liveness only.
  - Returns `200` if the process is up, config loaded, and HTTP server can serve.
  - Must not fail because Redis is absent or a background cleanup job is degraded.
  - Safe for Docker/PM2/container liveness.

- `GET /ready`
  - Load balancer readiness only.
  - Returns `200` only when this origin is safe to receive OAuth/device/token traffic.
  - Must require:
    - canonical issuer config equals `https://auth.lanonasis.com`
    - signing keyset loaded and active `kid` available
    - Postgres reachable
    - required auth tables/schema visible
    - shared state store path operational
    - ability to validate one lightweight shared-state readiness heartbeat
    - session verification path operational
  - Redis should be a readiness blocker only if configured as mandatory for this environment. Otherwise report degraded detail but still `200`.
  - Implement readiness as a cached background probe, not a heavyweight write test on every request.

## Failure Behavior

- Authorization code flow:
  - `/authorize` may land on A and `/token` on B; correctness depends on shared Postgres only.
  - Code issuance and code consumption stay single-use and exact-match on redirect URI.
  - Refactor authorization code consume + token issuance into one DB transaction where practical.
  - Accepted residual risk for this rollout: if the origin dies after commit but before responding, the client may need to restart the auth flow. Do not rely on affinity to hide this.

- Device code flow:
  - `/oauth/device`, `/oauth/device/verify`, `/oauth/device/authorize`, and polling `/oauth/token` must all work across origins using shared device state.
  - If approval dies mid-step, device remains `pending` until authorize/deny/expiry is committed from any healthy origin.

- Token exchange:
  - Any healthy origin can exchange a code issued by another.
  - Redirect URI exact-match and PKCE validation remain unchanged.
  - No origin-local grant state is allowed.

- Refresh token rotation:
  - Rotation and revocation lineage stay in shared Postgres.
  - A refresh token issued on A must rotate on B.
  - Accepted residual risk for this rollout: if rotation commits and response is lost, the old refresh token is revoked and client recovery requires re-auth. Do not add response replay caching in this phase.

- Logout / session invalidation:
  - Logout on A must invalidate the shared session/token record so validation on B fails immediately after propagation.
  - Cookie clearing remains origin-agnostic because secrets and cookie config are identical.

## Rollout, Migration, and Rollback

### Migration checklist

1. Advance submodule pointers to:
   - `apps/onasis-core` `c3d18b2`
   - `apps/mcp-core` `cdf937b`
2. Add canonical asymmetric keyset and JWKS publishing.
3. Add `/ready` and reduce `/health` to liveness semantics.
4. Replace in-memory CSRF/state storage with shared storage.
5. Disable `plain` PKCE in production metadata and validation.
6. Put Cloudflare LB in front of the current single origin.
7. Add secondary origin with identical env, secrets, and DB/Redis wiring.
8. Run controlled failover tests before any active-active promotion.
9. Cut over as active-passive first with rollback prepared.

### Env/config checklist

- `AUTH_BASE_URL=https://auth.lanonasis.com` on all origins.
- `COOKIE_DOMAIN=.lanonasis.com` identical on all origins.
- Same legacy `JWT_SECRET` on all origins during bridge.
- New centralized asymmetric signing keyset with:
  - active `kid`
  - next `kid`
  - JWKS public set
- `REQUIRE_PKCE=true`
- `ALLOW_PLAIN_PKCE=false` in production
- Shared Postgres DSN(s) consistent by role
- Shared Redis URL only if used as accelerator
- Proxy trust / forwarded headers configured consistently behind Cloudflare/LB
- Readiness probe interval and fail threshold identical across origins

### Phased rollout

- Phase 1: Put Cloudflare LB in front of the current primary only; canonical hostname unchanged; `/ready` becomes the LB gate.
- Phase 2: Bring up secondary as warm standby with identical config, zero client-visible changes, and no production traffic except readiness probes and controlled smoke tests.
- Phase 3: Run failover tests with origin draining and forced origin outage while flows cross nodes.
- Phase 4: Production cutover as active-passive first; rollback by forcing LB back to primary only while keeping canonical hostname and keys unchanged.

### Rollback plan

- Keep `auth.lanonasis.com` unchanged.
- Disable traffic to secondary in LB; route all traffic to primary only.
- Do not rotate issuer, cookie domain, or key IDs during rollback.
- Keep additive schema changes only; no destructive state migration in this rollout.
- Keep hybrid signing validators able to verify both legacy and new signed artifacts during rollback window.

## Failover Test Matrix

| Scenario | Start | Finish | Expected result |
|---|---|---|---|
| Auth code on A, token on B | `/oauth/authorize` A | `/oauth/token` B | Success; exact redirect URI and PKCE still enforced |
| Device code on A, poll on B | `/oauth/device` A | `/oauth/token` B | Poll succeeds once shared state flips to authorized |
| Device verify on B after issue on A | `/oauth/device` A | `/oauth/device/verify` B | Email/approval state found and updated correctly |
| Refresh issued on A, rotated on B | `/oauth/token` A | refresh grant on B | New pair issued; old chain revoked in shared DB |
| Logout on A, session validation on B | logout A | cookie/session check B | Session invalid immediately across nodes |
| JWKS during failover | discovery/JWKS on A | validate against B | Same issuer and same active keyset |
| Primary drained mid-login | login/authorize A | repeat step on B | No origin-local state dependency blocks continuation |
| Secondary promoted during polling | device poll A | subsequent poll B | Same device_code status observed |

## Likely Breakpoints and Defaults

- Current monorepo does not yet contain the upstream keepalive fixes even though upstream submodules do.
- Current `/health` is not strict enough for LB readiness.
- Current in-memory CSRF store is not HA-safe and must not remain correctness-critical.
- Current metadata still advertises `plain` PKCE; production must not.
- Current gateway is not yet a full JWKS-backed OIDC issuer; bridge work is required.
- Authorization-code and refresh response-loss after successful commit remain accepted residual risks for this rollout.
- Default steady state: **active-passive first**.
- Default correctness store: **Postgres mandatory, Redis optional accelerator**.
- Default signing bridge: **legacy symmetric validation retained temporarily; canonical issuer uses asymmetric JWKS contract**.

## Assumptions

- Cloudflare Load Balancing is the front-door traffic manager.
- No second public issuer URL will be introduced.
- Exact redirect URI matching remains unchanged.
- Session affinity may be enabled as a performance optimization only, never as a correctness requirement.
- OAuth/browser/device/refresh semantics are preserved even if some legacy internal JWT consumers continue temporarily during the hybrid bridge.
