#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${LANONASIS_API_KEY:-}" ]]; then
  echo "LANONASIS_API_KEY is required" >&2
  exit 1
fi

PROJECT_SCOPE_HEADER=()
if [[ -n "${LANONASIS_PROJECT_SCOPE:-}" ]]; then
  PROJECT_SCOPE_HEADER=(-H "X-Project-Scope: ${LANONASIS_PROJECT_SCOPE}")
fi

function check() {
  local label="$1"
  shift
  echo "=== ${label} ==="
  local body
  body="$(curl -s "$@")"
  local status
  status="$(curl -s -o /dev/null -w '%{http_code}' "$@")"
  printf '%s\n' "${body}" | head -c 400
  printf '\n--- STATUS: %s\n\n' "${status}"
}

check "Supabase memory-stats" \
  "https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-stats" \
  -H "X-API-Key: ${LANONASIS_API_KEY}"

check "Supabase memory-list" \
  "https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-list?limit=1" \
  -H "X-API-Key: ${LANONASIS_API_KEY}"

check "Supabase memory-search" \
  -X POST "https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/memory-search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${LANONASIS_API_KEY}" \
  "${PROJECT_SCOPE_HEADER[@]}" \
  -d '{"query":"auth","limit":1}'

check "API memory-stats" \
  "https://api.lanonasis.com/api/v1/memory/stats" \
  -H "X-API-Key: ${LANONASIS_API_KEY}"

check "API memory-list" \
  "https://api.lanonasis.com/api/v1/memory/list?limit=1" \
  -H "X-API-Key: ${LANONASIS_API_KEY}"

check "API memory-search" \
  -X POST "https://api.lanonasis.com/api/v1/memory/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${LANONASIS_API_KEY}" \
  "${PROJECT_SCOPE_HEADER[@]}" \
  -d '{"query":"auth","limit":1}'
