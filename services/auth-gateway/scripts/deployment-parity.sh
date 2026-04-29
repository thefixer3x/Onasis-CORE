#!/bin/bash
#
# Auth-Gateway Deployment Parity Test
#
# Probes both the VPS deployment (via auth.lanonasis.com → 168.231.74.29 → PM2)
# and the Render deployment (onasis-core.onrender.com) with the same set of
# requests and shows side-by-side results.
#
# Goal: confirm Render is a functional duplicate of VPS — same routes, same
# auth behavior, same response shapes. Any divergence flags a real config or
# code drift between the two deployments.
#
# Usage:
#   bash scripts/deployment-parity.sh
#   VERBOSE=1 bash scripts/deployment-parity.sh   # show full bodies
#
# Exit code: 0 = parity, 1 = divergence detected.
#

set -uo pipefail

VPS_URL="${VPS_URL:-https://auth.lanonasis.com}"
RENDER_URL="${RENDER_URL:-https://onasis-core.onrender.com}"
VERBOSE="${VERBOSE:-0}"
PARITY_RUN_ID="${PARITY_RUN_ID:-$(date +%s)-$$}"
TOKEN_PROBE_PATH="/oauth/token?client_id=parity-${PARITY_RUN_ID}"

GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
DIM=$'\033[2m'
NC=$'\033[0m'

PASS=0
FAIL=0
DIVERGE=0
INCONCLUSIVE=0
TOTAL=0

matches_expected() {
  local code="$1" expect="$2"
  [[ "$code" =~ ^($expect)$ ]]
}

probe() {
  # probe <name> <method> <path> [<body>] [<expected_status_pattern>]
  local name="$1" method="$2" path="$3" body="${4:-}" expect="${5:-2..|4..}"
  TOTAL=$((TOTAL+1))

  local vps_args=(-s -o /tmp/parity-vps.body -w '%{http_code}|%{time_total}' --max-time 10 -X "$method")
  local rndr_args=(-s -o /tmp/parity-rndr.body -w '%{http_code}|%{time_total}' --max-time 15 -X "$method")
  if [ -n "$body" ]; then
    vps_args+=( -H 'Content-Type: application/json' -d "$body" )
    rndr_args+=( -H 'Content-Type: application/json' -d "$body" )
  fi

  local vps_out rndr_out
  vps_out=$(curl "${vps_args[@]}" "$VPS_URL$path" 2>/dev/null || echo "000|0")
  rndr_out=$(curl "${rndr_args[@]}" "$RENDER_URL$path" 2>/dev/null || echo "000|0")

  local vps_code="${vps_out%%|*}"  vps_t="${vps_out##*|}"
  local rndr_code="${rndr_out%%|*}" rndr_t="${rndr_out##*|}"

  printf "%b[%02d]%b %-40s " "$CYAN" "$TOTAL" "$NC" "$name"

  # Status parity check
  if [[ "$vps_code" == "$rndr_code" ]]; then
    if [[ "$vps_code" == "429" ]] && ! matches_expected "$vps_code" "$expect"; then
      printf "%bINCONCLUSIVE%b  RATE-LIMITED  VPS=%s  Render=%s  (%.2fs / %.2fs)\n" \
        "$YELLOW" "$NC" "$vps_code" "$rndr_code" "$vps_t" "$rndr_t"
      INCONCLUSIVE=$((INCONCLUSIVE+1))
      FAIL=$((FAIL+1))
    elif matches_expected "$vps_code" "$expect"; then
      printf "%bMATCH%b  VPS=%s  Render=%s  (%.2fs / %.2fs)\n" \
        "$GREEN" "$NC" "$vps_code" "$rndr_code" "$vps_t" "$rndr_t"
      PASS=$((PASS+1))
    else
      printf "%bINCONCLUSIVE%b  UNEXPECTED MATCH  VPS=%s  Render=%s  (%.2fs / %.2fs)\n" \
        "$YELLOW" "$NC" "$vps_code" "$rndr_code" "$vps_t" "$rndr_t"
      INCONCLUSIVE=$((INCONCLUSIVE+1))
      FAIL=$((FAIL+1))
    fi
  elif ([[ "$vps_code" == "429" ]] || [[ "$rndr_code" == "429" ]]) && ! matches_expected "429" "$expect"; then
    printf "%bINCONCLUSIVE%b  RATE-LIMIT STATE  VPS=%s  Render=%s  (%.2fs / %.2fs)\n" \
      "$YELLOW" "$NC" "$vps_code" "$rndr_code" "$vps_t" "$rndr_t"
    INCONCLUSIVE=$((INCONCLUSIVE+1))
    FAIL=$((FAIL+1))
  else
    printf "%bDIVERGE%b VPS=%s  Render=%s\n" "$RED" "$NC" "$vps_code" "$rndr_code"
    DIVERGE=$((DIVERGE+1))
    FAIL=$((FAIL+1))
  fi

  if [[ "$VERBOSE" == "1" ]]; then
    echo "${DIM}  vps:    $(head -c 200 /tmp/parity-vps.body 2>/dev/null)${NC}"
    echo "${DIM}  render: $(head -c 200 /tmp/parity-rndr.body 2>/dev/null)${NC}"
  fi
}

