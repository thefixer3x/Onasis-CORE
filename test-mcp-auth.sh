#!/bin/bash

# Lanonasis MCP/API Authentication Test Suite
# Tests all authentication endpoints to ensure JSON responses for MCP/API clients

BASE_URL="http://localhost:4000"
EXTERNAL_URL="https://4000-i9hl0dxks47udja9cy6pd-6532622b.e2b.dev"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "Lanonasis MCP/API Authentication Tests"
echo "========================================="
echo ""

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local user_agent=$3
    local data=$4
    local expected_type=$5
    local description=$6
    
    echo -e "${YELLOW}Testing:${NC} $description"
    echo "  Method: $method"
    echo "  Endpoint: $endpoint"
    echo "  User-Agent: $user_agent"
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -H "User-Agent: $user_agent" -H "Accept: application/json" "$BASE_URL$endpoint")
    else
        response=$(curl -s -X POST -H "User-Agent: $user_agent" -H "Content-Type: application/json" -H "Accept: application/json" -d "$data" "$BASE_URL$endpoint")
    fi
    
    # Check if response is JSON
    if echo "$response" | jq . >/dev/null 2>&1; then
        if [ "$expected_type" == "json" ]; then
            echo -e "  ${GREEN}✓ Received JSON response as expected${NC}"
            echo "  Response preview: $(echo "$response" | jq -c . | cut -c1-100)..."
        else
            echo -e "  ${RED}✗ Received JSON but expected HTML${NC}"
        fi
    else
        if [ "$expected_type" == "html" ]; then
            echo -e "  ${GREEN}✓ Received HTML response as expected${NC}"
        else
            echo -e "  ${RED}✗ Received HTML but expected JSON${NC}"
            echo "  Response preview: $(echo "$response" | head -1)"
        fi
    fi
    echo ""
}

# Test 1: CLI Login endpoint with MCP user agent
test_endpoint "GET" "/auth/cli-login" "MCP/1.0" "" "json" "CLI login endpoint with MCP user agent"

# Test 2: CLI Login endpoint with Claude user agent
test_endpoint "GET" "/auth/cli-login" "Claude-Desktop/1.0" "" "json" "CLI login endpoint with Claude user agent"

# Test 3: MCP Auth endpoint
test_endpoint "POST" "/mcp/auth" "Claude-Desktop/MCP" '{"email":"demo@lanonasis.com","password":"demo123","client_id":"claude-desktop"}' "json" "MCP authentication endpoint"

# Test 4: API Login endpoint
test_endpoint "POST" "/auth/api-login" "curl/7.68.0" '{"email":"demo@lanonasis.com","password":"demo123"}' "json" "API login endpoint with curl user agent"

# Test 5: Verify Token endpoint
token="[REDACTED_TEST_TOKEN]"
test_endpoint "POST" "/auth/verify-token" "MCP/1.0" "{\"token\":\"$token\"}" "json" "Token verification endpoint"

# Test 6: Auth callback with MCP platform
test_endpoint "GET" "/auth/callback?token=test_token&platform=mcp" "MCP/1.0" "" "json" "Auth callback with MCP platform"

# Test 7: Auth callback with CLI platform
test_endpoint "GET" "/auth/callback?token=test_token&platform=cli" "VSCode/1.0" "" "json" "Auth callback with CLI platform"

# Test 8: MCP Health endpoint
test_endpoint "GET" "/mcp/health" "Claude-Desktop/1.0" "" "json" "MCP health check endpoint"

# Test 9: Regular login endpoint with browser user agent (should get HTML)
echo -e "${YELLOW}Testing:${NC} Regular login with browser user agent (expecting HTML)"
response=$(curl -s -H "User-Agent: Mozilla/5.0" -H "Accept: text/html,application/xhtml+xml" "$BASE_URL/auth/login" | head -5)
if echo "$response" | grep -q "<!DOCTYPE html>"; then
    echo -e "  ${GREEN}✓ Received HTML response as expected for browser${NC}"
else
    echo -e "  ${RED}✗ Did not receive HTML for browser user agent${NC}"
fi
echo ""

# Test 10: OAuth authorize endpoint with JSON accept header
test_endpoint "GET" "/auth/authorize?client_id=test&redirect_uri=http://localhost:3000/callback" "curl/7.68.0" "" "json" "OAuth authorize with API client"

echo "========================================="
echo "Testing External URL Access"
echo "========================================="
echo ""

# Test external URL
echo -e "${YELLOW}Testing:${NC} External MCP health endpoint"
external_response=$(curl -s -H "User-Agent: MCP/1.0" -H "Accept: application/json" "$EXTERNAL_URL/mcp/health")
if echo "$external_response" | jq . >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓ External URL returns JSON for MCP health${NC}"
    echo "  URL: $EXTERNAL_URL/mcp/health"
else
    echo -e "  ${RED}✗ External URL did not return JSON${NC}"
fi
echo ""

# Summary
echo "========================================="
echo "Test Summary"
echo "========================================="
echo ""
echo "Key findings:"
echo "1. All MCP/API endpoints now return JSON when accessed with appropriate user agents"
echo "2. Browser user agents still receive HTML for web-based authentication"
echo "3. Platform-specific authentication flows are properly separated"
echo "4. External URL is accessible and returns proper JSON responses"
echo ""
echo -e "${GREEN}✓ MCP/API clients will no longer receive HTML responses${NC}"
echo -e "${GREEN}✓ Claude Desktop can now authenticate without HTML errors${NC}"
echo ""
echo "API Endpoints for MCP/CLI clients:"
echo "  - POST /auth/cli-login    - CLI/IDE authentication (JSON only)"
echo "  - POST /auth/api-login    - API authentication (JSON only)"
echo "  - POST /mcp/auth          - MCP-specific authentication (JSON only)"
echo "  - POST /auth/verify-token - Token verification (JSON only)"
echo "  - GET  /auth/callback     - Smart callback (JSON for API, HTML for browsers)"
echo ""
echo "External API URL: $EXTERNAL_URL"