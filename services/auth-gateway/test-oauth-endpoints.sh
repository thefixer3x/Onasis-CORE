#!/bin/bash
# Comprehensive OAuth Dual-Path Test Script
# Tests both /oauth/* and /api/v1/oauth/* patterns

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          OAuth Dual-Path Endpoint Verification            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Testing both OAuth patterns according to PORT_MAPPING_COMPLETE model:${NC}"
echo "  • Pattern 1: /oauth/* (original - VSCode, Windsurf)"
echo "  • Pattern 2: /api/v1/oauth/* (CLI compatibility)"
echo ""

# Test counters
PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local method="${3:-GET}"
    local expected_codes="$4"
    
    echo -e "${BLUE}Testing: ${name}${NC}"
    echo "  URL: $url"
    echo "  Method: $method"
    
    if [ "$method" = "POST" ]; then
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" || echo "000")
    else
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
    fi
    
    # Check if status is in expected codes
    if [[ " $expected_codes " =~ " $STATUS " ]]; then
        echo -e "  ${GREEN}✅ PASS - Status: $STATUS${NC}"
        ((PASSED++))
    else
        echo -e "  ${RED}❌ FAIL - Status: $STATUS (expected: $expected_codes)${NC}"
        ((FAILED++))
    fi
    echo ""
}

# Pattern 1: Original /oauth/* endpoints
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}PATTERN 1: Original /oauth/* (VSCode, Windsurf, Web)${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

test_endpoint \
    "GET /oauth/authorize" \
    "https://auth.lanonasis.com/oauth/authorize?client_id=test&response_type=code&redirect_uri=http://localhost:3000/callback" \
    "GET" \
    "200 302"

test_endpoint \
    "POST /oauth/token" \
    "https://auth.lanonasis.com/oauth/token" \
    "POST" \
    "400 401"

test_endpoint \
    "POST /oauth/revoke" \
    "https://auth.lanonasis.com/oauth/revoke" \
    "POST" \
    "400 401"

test_endpoint \
    "POST /oauth/introspect" \
    "https://auth.lanonasis.com/oauth/introspect" \
    "POST" \
    "400 401"

# Pattern 2: CLI /api/v1/oauth/* endpoints
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}PATTERN 2: CLI /api/v1/oauth/* (lanonasis-cli)${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

test_endpoint \
    "GET /api/v1/oauth/authorize" \
    "https://auth.lanonasis.com/api/v1/oauth/authorize?client_id=lanonasis-cli&response_type=code&redirect_uri=http://localhost:8888/callback&code_challenge=test&code_challenge_method=S256" \
    "GET" \
    "200 302"

test_endpoint \
    "POST /api/v1/oauth/token" \
    "https://auth.lanonasis.com/api/v1/oauth/token" \
    "POST" \
    "400 401"

test_endpoint \
    "POST /api/v1/oauth/revoke" \
    "https://auth.lanonasis.com/api/v1/oauth/revoke" \
    "POST" \
    "400 401"

test_endpoint \
    "POST /api/v1/oauth/introspect" \
    "https://auth.lanonasis.com/api/v1/oauth/introspect" \
    "POST" \
    "400 401"

# Additional health checks
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}ADDITIONAL: Health & Service Checks${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

test_endpoint \
    "GET /health (auth-gateway)" \
    "https://auth.lanonasis.com/health" \
    "GET" \
    "200"

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      TEST SUMMARY                          ║${NC}"
echo -e "${BLUE}╠════════════════════════════════════════════════════════════╣${NC}"

TOTAL=$((PASSED + FAILED))
echo -e "${BLUE}║${NC}  Total Tests: $TOTAL                                            ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}  ${GREEN}Passed: $PASSED${NC}                                              ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}  ${RED}Failed: $FAILED${NC}                                              ${BLUE}║${NC}"

echo -e "${BLUE}╠════════════════════════════════════════════════════════════╣${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${BLUE}║${NC}  ${GREEN}🎉 ALL TESTS PASSED!${NC}                                      ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  Both OAuth patterns are working correctly.                ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}                                                            ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  ✅ Pattern 1: /oauth/* (VSCode, Windsurf, Web)           ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  ✅ Pattern 2: /api/v1/oauth/* (CLI compatibility)        ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Your CLI OAuth flow is ready to use!${NC}"
    echo ""
    echo -e "${YELLOW}Example CLI command:${NC}"
    echo "  lanonasis login"
    echo ""
    echo -e "${YELLOW}Full OAuth URL for CLI:${NC}"
    echo "  https://auth.lanonasis.com/api/v1/oauth/authorize?response_type=code&client_id=lanonasis-cli&redirect_uri=http://localhost:8888/callback&scope=read+write+offline_access&code_challenge=YOUR_CHALLENGE&code_challenge_method=S256&state=YOUR_STATE"
    exit 0
else
    echo -e "${BLUE}║${NC}  ${RED}⚠️  SOME TESTS FAILED${NC}                                     ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}                                                            ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  Check the failed endpoints above and verify:             ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  1. auth-gateway service is running (pm2 list)            ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  2. OAuth routes are properly mounted in src/index.ts     ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  3. nginx is routing to port 4000                         ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
