#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-${BEHAVIOR_DATABASE_URL:-}}"
AUTH_GATEWAY_BASE_URL="${AUTH_GATEWAY_BASE_URL:-https://auth.lanonasis.com}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-mxtsdgkwzjzlttpotole}"
VOYAGE_CUTOVER_DATE="${VOYAGE_CUTOVER_DATE:-2026-03-30T00:00:00Z}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
DATABASE_TARGET="$(printf '%s' "${DATABASE_URL}" | sed -E 's#^[^:]+://([^@]+@)?([^/?]+).*#\2#')"

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL or BEHAVIOR_DATABASE_URL is required"
  exit 1
fi

for cmd in psql jq curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required"
    exit 1
  fi
done

echo "== Memory Context Drift Audit =="
echo "AUTH_GATEWAY_BASE_URL=$AUTH_GATEWAY_BASE_URL"
echo "SUPABASE_PROJECT_REF=$SUPABASE_PROJECT_REF"
echo "VOYAGE_CUTOVER_DATE=$VOYAGE_CUTOVER_DATE"
echo "DATABASE_TARGET=$DATABASE_TARGET"

if [[ "$DATABASE_TARGET" == 127.0.0.1:* || "$DATABASE_TARGET" == localhost:* ]]; then
  echo "WARN: DATABASE_URL points at a local instance. Override DATABASE_URL or BEHAVIOR_DATABASE_URL for live audits."
fi

echo
echo "[1/4] Schema and migration ledger"
SCHEMA_JSON="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "
with behavior_columns as (
  select column_name
  from information_schema.columns
  where table_schema = 'security_service'
    and table_name = 'behavior_patterns'
    and column_name in ('trigger_embedding', 'voyage_trigger_embedding')
),
api_key_columns as (
  select column_name
  from information_schema.columns
  where table_schema = 'security_service'
    and table_name = 'api_keys'
    and column_name in ('permissions', 'key_context', 'scopes')
),
migration_row as (
  select count(*)::int as matches
  from supabase_migrations.schema_migrations
  where version = '20260212_001_behavior_patterns'
)
select json_build_object(
  'behavior_pattern_columns', (select coalesce(json_agg(column_name order by column_name), '[]'::json) from behavior_columns),
  'api_key_columns', (select coalesce(json_agg(column_name order by column_name), '[]'::json) from api_key_columns),
  'behavior_migration_recorded', (select matches > 0 from migration_row)
);")"
echo "$SCHEMA_JSON" | jq .

echo "$SCHEMA_JSON" | jq -e '
  (.behavior_pattern_columns | index("trigger_embedding")) != null and
  (.behavior_pattern_columns | index("voyage_trigger_embedding")) != null
' >/dev/null || {
  echo "FAIL: security_service.behavior_patterns is missing one or both embedding columns"
  exit 1
}

echo "$SCHEMA_JSON" | jq -e '(.api_key_columns | index("permissions")) != null' >/dev/null || {
  echo "FAIL: security_service.api_keys is missing the permissions column"
  exit 1
}

echo "$SCHEMA_JSON" | jq -e '(.api_key_columns | index("key_context")) != null' >/dev/null || {
  echo "FAIL: security_service.api_keys is missing the key_context column"
  exit 1
}

if echo "$SCHEMA_JSON" | jq -e '(.api_key_columns | index("scopes")) != null' >/dev/null; then
  echo "FAIL: security_service.api_keys unexpectedly has a scopes column"
  exit 1
fi

echo
echo "[2/4] Behavior embedding placement"
EMBEDDING_JSON="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "
select json_build_object(
  'total_rows', count(*),
  'legacy_only', count(*) filter (where trigger_embedding is not null and voyage_trigger_embedding is null),
  'voyage_only', count(*) filter (where trigger_embedding is null and voyage_trigger_embedding is not null),
  'dual_embeddings', count(*) filter (where trigger_embedding is not null and voyage_trigger_embedding is not null),
  'missing_embeddings', count(*) filter (where trigger_embedding is null and voyage_trigger_embedding is null),
  'post_cutover_legacy_only', count(*) filter (
    where created_at >= '${VOYAGE_CUTOVER_DATE}'::timestamptz
      and trigger_embedding is not null
      and voyage_trigger_embedding is null
  ),
  'latest_created_at', max(created_at)
)
from security_service.behavior_patterns;")"
echo "$EMBEDDING_JSON" | jq .

POST_CUTOVER_LEGACY_ONLY="$(echo "$EMBEDDING_JSON" | jq -r '.post_cutover_legacy_only')"
if [[ "$POST_CUTOVER_LEGACY_ONLY" != "0" ]]; then
  echo "FAIL: found $POST_CUTOVER_LEGACY_ONLY post-cutover rows writing only to trigger_embedding"
  exit 1
fi

echo
echo "[3/4] Auth-gateway route smoke"
if [[ -n "$AUTH_TOKEN" ]]; then
  STATUS="$(curl -sS -o /tmp/memory-context-auth-route.json -w "%{http_code}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    "${AUTH_GATEWAY_BASE_URL%/}/api/v1/auth/api-keys")"
  if [[ "$STATUS" != "200" ]]; then
    echo "FAIL: auth-gateway api-keys route returned $STATUS"
    cat /tmp/memory-context-auth-route.json
    exit 1
  fi
  jq -e '.success == true and (.data | type) == "array"' /tmp/memory-context-auth-route.json >/dev/null || {
    echo "FAIL: auth-gateway api-keys route returned an unexpected envelope"
    cat /tmp/memory-context-auth-route.json
    exit 1
  }
  echo "PASS: auth-gateway route returned the expected envelope"
else
  echo "SKIP: AUTH_TOKEN not set, route smoke not executed"
fi

echo
echo "[4/4] Watch list"
echo "Monitor these invariants:"
echo "- New behavior rows after $VOYAGE_CUTOVER_DATE must not be legacy_only."
echo "- security_service.api_keys should keep permissions, expose key_context, and avoid a new scopes column."
echo "- If behavior_migration_recorded=false but schema is present, reconcile the migration ledger."

if ! echo "$SCHEMA_JSON" | jq -e '.behavior_migration_recorded == true' >/dev/null; then
  echo
  echo "WARN: behavior migration ledger is not reconciled with live schema"
fi

echo
echo "Memory context drift audit passed."
