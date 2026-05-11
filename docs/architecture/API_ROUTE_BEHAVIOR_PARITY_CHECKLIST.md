# API Route Behavior Parity Checklist

**Document Type:** Route-by-Route Behavioral Parity Tests  
**Revision:** 2.0  
**Date:** 2026-05-11  
**Scope:** api.lanonasis.com Netlify → VPS Migration  
**Status:** REVISED — Pre-Execution Hardening

---

## Test Methodology

### Test Command Format

**VPS target via --resolve:**
```bash
VPS_IP="168.231.74.29"
curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/route [options]
```

**Netlify (baseline) — current path:**
```bash
curl -sk https://api.lanonasis.com/route [options]
```

---

## Phase B — Static/Health/Info Routes (Bridge First)

| Route | Test Command (VPS) | Expected | Status |
|-------|---------------------|----------|--------|
| `GET /health` | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/health` | `{"status":"healthy"}` | ⬜ |
| `GET /info` | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/info` | JSON info object | ⬜ |
| `GET /api/v1/health` | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/api/v1/health` | JSON health | ⬜ |
| `GET /.well-known/onasis.json` | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/.well-known/onasis.json` | JSON discovery | ⬜ |

---

## Phase C — Auth-Adjacent Read-Only Routes (Bridge Second)

### 1. Auth Status (Supabase Direct, Header-Sensitive)

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /api/v1/auth/status (no auth) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/api/v1/auth/status` | 401 + error JSON | ⬜ |
| GET /api/v1/auth/status (Bearer) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "Authorization: Bearer $TOKEN" https://api.lanonasis.com/api/v1/auth/status` | 200 + user info | ⬜ |
| GET /api/v1/auth/status (X-API-Key) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test-key" https://api.lanonasis.com/api/v1/auth/status` | 200 or 401 | ⬜ |

### 2. Config Read-Only

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /api/v1/config | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" https://api.lanonasis.com/api/v1/config` | 200 + config | ⬜ |
| GET /api/v1/config/:key | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" https://api.lanonasis.com/api/v1/config/test` | 200 or 404 | ⬜ |

### 3. Memory Health/Read

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /api/v1/memory/health | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" https://api.lanonasis.com/api/v1/memory/health` | 200 + health | ⬜ |
| GET /api/v1/memories (list) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" https://api.lanonasis.com/api/v1/memories` | 200 + array | ⬜ |
| GET /api/v1/memories/:id | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" https://api.lanonasis.com/api/v1/memories/test-id` | 200 or 404 | ⬜ |

### 4. Intelligence (Supabase Direct)

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /api/v1/intelligence/health-check | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/api/v1/intelligence/health-check` | 200 + status | ⬜ |
| POST /api/v1/intelligence/suggest-tags | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "X-API-Key: test" -d '{"query":"test"}' https://api.lanonasis.com/api/v1/intelligence/suggest-tags` | 200 + suggestions | ⬜ |
| POST /api/v1/intelligence/analyze-patterns | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "X-API-Key: test" -d '{"data":[]}' https://api.lanonasis.com/api/v1/intelligence/analyze-patterns` | 200 + analysis | ⬜ |

### 5. Profiles (Phase 2)

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /api/v1/profiles/:id | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "Authorization: Bearer $TOKEN" https://api.lanonasis.com/api/v1/profiles/test-id` | 200 or 404 | ⬜ |
| GET /api/v1/profiles/:id/versions | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "Authorization: Bearer $TOKEN" https://api.lanonasis.com/api/v1/profiles/test-id/versions` | 200 or 404 | ⬜ |

---

## Phase D — Auth/Session/OAuth Routes (Bridge Third)

### 1. Auth Login - Invalid Credentials

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| POST /api/v1/auth/login (no body) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/json" https://api.lanonasis.com/api/v1/auth/login` | 400 + error | ⬜ |
| POST /api/v1/auth/login (invalid creds) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/json" -d '{"email":"invalid@test.com","password":"wrongpass"}' https://api.lanonasis.com/api/v1/auth/login` | 400 or 401 + error JSON (NOT 502) | ⬜ |
| POST /api/v1/auth-login (invalid) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/json" -d '{"email":"invalid@test.com","password":"wrongpass"}' https://api.lanonasis.com/api/v1/auth-login` | 400 or 401 + error JSON (NOT 502) | ⬜ |