probe_health_shape() {
  # Compare the /health JSON keys (top-level) between deployments
  TOTAL=$((TOTAL+1))
  curl -s --max-time 10 "$VPS_URL/health"    -o /tmp/parity-vps.body    2>/dev/null
  curl -s --max-time 15 "$RENDER_URL/health" -o /tmp/parity-rndr.body 2>/dev/null

  local vps_keys rndr_keys
  vps_keys=$(python3 -c "import json;print('|'.join(sorted(json.load(open('/tmp/parity-vps.body')).keys())))" 2>/dev/null || echo "ERR")
  rndr_keys=$(python3 -c "import json;print('|'.join(sorted(json.load(open('/tmp/parity-rndr.body')).keys())))" 2>/dev/null || echo "ERR")

  printf "%b[%02d]%b %-40s " "$CYAN" "$TOTAL" "$NC" "/health JSON shape"
  if [[ "$vps_keys" == "$rndr_keys" && "$vps_keys" != "ERR" ]]; then
    printf "%bMATCH%b  keys=[%s]\n" "$GREEN" "$NC" "$vps_keys"
    PASS=$((PASS+1))
  else
    printf "%bDIVERGE%b\n  VPS    keys: %s\n  Render keys: %s\n" "$RED" "$NC" "$vps_keys" "$rndr_keys"
    DIVERGE=$((DIVERGE+1))
    FAIL=$((FAIL+1))
  fi
}

echo "=================================================================="
echo " Auth-Gateway Deployment Parity Test"
echo " VPS    : $VPS_URL"
echo " Render : $RENDER_URL"
echo "=================================================================="

# ─── 1. Liveness ──────────────────────────────────────────────────────
echo
echo "${YELLOW}[1] Liveness${NC}"
probe "GET /health"                GET    /health
probe_health_shape

# ─── 2. Public routes — should 200 or shape match ─────────────────────
echo
echo "${YELLOW}[2] Public surface${NC}"
probe "GET / (root, no route)"     GET    /                                ""  "404|200"
probe "GET /favicon.ico"           GET    /favicon.ico                      ""  "200|404"

# ─── 3. CORS preflight ─────────────────────────────────────────────────
echo
echo "${YELLOW}[3] CORS preflight${NC}"
probe "OPTIONS /v1/auth/login"            OPTIONS /v1/auth/login             ""  "200|204|404"
probe "OPTIONS /oauth/token"              OPTIONS "$TOKEN_PROBE_PATH"        ""  "200|204|404"

