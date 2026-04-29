#!/usr/bin/env bash

set -euo pipefail

SERVICE_ROOT="${AUTH_GATEWAY_ROOT:-/opt/lanonasis/onasis-core/services/auth-gateway}"
PM2_APP_NAME="${PM2_APP_NAME:-auth-gateway}"
HEALTHCHECK_URL="${AUTH_GATEWAY_HEALTHCHECK_URL:-http://localhost:4000/health}"

if [[ ! -d "$SERVICE_ROOT" ]]; then
  echo "Auth gateway service root not found: $SERVICE_ROOT" >&2
  exit 1
fi

cd "$SERVICE_ROOT"

if [[ -n "$(git status --short 2>/dev/null)" ]]; then
  echo "Refusing deploy from a dirty worktree at $SERVICE_ROOT" >&2
  git status --short
  exit 1
fi

if [[ ! -f ".env.keys" ]]; then
  echo "Missing dotenvx key file: $SERVICE_ROOT/.env.keys" >&2
  exit 1
fi

echo "Installing auth-gateway dependencies..."
bun install --frozen-lockfile

echo "Building auth-gateway..."
bun run build

echo "Loading dotenvx production key into the PM2 environment..."
set -a
source ".env.keys"
set +a

if [[ -z "${DOTENV_PRIVATE_KEY_PRODUCTION:-}" ]]; then
  echo "DOTENV_PRIVATE_KEY_PRODUCTION was not loaded from .env.keys" >&2
  exit 1
fi

echo "Reloading PM2 app: $PM2_APP_NAME"
pm2 reload "$PM2_APP_NAME" --update-env

echo "Verifying local health endpoint: $HEALTHCHECK_URL"
curl -fsS "$HEALTHCHECK_URL" >/tmp/auth-gateway-health.json
echo "Auth gateway reload complete."
