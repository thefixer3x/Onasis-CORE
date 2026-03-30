#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-mxtsdgkwzjzlttpotole}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FUNCTIONS=(
  memory-create
  memory-get
  memory-update
  memory-delete
  memory-list
  memory-search
  memory-stats
  memory-bulk-delete
)

if [[ "${INCLUDE_BEHAVIOR_FUNCTIONS:-1}" != "0" ]]; then
  FUNCTIONS+=(
    intelligence-behavior-record
    intelligence-behavior-recall
    intelligence-behavior-suggest
  )
fi

cd "${APP_DIR}"

for fn in "${FUNCTIONS[@]}"; do
  echo "=== Deploying ${fn} to ${PROJECT_REF} ==="
  supabase functions deploy "${fn}" \
    --project-ref "${PROJECT_REF}" \
    --use-api \
    --no-verify-jwt
  echo
done

echo "Memory Edge suite deployed with custom API-key auth enabled."

if [[ -n "${AUTH_TOKEN:-}" ]]; then
  echo
  echo "Running post-deploy behavior release smoke..."
  "${APP_DIR}/scripts/test/behavior-release-smoke.sh"
else
  echo
  echo "Next step:"
  echo "  AUTH_TOKEN=<bearer-token> ${APP_DIR}/scripts/test/behavior-release-smoke.sh"
fi