# ─── 4. Auth endpoints — should 400/401/422 (not 5xx, not 404) ────────
echo
echo "${YELLOW}[4] Auth endpoints respond identically${NC}"
probe "POST /v1/auth/login (no body)"     POST  /v1/auth/login              ""                           "400|401|422"
probe "POST /v1/auth/login (bad creds)"   POST  /v1/auth/login              '{"email":"x@x.x","password":"bad"}'  "401|400"
probe "POST /v1/auth/register (no body)"  POST  /v1/auth/register           ""                           "400|401|422"
probe "POST /v1/auth/refresh (no token)"  POST  /v1/auth/refresh            ""                           "400|401|422"

# ─── 5. OAuth endpoints ────────────────────────────────────────────────
echo
echo "${YELLOW}[5] OAuth endpoints${NC}"
probe "GET /oauth/authorize (no params)"  GET   /oauth/authorize             ""  "302|400|401"
probe "POST /oauth/token (no body)"       POST  "$TOKEN_PROBE_PATH"          ""  "400|401|422"
probe "GET /.well-known/openid-configuration"  GET  /.well-known/openid-configuration  ""  "200|404"
probe "GET /.well-known/jwks.json"        GET   /.well-known/jwks.json       ""  "200|404"

# ─── 6. Protected routes — should 401 without auth ────────────────────
echo
echo "${YELLOW}[6] Protected routes require auth${NC}"
probe "GET /admin/status (no auth)"       GET   /admin/status                ""  "401|403"
probe "GET /api/v1/auth/api-keys (no auth)" GET /api/v1/auth/api-keys        ""  "401|403"
probe "GET /api/v1/projects (no auth)"    GET   /api/v1/projects             ""  "401|403"

# ─── 7. Rate limiting headers exposed ─────────────────────────────────
echo
echo "${YELLOW}[7] Rate-limit headers present${NC}"
TOTAL=$((TOTAL+1))
vps_rl=$(curl -sI "$VPS_URL/v1/auth/session" --max-time 10 | grep -i '^ratelimit-limit:' | head -1)
rndr_rl=$(curl -sI "$RENDER_URL/v1/auth/session" --max-time 15 | grep -i '^ratelimit-limit:' | head -1)
printf "%b[%02d]%b %-40s " "$CYAN" "$TOTAL" "$NC" "ratelimit-limit header"
if [[ -z "$vps_rl" && -z "$rndr_rl" ]]; then
  printf "%bMATCH%b  both absent\n" "$GREEN" "$NC"
  PASS=$((PASS+1))
elif [[ -n "$vps_rl" && -n "$rndr_rl" ]]; then
  printf "%bMATCH%b  vps=[%s] render=[%s]\n" "$GREEN" "$NC" "$(echo $vps_rl | tr -d '\r')" "$(echo $rndr_rl | tr -d '\r')"
  PASS=$((PASS+1))
else
  printf "%bDIVERGE%b  vps=[%s] render=[%s]\n" "$RED" "$NC" "$vps_rl" "$rndr_rl"
  DIVERGE=$((DIVERGE+1))
  FAIL=$((FAIL+1))
fi

# ─── Summary ───────────────────────────────────────────────────────────
echo
echo "=================================================================="
echo " Total: $TOTAL  Match: ${GREEN}$PASS${NC}  Inconclusive: ${YELLOW}$INCONCLUSIVE${NC}  Diverge: ${RED}$DIVERGE${NC}"
echo "=================================================================="

if [[ $DIVERGE -eq 0 && $INCONCLUSIVE -eq 0 ]]; then
  echo "${GREEN}✓ Deployments are functionally equivalent.${NC}"
  exit 0
else
  echo "${RED}✗ Deployment parity could not be fully established.${NC}"
  if [[ $INCONCLUSIVE -gt 0 ]]; then
    echo "  ${YELLOW}- $INCONCLUSIVE probe(s) were inconclusive (unexpected-but-matching responses).${NC}"
  fi
  if [[ $DIVERGE -gt 0 ]]; then
    echo "  ${RED}- $DIVERGE divergence(s) were detected.${NC}"
  fi
  echo "  Re-run with VERBOSE=1 to see response bodies."
  exit 1
fi
