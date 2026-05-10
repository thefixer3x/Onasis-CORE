# CLAUDE.md — Auth Gateway

Guidance for AI agents working in `apps/onasis-core/services/auth-gateway/`.

---

## Code Structure — CRITICAL

**The live code is in `src/`. Top-level files are legacy/dead.**

| Path | Status |
|------|--------|
| `src/` | ✅ LIVE — loaded by `start.js` via `src/index.ts` |
| `src/middleware/` | ✅ LIVE |
| `src/routes/` | ✅ LIVE |
| `src/controllers/` | ✅ LIVE |
| `src/services/` | ✅ LIVE |
| `controllers/` (top-level) | ❌ LEGACY — not imported by anything active |
| `routes/` (top-level) | ❌ LEGACY |
| `middleware/` (top-level) | ❌ LEGACY |
| `services/` (top-level) | ❌ LEGACY |
| `index.ts` (top-level) | ❌ LEGACY — `start.js` loads `src/index.ts` |

Always read `src/` files. Editing top-level equivalents has no effect on the running service.

---

## Databases

| Purpose | Supabase Project |
|---------|-----------------|
| Auth-gateway primary | `ptnrwrgzrsbocgxlpvhd.supabase.co` |
| Platform main DB | `mxtsdgkwzjzlttpotole.supabase.co` |
| Neon | Replica/backup only (migrated away 2024-12-29) |

**Never assume Neon is primary.** It is read-only backup.

---

## Redis / Cache

Redis is **optional**. The service must not hard-fail when Redis is unavailable.

Pattern in `src/services/cache.service.ts`:
```ts
const client = getRedisClient()
if (!client) return null  // graceful no-op
```

- VPS: Postgres-based correctness layer + Redis as fallback (not required)
- Render: Redis-only (no Postgres cache layer)
- `AuthCodeCache`, `OAuthClientCache`, `TokenCache` → return null when Redis absent
- `OAuthStateCache`, `DeviceCodeCache`, `OtpStateCache` → have full Postgres fallback

---

## Deployment Topology

| Replica | URL | Host |
|---------|-----|------|
| Primary | `https://auth.lanonasis.com` | VPS (nginx :4000) |
| Secondary | `https://onasis-core.onrender.com` | Render |

`api.lanonasis.com` is **Netlify-hosted** via `apps/onasis-core/_redirects` (NOT nginx, NOT VPS).
Netlify `_redirects` proxies `/oauth/*`, `/api/v1/auth/*`, `/auth/cli-login` → `auth.lanonasis.com`.

Render deployment **needs a `*.lanonasis.com` subdomain** (e.g. `auth-render.lanonasis.com`) for cookies to work. Do NOT redesign cookie domains — fix is to add the subdomain DNS record.

---

## Authentication Flow

Session cookies use `domain: process.env.COOKIE_DOMAIN || '.lanonasis.com'`.

`validateSessionCookie` in `src/middleware/session.ts` calls `findSessionByToken()` on **every request**.
- If DB is slow/unavailable: session is silently dropped and `req.user` is left undefined
- This is the root cause of intermittent IDE login failures

---

## OAuth Code Consumption

`src/controllers/oauth.controller.ts` line ~285 calls `exchangeAuthorizationCode` from `src/services/oauth.service.ts`.

This function goes **directly to DB** with `FOR UPDATE` row locking — no Redis gate.

The top-level `services/oauth.service.ts` has a Redis-gate bug (`consumeAuthorizationCode` throws `invalid_grant` if cache returns null). **This file is not called in production.** Do not confuse them.

---

## Known Issues / Action Items

| Issue | Severity | Fix |
|-------|----------|-----|
| `AUTH_BASE_URL` not set in PM2 env on VPS | Low | Add `AUTH_BASE_URL=https://auth.lanonasis.com` to PM2 config or `.env.production` |
| `findSessionByToken` silent session drop | High | Add timeout + graceful fallback in `src/middleware/session.ts` |
| Render lacks `*.lanonasis.com` subdomain | Medium | Add DNS record (operator task, not code) |
| Skipped test `should try API key when JWT is invalid` | Low | Fix ESM mocking: use `vi.doMock` instead of `vi.mock` |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, middleware chain, route mounting |
| `src/middleware/session.ts` | Session cookie validation (DB lookup on every request) |
| `src/middleware/cors.ts` | CORS config — `oauthCors` for OAuth routes, `standardCors` global |
| `src/services/cache.service.ts` | Redis-optional cache classes |
| `src/services/oauth.service.ts` | LIVE OAuth code exchange (DB-direct) |
| `src/controllers/oauth.controller.ts` | PKCE authorize + token endpoints |
| `src/routes/oauth.routes.ts` | OAuth route definitions (has `validateTokenCSRFAsync`) |
| `src/routes/web.routes.ts` | Session login/logout, cookie set/clear |
| `test-dashboard/index.html` | Test client (defaults to `https://auth.lanonasis.com` in production env) |
| `ecosystem.config.cjs` | PM2 config (local: fork mode; live VPS: cluster mode) |
| `nginx-unified.conf` | Local nginx reference only; live VPS config differs |

---

## Verification

```bash
# Check live PM2 state
ssh vps "pm2 list"

# Check live nginx config
ssh vps "sudo nginx -T | grep server_name"

# Confirm DB connectivity from VPS
ssh vps "cd /var/www/auth-gateway && node -e \"require('./src/db/client.js').default.query('SELECT 1').then(()=>console.log('ok'))\""
```

Full reality snapshot: `.devops/context-engineering/architecture/auth-gateway-current-reality.md`
