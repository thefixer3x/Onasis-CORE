# OAuth & API-Key Alignment Roadmap  
**Generated:** 2025-11-05 14:35 UTC  

This document lays out the concrete actions required to complete the cut-over to the new OAuth2 + MCP API-key model across every consumer (CLI, IDEs, REST API, dashboard, MCP services). Tasks are grouped so you can translate them directly into GitHub issues or phased work items.  

---

## 0. Source Of Truth Recap
- **Auth Gateway (VPS, port 3005 staging / 4000 prod)**  
  - Only issues opaque OAuth tokens (PKCE) + session cookies.  
  - Stores sessions and OAuth tokens in Neon (`auth_gateway.*`, `oauth_tokens`).  
- **MCP Core (VPS, ports 3001/3002/3003)**  
  - Accepts either gateway JWTs or MCP API keys.  
  - Directly queries Supabase (`memory_entries`, `api_keys`, vendor metadata).  
  - New REST routes exposed: `GET/POST /api/v1/memory`.  
- **Netlify Functions (`api.lanonasis.com`)**  
  - Legacy JWT and API key flows; stays online until consumers migrate.  
- **Dashboard**  
  - Generates API keys via Supabase RPCs. Needs to emit `key_id.key_secret` format.  
- **CLI/IDEs**  
  - Today: expect local JWT token in `~/.maas.config`.  
  - Target: store OAuth tokens + API key bundle.  

---

## 1. CLI Workstream (`@lanonasis/cli`)
1. **Config Schema Update**
   - New structure for `~/.maas.config`:
     ```json
     {
       "auth": {
         "tokens": {
           "access_token": "",
           "refresh_token": "",
           "token_type": "Bearer",
           "expires_at": "ISO timestamp",
           "scope": ""
         },
         "legacyToken": "",        // optional, for fallback while migrating
         "api_key": "pk_xxx.sk_xxx",
         "client_id": "lanonasis-cli"
       },
       "services": {
         "auth_gateway": "https://auth.lanonasis.com",
         "mcp_http": "https://mcp.lanonasis.com/api/v1",
         "mcp_ws": "wss://mcp.lanonasis.com/ws",
         "mcp_sse": "https://mcp.lanonasis.com/api/v1/events",
         "rest_api": "https://api.lanonasis.com/api/v1"
       },
       "last_updated": "ISO timestamp"
     }
     ```
   - Migration step on CLI startup: if `config.token` exists, move to `auth.legacyToken` and prompt user to re-auth.

2. **PKCE Login Flow**
   - Generate code verifier/challenge, open browser: `https://auth.lanonasis.com/oauth/authorize?...`.
   - Start localhost callback listener (`http://127.0.0.1:8989/callback`).  
   - Exchange code at `/oauth/token` (port 3005 staging, 4000 when live).  
   - Persist token pair + metadata from response.
   - Provide `lanonasis auth token --refresh` command to renew via refresh token.

3. **API Key Handling**
   - CLI should request/generate MCP API key via:
     - If dashboard provides key: accept `pk_*.sk_*`.
     - Else call `POST https://mcp.lanonasis.com/api/v1/auth/api-keys` (requires OAuth bearer). Return full key string; store under `auth.api_key`.
   - For every MCP HTTP request:  
     - default header `X-API-Key: <key>`.  
     - Only use `Authorization: Bearer` for OAuth-protected routes (gateway, rest API).

4. **Command Updates**
   - Memory commands (`lanonasis memory list/create/...`) should target MCP endpoint:  
     - `GET https://mcp.lanonasis.com/api/v1/memory?…`  
     - `POST https://mcp.lanonasis.com/api/v1/memory`.
   - Provide fallback flag `--legacy-api` to call Netlify endpoints during phased rollout.

5. **Testing Checklist**
   - Unit: config migration, PKCE helper, refresh handler.  
   - Integration: end-to-end login + memory create in staging (port 3005).  
   - Regression: ensure API-key-only flows (`lanonasis auth login --method api-key`) continue.

---

## 2. IDE / Extension Workstream (VSCode, Windsurf, Cursor)
1. **Configuration Persistence**
   - Mirror CLI config schema (shared util recommended).  
   - If IDE caches token in different location, still store `access_token`, `refresh_token`, `api_key`.
2. **Auth Flow**
   - Use embedded browser or prompt to open `auth.lanonasis.com/oauth/authorize`.  
   - On AUTH_REQUIRED from `/oauth/authorize`, redirect to `/web/login`; once cookies set, re-run authorize.
   - Exchange code -> store tokens & API key.  
   - Provide UI to rotate API key (call MCP `/api/v1/auth/api-keys`).
