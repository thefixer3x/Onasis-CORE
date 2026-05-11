# API Dependency Impact Matrix

**Document Type:** Dependency Audit Report  
**Revision:** 2.0  
**Date:** 2026-05-11  
**Scope:** api.lanonasis.com Netlify → VPS Migration  
**Status:** REVISED — Pre-Execution Hardening

---

## Executive Summary

### Highest-Risk Dependencies (P0)

| Dependency ID | Name | Risk Score | Notes |
|--------------|------|-----------|-------|
| DEP-MCP-WS | MCP WebSocket Clients | 85 | Long-lived WS connections, manual reconnection required |
| DEP-MCP-SSE | MCP SSE Clients | 85 | EventSource auto-reconnect, but needs verification |
| DEP-OAUTH-001 | OAuth Authorize | 75 | Multi-step redirect flow |
| DEP-OAUTH-002 | OAuth Token | 75 | Token exchange |
| DEP-AUTH-SESSION | Auth Session Cookies | 70 | Set-Cookie handling |
| DEP-AUTH-LOGIN | Auth Login | 70 | Session creation |
| DEP-AUTH-REFRESH | Auth Refresh | 70 | Session refresh |

### Route Families Most Likely to Break

1. **MCP Protocol** (`/mcp`, `/mcp/*`) — SSE/WS long-lived connections
2. **OAuth Flows** (`/oauth/*`, `/auth/*`) — Multi-step redirects  
3. **Auth Session** (`/api/v1/auth/login`, `/register`) — Cookie handling
4. **Supabase Direct** (`/api/v1/intelligence/*`) — Direct proxy

### Unknowns That Block Bridge Testing

- MCP client reconnection behavior after DNS change
- OAuth redirect URI propagation
- CORS preflight handling differences

### Unknowns That Block DNS Cutover

- `api.lanonasis.com` SSL certificate (needs certbot DNS challenge)
- Long-lived WS connections during TTL propagation

### Recommended Bridge Phases

**Phase B — Static/Health/Info Routes (Bridge First)**
1. `GET /health` — Read-only, no auth
2. `GET /info` — Read-only, no auth
3. `GET /api/v1/health` — Health check
4. `GET /.well-known/onasis.json` — Static discovery

**Phase C — Auth-Adjacent Read-Only Routes (Bridge Second)**
1. `GET /api/v1/auth/status` — Lightweight token check (Supabase direct, header-sensitive)
2. `GET /api/v1/config/*` — Read config
3. `GET /api/v1/memory/health` — Health check

---

## 1. Dependency Matrix Table

