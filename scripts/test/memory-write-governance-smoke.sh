#!/usr/bin/env bash
set -euo pipefail

# Smoke tests for memory write-governance controls:
# 1) idempotency under concurrency
# 2) write_intent=new bypass semantics
# 3) continuity append safety under concurrency
#
# Required:
#   AUTH_TOKEN=<bearer-token>
# Optional:
#   BASE_URL=https://lanonasis.supabase.co/functions/v1
#   CONCURRENCY=8

BASE_URL="${BASE_URL:-https://lanonasis.supabase.co/functions/v1}"
CONCURRENCY="${CONCURRENCY:-8}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "AUTH_TOKEN is required"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

api_post() {
  local endpoint="$1"
  local payload="$2"
  local body_out="$3"
  local status_out="$4"

  local status
  status="$(curl -sS -o "$body_out" -w "%{http_code}" \
    -X POST "$BASE_URL/$endpoint" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload")"
  echo "$status" >"$status_out"
}

api_get() {
  local endpoint="$1"
  local body_out="$2"
  local status_out="$3"
  local status
  status="$(curl -sS -o "$body_out" -w "%{http_code}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    "$BASE_URL/$endpoint")"
  echo "$status" >"$status_out"
}

extract_id() {
  jq -r '.data.id // .id // empty' "$1"
}

echo "== Memory Write Governance Smoke =="
echo "BASE_URL=$BASE_URL"
echo "CONCURRENCY=$CONCURRENCY"

RUN_ID="$(date +%s)"

echo ""
echo "[1/3] Idempotency concurrency test"
IDEMP_KEY="smoke-idem-$RUN_ID"
for i in $(seq 1 "$CONCURRENCY"); do
  payload="$(jq -nc \
    --arg title "Smoke Idempotency $RUN_ID" \
    --arg content "idempotency payload $RUN_ID request=$i" \
    --arg idem "$IDEMP_KEY" \
    '{
      title: $title,
      content: $content,
      memory_type: "context",
      tags: ["smoke","idempotency"],
      write_intent: "auto",
      idempotency_key: $idem
    }')"
  (
    api_post "memory-create" "$payload" \
      "$TMP_DIR/idem-$i.body.json" \
      "$TMP_DIR/idem-$i.status"
  ) &
done
wait

if grep -qvE '^(200|201)$' "$TMP_DIR"/idem-*.status; then
  echo "Idempotency test failed: non-2xx status found"
  paste -d' ' "$TMP_DIR"/idem-*.status
  exit 1
fi

mapfile -t IDEM_IDS < <(for f in "$TMP_DIR"/idem-*.body.json; do extract_id "$f"; done | awk 'NF' | sort -u)
if [[ "${#IDEM_IDS[@]}" -ne 1 ]]; then
  echo "Idempotency test failed: expected 1 unique id, got ${#IDEM_IDS[@]}"
  printf '%s\n' "${IDEM_IDS[@]}"
  exit 1
fi
echo "PASS: idempotency created/reused one id: ${IDEM_IDS[0]}"

echo ""
echo "[2/3] write_intent=new bypass test"
NEW_KEY="smoke-new-$RUN_ID"
for i in 1 2; do
  payload="$(jq -nc \
    --arg title "Smoke New Intent $RUN_ID" \
    --arg content "new intent payload $RUN_ID request=$i" \
    --arg idem "$NEW_KEY" \
    '{
      title: $title,
      content: $content,
      memory_type: "context",
      tags: ["smoke","write-intent-new"],
      write_intent: "new",
      idempotency_key: $idem
    }')"
  api_post "memory-create" "$payload" \
    "$TMP_DIR/new-$i.body.json" \
    "$TMP_DIR/new-$i.status"
done

if grep -qvE '^201$' "$TMP_DIR"/new-*.status; then
  echo "write_intent=new test failed: expected 201 for both requests"
  paste -d' ' "$TMP_DIR"/new-*.status
  exit 1
fi

NEW_ID_1="$(extract_id "$TMP_DIR/new-1.body.json")"
NEW_ID_2="$(extract_id "$TMP_DIR/new-2.body.json")"
if [[ -z "$NEW_ID_1" || -z "$NEW_ID_2" || "$NEW_ID_1" == "$NEW_ID_2" ]]; then
  echo "write_intent=new test failed: expected distinct ids"
  echo "id1=$NEW_ID_1 id2=$NEW_ID_2"
  exit 1