**ACCEPTABLE DIFFERENCES:**
- Error message text may differ (Netlify vs VPS)
- Field names may vary (e.g., `message` vs `error`)
- MUST NOT return 502 (Bad Gateway) — indicates routing failure

### 2. Auth Login - Valid Credentials

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| POST /api/v1/auth/login (valid) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/json" -d '{"email":"test@lanonasis.com","password":"***"}' https://api.lanonasis.com/api/v1/auth/login` | 200 + user info + Set-Cookie (if cookie mode enabled) | ⬜ |

**CRITICAL CHECK:** Verify Set-Cookie header is present and contains session token.

### 3. Auth Register

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| POST /api/v1/auth/register (no body) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/json" https://api.lanonasis.com/api/v1/auth/register` | 400 + validation errors | ⬜ |
| POST /api/v1/auth/register (invalid) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/json" -d '{"email":"invalid"}' https://api.lanonasis.com/api/v1/auth-register` | 400 + error (NOT 502) | ⬜ |

### 4. Auth Refresh

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| POST /api/v1/auth/refresh (no cookie) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST https://api.lanonasis.com/api/v1/auth/refresh` | 401 (no cookie) | ⬜ |
| POST /api/v1/auth/refresh (valid cookie) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Cookie: session=valid-session" https://api.lanonasis.com/api/v1/auth/refresh` | 200 + new token | ⬜ |

### 5. OAuth Authorize

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /oauth/authorize (minimal) | `curl -skI --resolve api.lanonasis.com:443:$VPS_IP "https://api.lanonasis.com/oauth/authorize?client_id=test&response_type=code&state=abc"` | 302 + Location header | ⬜ |
| GET /oauth/authorize (full) | `curl -skI --resolve api.lanonasis.com:443:$VPS_IP "https://api.lanonasis.com/oauth/authorize?client_id=test&redirect_uri=https://test.com/callback&response_type=code&state=xyz"` | 302 → redirect_uri with code + state | ⬜ |

**CRITICAL CHECK:** 
- Location header must contain redirect_uri
- Response must include `code` and `state` parameters
- MUST NOT return 502

### 6. OAuth Token Exchange

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| POST /oauth/token (no grant) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/x-www-form-urlencoded" https://api.lanonasis.com/oauth/token` | 400 + error | ⬜ |
| POST /oauth/token (invalid grant) | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=authorization_code&code=test" https://api.lanonasis.com/oauth/token` | 400 + invalid_request (NOT 502) | ⬜ |

### 7. OAuth Callback

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /oauth/callback (error) | `curl -skI --resolve api.lanonasis.com:443:$VPS_IP "https://api.lanonasis.com/oauth/callback?error=access_denied&state=abc"` | 302 or 200 | ⬜ |
| GET /oauth/callback (with code) | `curl -skI --resolve api.lanonasis.com:443:$VPS_IP "https://api.lanonasis.com/oauth/callback?code=test&state=abc"` | 302 or 200 | ⬜ |

---

## Phase E — Long-Lived MCP/SSE/WebSocket Routes (Bridge Fourth)

### 1. MCP SSE

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /mcp/sse (no auth) | `curl -skN --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/mcp/sse` | 401 or connects | ⬜ |
| GET /mcp/sse (valid key) | `curl -skN --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" https://api.lanonasis.com/mcp/sse` | 200 + event stream | ⬜ |

**CRITICAL:** Use `-N` to disable curl's buffer and allow streaming.

### 2. MCP WebSocket

| Test | Command | Expected | Status |
|------|---------|----------|--------|
| WebSocket /mcp/ws | Method 1: `npx -y wscat -c wss://api.lanonasis.com/mcp/ws -H "X-API-Key: test"` | 101 + WS | ⬜ |
| WebSocket /mcp/ws (DNS override) | Method 2: Add to `/etc/hosts`: `168.231.74.29 api.lanonasis.com` then `npx -y wscat -c wss://api.lanonasis.com/mcp/ws` | 101 + WS | ⬜ |

**DNS Override Method (alternative to --resolve for WebSocket):**
```bash
# Add to /etc/hosts (requires sudo)
echo "168.231.74.29 api.lanonasis.com" | sudo tee -a /etc/hosts

# Test WebSocket connection
npx -y wscat -c wss://api.lanonasis.com/mcp/ws -H "X-API-Key: test"

# Remove after test
sudo sed -i '/api.lanonasis.com/d' /etc/hosts
```

