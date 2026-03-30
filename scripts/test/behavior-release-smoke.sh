#!/usr/bin/env bash
set -euo pipefail

AUTH_GATEWAY_BASE_URL="${AUTH_GATEWAY_BASE_URL:-https://auth.lanonasis.com}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-mxtsdgkwzjzlttpotole}"
FUNCTIONS_BASE_URL="${FUNCTIONS_BASE_URL:-https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
DATABASE_URL="${DATABASE_URL:-${BEHAVIOR_DATABASE_URL:-}}"
EXPECT_EMBEDDING_PROVIDER="${EXPECT_EMBEDDING_PROVIDER:-voyage}"
KEY_SCOPES="${KEY_SCOPES:-memories:read,memories:write}"
CLEANUP_PATTERN="${CLEANUP_PATTERN:-auto}"

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "AUTH_TOKEN is required"
  exit 1
fi

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required"
    exit 1
  fi
done

CAN_VERIFY_DB=0
if [[ -n "$DATABASE_URL" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "DATABASE_URL is set but psql is not available"
    exit 1
  fi
  CAN_VERIFY_DB=1
fi

TMP_DIR="$(mktemp -d)"
RUN_ID="$(date +%s)"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TEMP_KEY_ID=""
PATTERN_ID=""
KEEP_PATTERN=0

cleanup() {
  if [[ -n "$TEMP_KEY_ID" ]]; then
    curl -sS -X DELETE \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      "${AUTH_GATEWAY_BASE_URL%/}/api/v1/auth/api-keys/${TEMP_KEY_ID}" >/dev/null || true
  fi

  if [[ -n "$PATTERN_ID" && "$CAN_VERIFY_DB" -eq 1 && "$KEEP_PATTERN" -eq 0 ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
      "delete from security_service.behavior_patterns where id = '${PATTERN_ID}'::uuid;" >/dev/null || true
  fi

  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

request_json() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local body_file="$4"
  local status_file="$5"
  local status

  if [[ -n "$body" ]]; then
    status="$(curl -sS -o "$body_file" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body")"
  else
    status="$(curl -sS -o "$body_file" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $AUTH_TOKEN")"
  fi

  echo "$status" >"$status_file"
}

assert_status() {
  local expected="$1"
  local status_file="$2"
  local body_file="$3"
  local actual
  actual="$(cat "$status_file")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Unexpected status: expected $expected, got $actual"
    cat "$body_file"
    exit 1
  fi
}

parse_scopes_json() {
  jq -nc --arg scopes "$KEY_SCOPES" \
    '$scopes | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))'
}

echo "== Behavior Release Smoke =="
echo "AUTH_GATEWAY_BASE_URL=$AUTH_GATEWAY_BASE_URL"
echo "FUNCTIONS_BASE_URL=$FUNCTIONS_BASE_URL"
echo "EXPECT_EMBEDDING_PROVIDER=$EXPECT_EMBEDDING_PROVIDER"

echo
echo "[1/4] Create temporary platform API key"
CREATE_KEY_PAYLOAD="$(jq -nc \
  --arg name "behavior-release-smoke-$RUN_ID" \
  --arg access_level "authenticated" \
  --argjson scopes "$(parse_scopes_json)" \
  '{
    name: $name,
    access_level: $access_level,
    expires_in_days: 1,
    scopes: $scopes
  }')"
request_json "POST" "${AUTH_GATEWAY_BASE_URL%/}/api/v1/auth/api-keys" \
  "$CREATE_KEY_PAYLOAD" "$TMP_DIR/create-key.json" "$TMP_DIR/create-key.status"
assert_status "201" "$TMP_DIR/create-key.status" "$TMP_DIR/create-key.json"

TEMP_KEY_ID="$(jq -r '.data.id // empty' "$TMP_DIR/create-key.json")"
TEMP_KEY_VALUE="$(jq -r '.data.key // empty' "$TMP_DIR/create-key.json")"
if [[ -z "$TEMP_KEY_ID" || -z "$TEMP_KEY_VALUE" ]]; then
  echo "Create key response missing id or key"
  cat "$TMP_DIR/create-key.json"
  exit 1
fi
echo "PASS: created platform key $TEMP_KEY_ID"

echo
echo "[2/4] Verify auth-gateway envelope and key retrieval"
request_json "GET" "${AUTH_GATEWAY_BASE_URL%/}/api/v1/auth/api-keys" "" \
  "$TMP_DIR/list-keys.json" "$TMP_DIR/list-keys.status"
assert_status "200" "$TMP_DIR/list-keys.status" "$TMP_DIR/list-keys.json"
jq -e --arg id "$TEMP_KEY_ID" '.success == true and ((.data // []) | any(.id == $id))' \
  "$TMP_DIR/list-keys.json" >/dev/null || {
  echo "List keys response did not include the temporary key"
  cat "$TMP_DIR/list-keys.json"
  exit 1
}

request_json "GET" "${AUTH_GATEWAY_BASE_URL%/}/api/v1/auth/api-keys/${TEMP_KEY_ID}" "" \
  "$TMP_DIR/get-key.json" "$TMP_DIR/get-key.status"
assert_status "200" "$TMP_DIR/get-key.status" "$TMP_DIR/get-key.json"
jq -e --arg id "$TEMP_KEY_ID" '.success == true and .data.id == $id' \
  "$TMP_DIR/get-key.json" >/dev/null || {
  echo "Get key response did not return the created key"
  cat "$TMP_DIR/get-key.json"
  exit 1
}
echo "PASS: auth-gateway returned the expected platform key envelope"

echo
echo "[3/4] Record and recall a behavior pattern"
RECORD_PAYLOAD="$(jq -nc \
  --arg trigger "Behavior release smoke run $RUN_ID validates platform keys and voyage embeddings" \
  --arg ts "$TIMESTAMP" \
  '{
    trigger: $trigger,
    context: {
      directory: "/ops/behavior-release-smoke",
      project_type: "operations",
      branch: "release/guardrails"
    },
    actions: [
      {
        tool: "behavior_release_smoke",
        parameters: {
          run_id: "'"$RUN_ID"'",
          verification: "post-deploy"
        },
        outcome: "success",
        timestamp: $ts,
        duration_ms: 1
      }
    ],
    final_outcome: "success",
    confidence: 0.95
  }')"