3. **Request Pipeline**
   - MCP requests: `X-API-Key`.  
   - Rest API / Dashboard / Auth: OAuth bearer.
   - Add guard so legacy JWT verification (`jwt.verify`) is removed. Instead call `/oauth/introspect` if runtime validation needed.
4. **Error Surfacing**
   - If 401 from MCP: check key expiry, re-fetch.  
   - Distinguish between OAuth expiry vs API-key invalid formatting.

---

## 3. REST API & Dashboard Alignment
1. **Dashboard API Key Generation**
   - Update key creation endpoint to return `key_id` + `key_secret`, combine as `${key_id}.${key_secret}`.  
   - Provide UI copy button with full string.  
   - Display warning if user copies only `pk_` portion.

2. **REST API Routes (`api.lanonasis.com`)**
   - Replace local `jwt.verify` with gateway `/oauth/introspect` (or call new gateway compatibility endpoints if added).  
   - For memory-specific endpoints that remain on Netlify, consider proxying to MCP HTTP API or mark as deprecated.

3. **Serverless Functions**
   - `maas-api.js` should accept same key pattern as MCP core (already parses). Ensure environment has `SUPABASE_SERVICE_ROLE_KEY`.
   - Add `Authorization: Bearer <access_token>` fallback while migrating.

---

## 4. MCP Core Follow-ups
1. **API Key Validation**
   - Re-enable Supabase RPC `validate_vendor_api_key` (restore `digest()` extension).  
   - Once RPC works, remove warning fallback in `authenticateApiKey`.  
   - Optionally, store derived vendor info on request for analytics.

2. **REST Surface Completion**
   - Implement:  
     - `GET /api/v1/memory/:id`  
     - `PUT /api/v1/memory/:id`  
     - `DELETE /api/v1/memory/:id`  
     - `POST /api/v1/memory/search`  
     - `GET /api/v1/memory/stats`  
   - Ensure each endpoint attaches `user_id` from token or API key (today insert uses system user).

3. **Logging & Analytics**
   - Write structured logs (JSON) with `request_id`, `api_key_id`, `user_id`.  
   - Push metrics to Neon or separate warehouse if needed (current Neon only sees auth gateway activity).

4. **Docs**
   - Update `/opt/lanonasis/mcp-core/README.md` to reflect new endpoints & auth expectations.

---

## 5. Auth Gateway Actions
1. **Port 3005 Staging → 4000 Cutover**
   - Confirm all clients authenticated successfully via port 3005.  
   - Apply `/oauth/token` CSRF fix on 4000 build, rebuild, restart PM2 cluster.  
   - Swap Nginx routing when ready; keep 3005 as blue/green backup.

2. **Compatibility Endpoints (Optional)**
   - `/legacy/introspect` → accepts legacy JWT, returns user info.  
   - `/legacy/exchange` → accept legacy JWT, return OAuth token pair.  
   - Use these to bridge remaining services before full refactor.

3. **Session Observability**
   - Add logs or metrics for `/oauth/token`, `/oauth/authorize`.  
   - Consider shipping structured logs to centralized store for cross-service auditing.

---

## 6. Rollout Timeline (Suggested)
| Phase | Target | Tasks | Notes |
|-------|--------|-------|-------|
| **Phase 0** | Today | Complete staging auth gateway (3005) & MCP REST adjustments | ✅ Done |
| **Phase 1** | T+1 day | Update CLI (PKCE + API key storage), release beta build | Test with 3005 |
| **Phase 2** | T+2 days | Update IDE extensions, enable `X-API-Key` header | keep legacy token fallback |
| **Phase 3** | T+3 days | REST API / Dashboard alignment | Introspect + key format |
| **Phase 4** | T+5 days | Production cutover (swap gateway ports, disable legacy JWT issuance) | Monitor logs |
| **Phase 5** | T+7 days | Decommission legacy auth (port 3005), remove compatibility endpoints | Final audit |

Use GitHub projects to map tasks per phase; include service name + path references above.

---

## 7. Observability Gaps
- **MCP traffic**: only logged locally on VPS; Neon sees auth tokens but not MCP API calls.  
  - Action: forward PM2 logs to centralized store or insert audit rows in Supabase (`memory_access_patterns`).  
- **Token inventory**: build dashboard (Neon) to view active OAuth tokens, API keys, last used timestamps.
- **Alerting**: add Nginx + PM2 health monitors for ports 3001/3002/3003/3005/4000.

---

## 8. Immediate Next Steps Checklist
- [ ] CLI: create feature branch implementing config migration + PKCE.  
- [ ] IDEs: schedule update to store tokens + API key, remove local JWT verification.  
- [ ] Dashboard: adjust API key response payload + UI.  
- [ ] REST API: replace `jwt.verify` usage w/ introspection, plan to proxy to MCP HTTP routes.  
- [ ] MCP Core: restore Supabase function and remove fallback once confirmed.  
- [ ] Auth Gateway: rebuild 4000 bundle, restart cluster, prepare blue/green cutover plan.