| Dependency ID | Service/Client Name | Type | Source Location | Domain Referenced | Route(s) Used | HTTP Method(s) | Auth Mechanism | Required Headers | Required Cookies | Expected Response Status | Expected Response Shape |
|--------------|-------------------|------|---------------|-----------------|-------------|---------------|----------------|----------------|-------------------|-------------------------|------------------------|
| DEP-MCP-WS | MCP WS Client | MCP | `src/mcp/server.ts` | `mcp.lanonasis.com` | `/mcp/ws` | WS | Bearer JWT | Authorization | none | 101 + WS | tool_calls, results |
| DEP-MCP-SSE | MCP SSE Client | MCP | `src/mcp/server.ts` | `mcp.lanonasis.com` | `/mcp/sse` | GET (SSE) | Bearer JWT | Authorization | none | 200 + event stream | events |
| DEP-MCP-HTTP | MCP HTTP Client | MCP | `src/mcp/api.ts` | `api.lanonasis.com` | `/mcp/tools` | GET/POST | API Key | X-API-Key | none | 200 + JSON | tools list |
| DEP-OAUTH-AUTH | OAuth Authorize | auth flow | `onasis-mcp/src/routes/oauth.ts` | `api.lanonasis.com` | `/oauth/authorize` | GET | None | none | state cookie | 302 → redirect_uri | URL with code, state |
| DEP-OAUTH-TOKEN | OAuth Token | auth flow | `onasis-mcp/src/routes/oauth.ts` | `api.lanonasis.com` | `/oauth/token` | POST | Basic | none | none | 200 + JSON | access_token, token_type |
| DEP-OAUTH-CB | OAuth Callback | auth flow | `netlify/cli-auth.js` | `mcp.lanonasis.com` | `/oauth/callback` | GET | None | state | none | 200 + HTML | HTML or redirect |
| DEP-AUTH-LOGIN | Auth Login | backend | `services/auth-gateway` | `api.lanonasis.com` | `/api/v1/auth/login` | POST | None | Content-Type | Set-Cookie | 200 + JWT | token, user info |
| DEP-AUTH-REG | Auth Register | backend | `services/auth-gateway` | `api.lanonasis.com` | `/api/v1/auth/register` | POST | None | Content-Type | Set-Cookie | 200 + JWT | token, user info |
| DEP-AUTH-REFRESH | Auth Refresh | backend | `services/auth-gateway` | `api.lanonasis.com` | `/api/v1/auth/refresh` | POST | Cookie | Cookie | Set-Cookie | 200 + JWT | new token |
| DEP-AUTH-STATUS | Auth Status | backend | Supabase EF | `api.lanonasis.com` | `/api/v1/auth/status` | GET | Bearer/Key | Authorization, X-API-Key | none | 200/401 | status, user |
| DEP-MEM-SEARCH | Memory Search | backend | `src/mcp/api.ts` | `api.lanonasis.com` | `/api/v1/memories/search` | POST | API Key | X-API-Key | none | 200 + JSON | memories |
| DEP-MEM-CRUD | Memory CRUD | backend | `src/mcp/api.ts` | `api.lanonasis.com` | `/api/v1/memories` | POST/GET/PUT/DELETE | API Key | X-API-Key | none | 200 + JSON | memory objects |
| DEP-KEY-CR | API Key Create | backend | Supabase EF | `api.lanonasis.com` | `/api/v1/keys` | POST | API Key | X-API-Key | none | 200 + JSON | key object |
| DEP-KEY-LIST | API Key List | backend | Supabase EF | `api.lanonasis.com` | `/api/v1/keys/list` | GET | API Key | X-API-Key | none | 200 + JSON | keys array |
| DEP-INT-ANALYZE | Intelligence Analyze | backend | Supabase EF | `api.lanonasis.com` | `/api/v1/intelligence/analyze-patterns` | POST | API Key | X-API-Key | none | 200 + JSON | analysis |
| DEP-INT-TAGS | Intelligence Suggest Tags | backend | Supabase EF | `api.lanonasis.com` | `/api/v1/intelligence/suggest-tags` | POST | API Key | X-API-Key | none | 200 + JSON | suggestions |
| DEP-PROF-GET | Profile Get | backend | Supabase EF | `api.lanonasis.com` | `/api/v1/profiles/:id` | GET | Bearer/Key | Authorization | none | 200/404 | profile object |
| DEP-PROF-ASK | Profile Ask | backend | Supabase EF | `api.lanonasis.com` | `/api/v1/profiles/:id/ask` | POST | Bearer/Key | Authorization | none | 200 + JSON | answer |
| DEP-FE-DASH | Dashboard Frontend | frontend | Next.js app | `api.lanonasis.com` | `/api/v1/*` | Various | Bearer JWT | Authorization | none | 200 + JSON | various |
| DEP-FE-DOCS | Docs Site | frontend | Next.js app | `api.lanonasis.com` | `/api/v1/*` | Various | API Key | X-API-Key | none | 200 + JSON | various |
| DEP-CLI-MEM | Memory CLI | CLI | `onasis-mcp/src/cli.ts` | `api.lanonasis.com` | `/api/v1/memory/*` | Various | API Key | X-API-Key | none | 200 + JSON | memory ops |
| DEP-CLI-CFG | Config CLI | CLI | `onasis-mcp/src/cli.ts` | `api.lanonasis.com` | `/api/v1/config/*` | GET/PUT | API Key | X-API-Key | none | 200 + JSON | config |
| DEP-TEST-E2E | E2E Tests | test suite | `e2e/auth.e2e.spec.ts` | `api.lanonasis.com` | `/api/v1/auth/*` | Various | None | none | none | 200/401 | various |

---

## 2. Route-Family Dependency Table