### 3. MCP HTTP

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| GET /mcp/tools | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" https://api.lanonasis.com/mcp/tools` | 200 + tools list | ⬜ |
| POST /mcp/message | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "X-API-Key: test" -d '{"jsonrpc":"2.0","method":"test","params":{},"id":1}' https://api.lanonasis.com/mcp/message` | 200 + JSON-RPC response | ⬜ |

---

## CORS Behavior Tests (All Phases)

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| Allowed origin | `curl -skI --resolve api.lanonasis.com:443:$VPS_IP -H "Origin: https://dashboard.lanonasis.com" https://api.lanonasis.com/api/v1/health` | `Access-Control-Allow-Origin: https://dashboard.lanonasis.com` | ⬜ |
| Disallowed origin | `curl -skI --resolve api.lanonasis.com:443:$VPS_IP -H "Origin: https://evil.com" https://api.lanonasis.com/api/v1/health` | No ACAO header | ⬜ |
| Preflight | `curl -skI --resolve api.lanonasis.com:443:$VPS_IP -X OPTIONS -H "Origin: https://dashboard.lanonasis.com" -H "Access-Control-Request-Method: GET" https://api.lanonasis.com/api/v1/health` | 204 + ACAO | ⬜ |

---

## Error Behavior Tests

| Test | Command (VPS) | Expected | Status |
|------|---------------------|----------|--------|
| 400 Bad Request | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST -H "Content-Type: application/json" -d '{}' https://api.lanonasis.com/api/v1/auth/login` | 400 + error JSON | ⬜ |
| 401 Unauthorized | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/api/v1/memories` | 401 + error JSON | ⬜ |
| 404 Not Found | `curl -sk --resolve api.lanonasis.com:443:$VPS_IP https://api.lanonasis.com/api/v1/not-exist` | 404 + error JSON | ⬜ |

---

## Pass/Fail Summary

| Phase | Routes | Pass | Fail | Pending |
|-------|--------|------|------|---------|
| **B** Static/Health | 4 | 0 | 0 | 4 |
| **C** Auth-Adjacent RO | 12 | 0 | 0 | 12 |
| **D** Auth/Session | 10 | 0 | 0 | 10 |
| **E** MCP Long-Lived | 5 | 0 | 0 | 5 |
| **CORS** | 3 | 0 | 0 | 3 |
| **Errors** | 3 | 0 | 0 | 3 |
| **TOTAL** | **37** | **0** | **0** | **37** |

---

## Test Execution Script

```bash
#!/bin/bash
# api-migration-parity-test.sh
# Run from VPS or any machine with network access

VPS_IP="168.231.74.29"
API="https://api.lanonasis.com"

echo "=== Phase B: Static/Health/Info ==="
curl -sk --resolve api.lanonasis.com:443:$VPS_IP $API/health | jq '.'
curl -sk --resolve api.lanonasis.com:443:$VPS_IP $API/info | jq '.'
curl -sk --resolve api.lanonasis.com:443:$VPS_IP $API/api/v1/health | jq '.'

echo "=== Phase C: Auth-Adjacent Read-Only ==="
curl -sk --resolve api.lanonasis.com:443:$VPS_IP $API/api/v1/auth/status | jq '.'
curl -sk --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" $API/api/v1/config | jq '.'

echo "=== Phase D: Auth Login (Invalid) ==="
curl -sk --resolve api.lanonasis.com:443:$VPS_IP -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid@test.com","password":"wrong"}' \
  $API/api/v1/auth/login | jq '.'

echo "=== Phase D: OAuth Authorize ==="
curl -skI --resolve api.lanonasis.com:443:$VPS_IP \
  "$API/oauth/authorize?client_id=test&redirect_uri=https://test.com&response_type=code&state=abc" | \
  grep -i location

echo "=== Phase E: MCP SSE ==="
curl -skN --resolve api.lanonasis.com:443:$VPS_IP -H "X-API-Key: test" \
  $API/mcp/sse -o /dev/null -w "%{http_code}\n"

echo "=== CORS ==="
curl -skI --resolve api.lanonasis.com:443:$VPS_IP \
  -H "Origin: https://dashboard.lanonasis.com" \
  $API/api/v1/health | grep -i "access-control"

echo "=== Complete ==="
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 2.0 |
| Created | 2026-05-11 |
| Last Updated | 2026-05-11 02:30 UTC |
| Owner | Infrastructure Team |
| Review Frequency | Before each bridge phase |

---

*This document is a living artifact. Add new tests as routes are discovered.*