Keep this document updated as tasks close; include commit SHAs and deployment timestamps for auditability.  

---

## Appendix A – Port & Endpoint Reference

| Service | Purpose | Port(s) | External URL(s) | Notes |
|---------|---------|---------|-----------------|-------|
| Auth Gateway (staging) | PKCE OAuth, sessions | 3005 | `https://auth.lanonasis.com:3005` (temporary) | Blue/green testing only; mirrors prod build |
| Auth Gateway (prod) | PKCE OAuth, sessions | 4000 | `https://auth.lanonasis.com` | Two PM2 instances in cluster mode |
| MCP Core HTTP | REST tools (memory, key mgmt) | 3001 | `https://mcp.lanonasis.com/api/v1/*` | Accepts OAuth bearer or `X-API-Key` |
| MCP Core WebSocket | Realtime MCP | 3002 | `wss://mcp.lanonasis.com/ws` | API key or OAuth metadata |
| MCP Core SSE | Streaming events | 3003 | `https://mcp.lanonasis.com/api/v1/events` | Mirrors WS capabilities |
| Legacy Quick Auth | Backup JWT flow | 3005 (PM2 `auth` namespace) | `https://auth.lanonasis.com:3005` | Kept off unless rollback |
| Netlify API | Legacy REST endpoints | N/A | `https://api.lanonasis.com/api/v1/*` | Falls back during migration |

Environment variables to set across repos:

- `AUTH_GATEWAY_URL=https://auth.lanonasis.com`
- `MCP_HTTP_URL=https://mcp.lanonasis.com/api/v1`
- `MCP_WS_URL=wss://mcp.lanonasis.com/ws`
- `MCP_SSE_URL=https://mcp.lanonasis.com/api/v1/events`
- `API_BASE_URL=https://api.lanonasis.com/api/v1`

Ensure CLI/IDE configs resolve these values from env or project settings so staging vs prod swaps are trivial.

---

## Appendix B – Request Parameter Cheatsheet

### OAuth 2.0 Authorization (PKCE)
- Endpoint: `GET /oauth/authorize`
- Required query params:
  - `response_type=code`
  - `client_id=<registered_client>`
  - `redirect_uri=<pre-registered callback>`
  - `scope=<space-delimited scopes>`
  - `code_challenge=<base64url(SHA256(verifier))>`
  - `code_challenge_method=S256`
  - `state=<nonce for CSRF tracking>`

### OAuth 2.0 Token Exchange
- Endpoint: `POST /oauth/token`
- Headers: `Content-Type: application/json`
- Authorization-code grant payload:
  ```json
  {
    "grant_type": "authorization_code",
    "code": "<returned_code>",
    "redirect_uri": "<same_as_authorize>",
    "client_id": "<registered_client>",
    "code_verifier": "<original_verifier>"
  }
  ```
- Refresh payload:
  ```json
  {
    "grant_type": "refresh_token",
    "refresh_token": "<refresh_token>",
    "client_id": "<registered_client>"
  }
  ```

### MCP HTTP Memory API
- `GET /api/v1/memory?limit=...&offset=...&type=...&tags=tag1,tag2`
  - Headers: `X-API-Key: pk_....sk_....`
- `POST /api/v1/memory`
  ```json
  {
    "title": "Example",
    "content": "Details",
    "type": "context",
    "tags": ["tag"],
    "metadata": { "project": "example" }
  }
  ```
- Future endpoints will mirror this header/JSON format.

For REST API calls that remain on Netlify, continue to send the same `X-API-Key` header. For gateway-protected routes (`/v1/auth/*`, `/oauth/*`), prefer OAuth bearer tokens.

---

## Appendix C – Security & CSP Notes
- Legacy nonce-based inline script allowances in the dashboard were removed; CSP now enforces strict `form-action` to align with PKCE redirects. All clients must complete the `/web/login` step in the same browser session to satisfy session cookies.
- CSRF protection on `/oauth/token` has been reworked (double-submit cookie removed) because PKCE + HTTPS guarantees request integrity for public clients. Servers still set `state` and `code_challenge` to guard replay.
- Ensure all embedded browsers honor `https://auth.lanonasis.com` as the sole redirect target. Mixed-content or alternative hostnames will violate CSP.
- When embedding the login page inside IDEs, ensure the embedded webview allows third-party cookies so the session cookie survives the `/web/login` → `/oauth/authorize` roundtrip.

---

*Prepared by Codex (OpenAI) on 2025-11-05 14:35 UTC for migration planning.*  
