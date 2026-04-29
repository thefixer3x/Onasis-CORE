# Deployment Matrix — Auth Gateway

**Last verified:** 2026-04-29

The auth-gateway runs in two places. Same code, same datastores, two entry paths. Don't fork branches per deployment — the only real divergence is one npm script.

---

## At a glance

| Concern | VPS (PM2) | Render |
|---------|-----------|--------|
| **Host** | `vps` (Hostinger) | `srv-d5n60uemcj7s73cg2uog` (onasis-core.onrender.com) |
| **Process manager** | PM2 (`auth-gateway`, fork mode) | Render runtime |
| **Auto-deploy** | None — manual `pm2 reload` | On `main` push (autoDeploy=yes) |
| **Build** | `bun install && bun run build` | `bun install && bun run build` |
| **Start command** | `npm start` → `dotenvx run --strict --ops-off -f .env.production -- node start.js` | `bun run start:plain` → `node start.js` |
| **Env source** | Encrypted `.env.production` on disk, decrypted at runtime by dotenvx | Render dashboard env vars injected as `process.env` |
| **Postgres** | Neon (same `DATABASE_URL`) | Neon (same `DATABASE_URL`) |
| **Redis** | Redis Cloud `redis-11092.c323.us-east-1-2.ec2.cloud.redislabs.com:11092` (DB: `onasis-core`) | Same Redis Cloud instance |
| **Health** | `http://localhost:4000/health` | `https://onasis-core.onrender.com/health` |
| **Logs** | `pm2 logs auth-gateway` | `render logs --resources srv-d5n60uemcj7s73cg2uog` |
| **Build output** | `dist/src/index.js` | `dist/src/index.js` |

---

## Why two deployments

- **VPS** is the canonical primary. Always-on, controlled by us, holds the encrypted `.env.production` source of truth, runs cron-adjacent things easily.
- **Render** is the redundancy / failover surface plus the public ingress for environments that can't egress to the VPS (Vercel previews, etc.). Cold-start tolerable for that role.

Both write to the same Postgres + Redis, so user-visible state is identical regardless of which instance handles a request.

---

## Why `start:plain` exists

`npm start` invokes `dotenvx` to decrypt `.env.production` at runtime. That works on the VPS because the encrypted file is on disk and the decryption key is in `.env.keys`. On Render, neither file exists — env vars come from the dashboard, already decrypted. `dotenvx --strict` exits non-zero when its env file is missing.

`start:plain` is `node start.js` directly — no dotenvx wrapper. `start.js` then loads a plain `.env` if present (no-op on Render, populated on VPS dev), and falls through to `process.env` for everything else. Same code path on both hosts after that point.

```jsonc
// package.json scripts
"start": "dotenvx run --strict --ops-off -f .env.production -- node start.js",   // VPS
"start:plain": "node start.js"                                                   // Render
```

---

## Adding env vars

1. **VPS:** edit `.env.production` (encrypted), commit if structural, restart with `pm2 reload auth-gateway`.
2. **Render:** add via dashboard → Environment, or via API:
   ```bash
   curl -X PUT "https://api.render.com/v1/services/srv-d5n60uemcj7s73cg2uog/env-vars/<KEY>" \
     -H "Authorization: Bearer $RENDER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"value":"<value>"}'
   ```
   Render auto-redeploys on env change.

**Both must be updated together** for any new var. There's no automation; this is a known gap.

---

## Failure modes

| Symptom | Likely cause |
|---------|--------------|
| Render: `MISSING_ENV_FILE (.env.production)` | Render start command got reset to `bun start`. Reset to `bun run start:plain`. |
| Render: `getaddrinfo ENOTFOUND redis-*.redislabs.com` | Redis Cloud instance was deleted/rotated. Update `REDIS_URL`/`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` in Render env. |
| Render: HTTP health check timeout on cold start | Free tier cold-start (~30s). Bump to paid plan if cold starts are unacceptable, or warm via cron ping. |
| VPS: `dotenvx` decrypt error | `.env.keys` missing or `DOTENV_PRIVATE_KEY_PRODUCTION` not exported in PM2 env. |
| VPS: `auth-gateway` restarts loop | Check `pm2 logs auth-gateway --lines 100`. Usually Postgres TLS or Neon endpoint changes. |

---

## Operational commands

### Render via CLI

```bash
# Workspace once: render workspace set  (interactive)
render services --output text                                  # list services
render services update srv-d5n60uemcj7s73cg2uog --confirm ...  # ⚠️ CLI v2.15.1 silently drops --start-command, use REST API
render deploys list srv-d5n60uemcj7s73cg2uog --output text     # deploys
render deploys create srv-d5n60uemcj7s73cg2uog --confirm       # trigger deploy
render logs --resources srv-d5n60uemcj7s73cg2uog --limit 50    # tail logs
```

### Render via REST (when CLI is buggy)

```bash
# Update a single env var
curl -X PUT "https://api.render.com/v1/services/$SVC/env-vars/$KEY" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"<new>"}'

# Update build/start command
curl -X PATCH "https://api.render.com/v1/services/$SVC" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '{"serviceDetails":{"envSpecificDetails":{"startCommand":"bun run start:plain"}}}'
```

### VPS

```bash
ssh vps
pm2 list                                                   # status of all PM2 apps
pm2 logs auth-gateway --lines 100                          # tail logs
pm2 reload auth-gateway                                    # zero-downtime restart
pm2 describe auth-gateway                                  # full config
cd /opt/lanonasis/onasis-core/services/auth-gateway
git pull && bun install && bun run build && pm2 reload auth-gateway   # full update
```

---

## Known follow-ups

- 39 more orphan `.js` files in `src/` from the partial TypeScript migration (one was deleted in 2026-04-29's commit). Run `find src -type f -name "*.js" -execdir test -f {.}.ts \; -print` to enumerate, then delete in bulk after a clean build verifies dist parity.
- Render free tier cold-starts the service after 15 min of inactivity. Health check timeouts during cold start are expected, not a bug. Either bump plan or set up a cron warmer.
- Env var sync between VPS `.env.production` and Render dashboard is currently manual. Worth a tiny script that diffs the two and flags drift.
