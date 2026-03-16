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