| Route Family | Methods | Current Netlify Target | Target VPS Backend | Auth Type | CORS | Migration Risk | Bridge Phase |
|------------|---------|-------------------|-------------------|-----------|------|--------------|--------------|
| `/health` | GET | static | unified-gateway:3000 | none | ✅ | LOW | **B** |
| `/info` | GET | N/A (new) | unified-gateway:3000 | none | ✅ | LOW | **B** |
| `/api/v1/health` | GET | N/A (new) | unified-gateway:3000 | none | ✅ | LOW | **B** |
| `/.well-known/onasis.json` | GET | static file | nginx static | none | ❌ | LOW | **B** |
| `/api/v1/auth/status` | GET | auth-api → Supabase | Supabase direct | Bearer/Key | ✅ | MEDIUM | **C** |
| `/api/v1/config/*` | GET/PUT | maas-api | unified-gateway:3000 | API Key | ✅ | MEDIUM | **C** |
| `/api/v1/memory/health` | GET | memory-proxy → Supabase | unified-gateway:3000 | API Key | ✅ | MEDIUM | **C** |
| `/api/v1/auth/login` | POST | auth-api | auth-gateway:4000 | session | ✅ | HIGH | **D** |
| `/api/v1/auth/register` | POST | auth-api | auth-gateway:4000 | session | ✅ | HIGH | **D** |
| `/api/v1/auth/refresh` | POST | auth-api | auth-gateway:4000 | cookie | ✅ | HIGH | **D** |
| `/api/v1/auth/*` | * | auth-api | auth-gateway:4000 | session/JWT | ✅ | HIGH | **D** |
| `/oauth/*` | GET/POST | auth-api | auth-gateway:4000 | session | ✅ | HIGH | **D** |
| `/auth/*` | GET/POST | auth-api | auth-gateway:4000 | session | ✅ | HIGH | **D** |
| `/api/v1/memories/*` | * | memory-proxy → Supabase | unified-gateway:3000 | API Key | ✅ | MEDIUM | **C** |
| `/api/v1/memory/*` | * | memory-proxy → Supabase | unified-gateway:3000 | API Key | ✅ | MEDIUM | **C** |
| `/api/v1/keys/*` | * | maas-api | unified-gateway:3000 | API Key | ✅ | MEDIUM | **C** |
| `/v1/keys/*` | * | key-manager | unified-gateway:3000 | API Key | ✅ | MEDIUM | **C** |
| `/api/v1/intelligence/*` | * | proxy → Supabase | Supabase direct | API Key | ✅ | MEDIUM | **C** |
| `/api/v1/profiles/*` | * | N/A (new) | Supabase direct | Bearer/Key | ✅ | MEDIUM | **C** |
| `/api/v1/projects/*` | * | maas-api | unified-gateway:3000 | API Key | ✅ | MEDIUM | **C** |
| `/mcp` (SSE) | GET | mcp Netlify | mcp-server:3104 | Bearer/Key | ✅ | HIGH | **E** |
| `/mcp` (WS) | WS | mcp Netlify | mcp-server:3104 | Bearer/Key | ✅ | HIGH | **E** |
| `/mcp/*` | GET/POST | mcp Netlify | mcp-server:3104 | API Key | ✅ | HIGH | **E** |

---

## 3. Domain Reference Table

| Domain | Type | Runtime Owner | Active | References |
|--------|------|--------------|--------|----------|
| `api.lanonasis.com` | primary | Netlify (current) → nginx (target) | YES | 200+ |
| `gateway.lanonasis.com` | secondary | VPS nginx | YES | 5 |
| `auth.lanonasis.com` | auth | auth-gateway (VPS) | NO (redirects) | 3 |
| `mcp.lanonasis.com` | MCP | VPS nginx | YES | 80+ |
| `mcp1.lanonasis.com` | MCP | VPS nginx | YES | 5 |
| `auth.connectionpoint.tech` | auth | auth-gateway | YES | 2 |
| `lanonasis.supabase.co` | Supabase | Supabase | YES | 25+ |

---

## 4. Frontend/CORS Dependency Table

| Origin | Allowed | Current Header | Migration Target |
|--------|---------|---------------|----------------|
| `https://dashboard.lanonasis.com` | ✅ | ACAO | nginx whitelist |
| `https://docs.lanonasis.com` | ✅ | ACAO | nginx whitelist |
| `https://lanonasis.com` | ✅ | ACAO | nginx whitelist |
| `https://api.lanonasis.com` | ✅ | ACAO | nginx whitelist |
| `https://mcp.lanonasis.com` | ✅ | ACAO | nginx whitelist |
| `http://localhost:*` | ✅ | ACAO | nginx whitelist |
| Other origins | ❌ | (no header) | nginx whitelist |