request_json "POST" "${FUNCTIONS_BASE_URL%/}/intelligence-behavior-record" \
  "$RECORD_PAYLOAD" "$TMP_DIR/behavior-record.json" "$TMP_DIR/behavior-record.status"
assert_status "200" "$TMP_DIR/behavior-record.status" "$TMP_DIR/behavior-record.json"

PATTERN_ID="$(jq -r '.data.pattern_id // empty' "$TMP_DIR/behavior-record.json")"
EMBEDDING_PROVIDER="$(jq -r '.data.embedding_provider // empty' "$TMP_DIR/behavior-record.json")"
if [[ -z "$PATTERN_ID" ]]; then
  echo "Behavior record response missing pattern_id"
  cat "$TMP_DIR/behavior-record.json"
  exit 1
fi
if [[ -n "$EXPECT_EMBEDDING_PROVIDER" && "$EMBEDDING_PROVIDER" != "$EXPECT_EMBEDDING_PROVIDER" ]]; then
  echo "Unexpected embedding provider: expected $EXPECT_EMBEDDING_PROVIDER, got $EMBEDDING_PROVIDER"
  cat "$TMP_DIR/behavior-record.json"
  exit 1
fi

RECALL_PAYLOAD="$(jq -nc \
  --arg task "Behavior release smoke run $RUN_ID validates platform keys and voyage embeddings" \
  '{
    context: {
      current_directory: "/ops/behavior-release-smoke",
      current_task: $task,
      project_type: "operations"
    },
    limit: 3,
    similarity_threshold: 0.5
  }')"
request_json "POST" "${FUNCTIONS_BASE_URL%/}/intelligence-behavior-recall" \
  "$RECALL_PAYLOAD" "$TMP_DIR/behavior-recall.json" "$TMP_DIR/behavior-recall.status"
assert_status "200" "$TMP_DIR/behavior-recall.status" "$TMP_DIR/behavior-recall.json"
jq -e --arg id "$PATTERN_ID" '.success == true and ((.data.patterns // []) | any(.id == $id))' \
  "$TMP_DIR/behavior-recall.json" >/dev/null || {
  echo "Behavior recall did not return the recorded pattern"
  cat "$TMP_DIR/behavior-recall.json"
  exit 1
}
echo "PASS: behavior record/recall round-trip succeeded for pattern $PATTERN_ID"

echo
echo "[4/4] Verify embedding column placement"
if [[ "$CAN_VERIFY_DB" -eq 0 ]]; then
  KEEP_PATTERN=1
  echo "SKIP: DATABASE_URL not set, leaving pattern $PATTERN_ID in place for manual inspection"
else
  DB_CHECK_JSON="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c \
    "select json_build_object(
      'id', id,
      'legacy_present', trigger_embedding is not null,
      'voyage_present', voyage_trigger_embedding is not null
    )
    from security_service.behavior_patterns
    where id = '${PATTERN_ID}'::uuid;")"

  if [[ -z "$DB_CHECK_JSON" ]]; then
    echo "Database verification could not find pattern $PATTERN_ID"
    exit 1
  fi

  echo "$DB_CHECK_JSON" | jq .

  if [[ "$EXPECT_EMBEDDING_PROVIDER" == "voyage" ]]; then
    echo "$DB_CHECK_JSON" | jq -e '.voyage_present == true and .legacy_present == false' >/dev/null || {
      echo "Voyage mode wrote to the wrong embedding columns"
      exit 1
    }
  fi

  if [[ "$CLEANUP_PATTERN" == "0" || "$CLEANUP_PATTERN" == "false" ]]; then
    KEEP_PATTERN=1
    echo "Leaving pattern $PATTERN_ID in place because CLEANUP_PATTERN=$CLEANUP_PATTERN"
  else
    echo "PASS: embedding column placement matches provider expectations"
  fi
fi

echo
echo "Behavior release smoke passed."