fi
echo "PASS: write_intent=new created distinct ids: $NEW_ID_1 / $NEW_ID_2"

echo ""
echo "[3/3] Continuity concurrency append test"
CONT_KEY="smoke-cont-$RUN_ID"

seed_payload="$(jq -nc \
  --arg title "Smoke Continuity $RUN_ID" \
  --arg content "BASE-$RUN_ID" \
  --arg ckey "$CONT_KEY" \
  '{
    title: $title,
    content: $content,
    memory_type: "context",
    tags: ["smoke","continuity"],
    write_intent: "continue",
    continuity_key: $ckey
  }')"
api_post "memory-create" "$seed_payload" "$TMP_DIR/cont-seed.body.json" "$TMP_DIR/cont-seed.status"
SEED_ID="$(extract_id "$TMP_DIR/cont-seed.body.json")"
if [[ -z "$SEED_ID" ]]; then
  echo "Continuity seed create failed"
  cat "$TMP_DIR/cont-seed.body.json"
  exit 1
fi

append_one="APPEND-A-$RUN_ID"
append_two="APPEND-B-$RUN_ID"

append_payload_a="$(jq -nc \
  --arg title "Smoke Continuity $RUN_ID" \
  --arg content "$append_one" \
  --arg ckey "$CONT_KEY" \
  '{
    title: $title,
    content: $content,
    memory_type: "context",
    tags: ["smoke","continuity"],
    write_intent: "continue",
    continuity_key: $ckey
  }')"
append_payload_b="$(jq -nc \
  --arg title "Smoke Continuity $RUN_ID" \
  --arg content "$append_two" \
  --arg ckey "$CONT_KEY" \
  '{
    title: $title,
    content: $content,
    memory_type: "context",
    tags: ["smoke","continuity"],
    write_intent: "continue",
    continuity_key: $ckey
  }')"

(
  api_post "memory-create" "$append_payload_a" \
    "$TMP_DIR/cont-a.body.json" \
    "$TMP_DIR/cont-a.status"
) &
(
  api_post "memory-create" "$append_payload_b" \
    "$TMP_DIR/cont-b.body.json" \
    "$TMP_DIR/cont-b.status"
) &
wait

# If one side got a conflict, retry once to simulate client retry semantics.
for side in a b; do
  status="$(cat "$TMP_DIR/cont-$side.status")"
  if [[ "$status" == "409" ]]; then
    payload_var="append_payload_$side"
    api_post "memory-create" "${!payload_var}" \
      "$TMP_DIR/cont-$side.retry.body.json" \
      "$TMP_DIR/cont-$side.retry.status"
    retry_status="$(cat "$TMP_DIR/cont-$side.retry.status")"
    if [[ "$retry_status" != "200" && "$retry_status" != "201" ]]; then
      echo "Continuity retry failed for side $side"
      cat "$TMP_DIR/cont-$side.retry.body.json"
      exit 1
    fi
  elif [[ "$status" != "200" && "$status" != "201" ]]; then
    echo "Continuity append failed for side $side with status $status"
    cat "$TMP_DIR/cont-$side.body.json"
    exit 1
  fi
done

api_get "memory-get?id=$SEED_ID" "$TMP_DIR/cont-get.body.json" "$TMP_DIR/cont-get.status"
if [[ "$(cat "$TMP_DIR/cont-get.status")" != "200" ]]; then
  echo "Continuity fetch failed"
  cat "$TMP_DIR/cont-get.body.json"
  exit 1
fi

final_content="$(jq -r '.data.content // .content // ""' "$TMP_DIR/cont-get.body.json")"
if [[ "$final_content" != *"$append_one"* || "$final_content" != *"$append_two"* ]]; then
  echo "Continuity test failed: missing appended content"
  echo "Expected markers: $append_one and $append_two"
  echo "Final content:"
  echo "$final_content"
  exit 1
fi
echo "PASS: continuity merge preserved both append payloads"

echo ""
echo "All smoke checks passed."