---

## 5. Auth/Session Dependency Table

| Auth Type | Header/Cookie | SameSite | Secure | Migration Impact |
|-----------|--------------|---------|--------|----------------|
| JWT Bearer | `Authorization: Bearer <token>` | n/a | ✅ | LOW |
| API Key | `X-API-Key: <key>` | n/a | ✅ | LOW |
| Session Cookie | `Set-Cookie` | `Lax` | ✅ | MEDIUM |
| OAuth State | `state` param | n/a | ✅ | LOW |
| OAuth Callback | query param | n/a | ✅ | MEDIUM |

---

## 6. MCP/SSE/WebSocket Dependency Table

| Protocol | Endpoint | Reconnection Logic | Bridge Phase |
|----------|----------|-------------------|--------------|
| SSE | `/mcp/sse` | EventSource auto-reconnect | **E** (last) |
| WebSocket | `/mcp/ws` | Manual reconnect required | **E** (last) |
| HTTP | `/mcp/tools`, `/mcp/message` | None (stateless) | **C** (read-only) |

---

## 7. Netlify Wrapper Dependency Table

| Netlify Function | Replaced By | Migration Status |
|-----------------|------------|-----------------|
| `memory-proxy/*` | unified-gateway | ✅ implemented |
| `auth-api/*` | auth-gateway | ✅ implemented |
| `cli-auth/*` | auth-gateway | ✅ implemented |
| `mcp-sse/*` | mcp-server | ✅ implemented |
| `mcp-message/*` | mcp-server | ✅ implemented |
| `mcp/*` | mcp-server | ✅ implemented |
| `key-manager/*` | unified-gateway | ✅ implemented |
| `maas-api/*` | unified-gateway | ✅ implemented |

---

## 8. Supabase Direct Proxy Dependency Table

| Edge Function | VPS Route | Bridge Phase |
|--------------|----------|--------------|
| `auth-status` | `/api/v1/auth/status` | **C** |
| `intelligence-suggest-tags` | `/api/v1/intelligence/suggest-tags` | **C** |
| `intelligence-analyze-patterns` | `/api/v1/intelligence/analyze-patterns` | **C** |
| `intelligence-profiles` | `/api/v1/profiles/*` | **C** |
| `memory-*` EFs | via unified-gateway | **C** |
| `api-key-*` EFs | via unified-gateway | **C** |

---

## 9. Netlify Bridge Rollback Gate

| Pre-Bridge Requirement | Command/Action |
|------------------------|----------------|
| Backup current _redirects | `cp apps/onasis-core/_redirects apps/onasis-core/_redirects.backup.$(date +%Y%m%d%H%M%S)` |
| Prepare rollback patch | Create patch file: `git diff apps/onasis-core/_redirects > rollback-bridge.patch` |
| Restore command | `cp apps/onasis-core/_redirects.backup.YYYYMMDDHHMMSS apps/onasis-core/_redirects && git checkout apps/onasis-core/_redirects` |
| Commit rollback | `git checkout apps/onasis-core/_redirects` or apply patch |

---

## 10. Verification Command Table

| Route | Verification Command | Expected | Bridge Phase |
|-------|---------------------|----------|--------------|
| `/health` | `curl -s https://api.lanonasis.com/health` | `{"status":"healthy"}` | **B** |
| `/info` | `curl -s https://api.lanonasis.com/info` | JSON info | **B** |
| `/api/v1/health` | `curl -s https://api.lanonasis.com/api/v1/health` | JSON health | **B** |
| `/.well-known/onasis.json` | `curl -s https://api.lanonasis.com/.well-known/onasis.json` | JSON discovery | **B** |
| `/api/v1/auth/status` | `curl -s https://api.lanonasis.com/api/v1/auth/status` | 200 or 401 | **C** |
| `/api/v1/config/*` | `curl -s https://api.lanonasis.com/api/v1/config -H "X-API-Key: test"` | 200 or 401 | **C** |
| `/api/v1/memory/health` | `curl -s https://api.lanonasis.com/api/v1/memory/health` | JSON health | **C** |
| `/api/v1/auth/login` (invalid) | `curl -s -X POST https://api.lanonasis.com/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"invalid","password":"wrong"}'` | 400/401 (no 502) | **D** |
| `/api/v1/auth/login` (valid) | `curl -s -X POST https://api.lanonasis.com/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"test@lanonasis.com","password":"***"}'` | 200 + Set-Cookie | **D** |
| `/oauth/authorize` | `curl -skI --resolve api.lanonasis.com:443:$VPS_IP "https://api.lanonasis.com/oauth/authorize?client_id=test&redirect_uri=https://test.com&response_type=code&state=abc"` | 302 → Location | **D** |
| `/mcp/sse` | `curl -s -N https://api.lanonasis.com/mcp/sse -H "X-API-Key: test"` | 200 + event stream | **E** |
| `/mcp/ws` (WS test) | `npx -y wscat -c wss://api.lanonasis.com/mcp/ws -H "X-API-Key: test"` or DNS override | 101 + WS | **E** |

---

## 11. Unknowns Summary

| Unknown | Impact | Resolution Method |
|---------|--------|-----------------|
| MCP client reconnection behavior | HIGH | Test with DNS override |
| OAuth redirect_uri validation | HIGH | Verify redirect URIs match |
| Set-Cookie SameSite attribute | MEDIUM | Inspect cookie header post-migration |
| Long-lived WS during DNS change | HIGH | Warn users, provide reconnection |

---

## Migration Phases (Revised)

### Phase A — Infrastructure (Pre-Cutover)

- Deploy nginx config to VPS
- Issue SSL certificate via DNS challenge
- Smoke-test all routes with `--resolve`

### Phase B — Static/Health/Info Routes (Bridge First)

**CRITERIA:** No auth, no session, static or health-only

Bridge via Netlify `_redirects`:
1. `GET /health` → VPS
2. `GET /info` → VPS
3. `GET /api/v1/health` → VPS
4. `GET /.well-known/onasis.json` → VPS

### Phase C — Auth-Adjacent Read-Only Routes (Bridge Second)

**CRITERIA:** Read-only, no session/cookie, lightweight

Bridge:
1. `GET /api/v1/auth/status` → VPS Supabase direct
2. `GET /api/v1/config/*` → VPS
3. `GET /api/v1/memory/health` → VPS
4. `/api/v1/memories/*` (GET only) → VPS
5. `/api/v1/intelligence/*` → VPS Supabase direct

### Phase D — Auth/Session/OAuth Routes (Bridge Third)

**CRITERIA:** Behavioral parity proven via `--resolve` tests

**DO NOT BRIDGE UNTIL:**
- Invalid credentials return 400/401 (not 502)
- Valid login returns Set-Cookie header
- OAuth authorize redirects correctly
- OAuth token exchange works

Bridge:
- All `/api/v1/auth/*` routes
- All `/oauth/*` routes
- All `/auth/*` routes

### Phase E — Long-Lived Connections (Bridge Fourth)

**CRITERIA:** Clients reconnection verified

**DO NOT BRIDGE UNTIL:**
- MCP SSE reconnects after simulated DNS change
- WebSocket clients reconnect correctly

Bridge:
- `/mcp` (SSE) → VPS
- `/mcp` (WebSocket) → VPS
- `/mcp/*` (HTTP) → VPS

### DNS Cutover Gate

**BLOCKERS:**
- ❌ No SSL certificate for `api.lanonasis.com`
- ❌ Any Phase B failure under `--resolve` test
- ❌ Any Phase C failure under `--resolve` test  
- ❌ Auth login cookie handling not verified
- ❌ OAuth flows not verified
- ❌ MCP reconnection not tested

---

## Rollback Path

If any critical failure during bridge phases:
1. Restore `_redirects` from backup
2. Or apply rollback patch: `git checkout apps/onasis-core/_redirects`
3. Or manually revert bridge entries in `_redirects`

For DNS cutover failure:
- Revert DNS A record to Netlify IP immediately
- Netlify site remains live during migration window

---

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 2.0 |
| Created | 2026-05-11 |
| Last Updated | 2026-05-11 02:30 UTC |
| Owner | Infrastructure Team |
| Review Frequency | Daily during migration |

---

*This document is a living artifact. Update as new dependencies are discovered.*