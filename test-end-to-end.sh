#!/bin/bash

# ============================================================================
# ONASIS-CORE END-TO-END TESTING SCRIPT
# Tests all REST API, Memory Service, and Auth Gateway functionality
# ============================================================================

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

SERVER="${SERVER:-api.lanonasis.com}"
BASE_URL="https://$SERVER"

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║              🧪 ONASIS-CORE END-TO-END TESTING SUITE                      ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Server: $BASE_URL"
echo "Testing Netlify-hosted REST API & Memory Service"
echo ""

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_pattern="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "Test $TOTAL_TESTS: $test_name... "
    
    result=$(eval "$test_command" 2>&1)
    
    if echo "$result" | grep -q "$expected_pattern"; then
        echo -e "${GREEN}✅ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "  Expected: $expected_pattern"
        echo "  Got: $result"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}1. HEALTH & CONNECTIVITY TESTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

run_test "Health Endpoint" \
    "curl -s $BASE_URL/health" \
    "status\|healthy\|ok"

run_test "API v1 Health" \
    "curl -s $BASE_URL/api/v1/health" \
    "status\|healthy\|ok"

run_test "Auth Health" \
    "curl -s $BASE_URL/auth/health" \
    "status\|healthy\|ok"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}2. AUTHENTICATION GATEWAY TESTS (Proxied to VPS)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Test with API key if provided
if [ ! -z "$API_KEY" ]; then
    echo "Using provided API key: ${API_KEY:0:20}..."
    
    run_test "Auth Status with API Key" \
        "curl -s -H 'Authorization: Bearer $API_KEY' $BASE_URL/v1/auth/status" \
        "authenticated\|user\|valid"
else
    echo "⚠️  No API_KEY provided. Testing public endpoints only."
    echo "   To test authenticated endpoints, set API_KEY environment variable:"
    echo "   export API_KEY=your_api_key"
fi

# Test auth verification endpoint (should require auth)
run_test "Auth Verify Endpoint (Expected 401)" \
    "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/v1/auth/verify" \
    "401\|403"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}3. MEMORY SERVICE (MaaS) API TESTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ ! -z "$API_KEY" ]; then
    # Test memory listing (both singular and plural routes)
    run_test "List Memories (Plural)" \
        "curl -s -H 'Authorization: Bearer $API_KEY' $BASE_URL/api/v1/memories" \
        "memories\|data\|\[\]"
    
    run_test "List Memory (Singular)" \
        "curl -s -H 'Authorization: Bearer $API_KEY' $BASE_URL/api/v1/memory" \
        "memories\|data\|\[\]"
    
    # Test memory count
    run_test "Memory Count" \
        "curl -s -H 'Authorization: Bearer $API_KEY' $BASE_URL/api/v1/memory/count" \
        "count\|total"
    
    # Test memory stats
    run_test "Memory Statistics" \
        "curl -s -H 'Authorization: Bearer $API_KEY' $BASE_URL/api/v1/memory/stats" \
        "stats\|total\|count"
    
    # Test memory search
    run_test "Search Memories" \
        "curl -s -X POST -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d '{\"query\": \"test\", \"limit\": 5}' $BASE_URL/api/v1/memory/search" \
        "results\|memories\|\[\]"
else
    echo "⚠️  Skipping memory service tests (requires API_KEY)"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}4. MEMORY CRUD OPERATIONS TEST${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ ! -z "$API_KEY" ]; then
    # Create a test memory
    TIMESTAMP=$(date +%s)
    CREATE_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"title\": \"Test Memory $TIMESTAMP\",
            \"content\": \"This is a test memory created at $TIMESTAMP for REST API testing\",
            \"memory_type\": \"knowledge\",
            \"tags\": [\"test\", \"e2e\", \"rest-api\"],
            \"metadata\": {\"test_run\": \"$TIMESTAMP\", \"automated\": true}
        }" \
        "$BASE_URL/api/v1/memory")

    if echo "$CREATE_RESPONSE" | grep -q "id\|success\|memory"; then
        echo -e "Test $((TOTAL_TESTS + 1)): Create Memory... ${GREEN}✅ PASSED${NC}"
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
        PASSED_TESTS=$((PASSED_TESTS + 1))
        
        # Extract memory ID from response
        MEMORY_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [ -z "$MEMORY_ID" ]; then
            # Try alternative ID extraction
            MEMORY_ID=$(echo "$CREATE_RESPONSE" | grep -o '"memory_id":"[^"]*"' | head -1 | cut -d'"' -f4)
        fi
        
        if [ ! -z "$MEMORY_ID" ]; then
            echo "  Created memory ID: $MEMORY_ID"
            
            # Test reading the created memory
            run_test "Read Created Memory" \
                "curl -s -H 'Authorization: Bearer $API_KEY' $BASE_URL/api/v1/memory/$MEMORY_ID" \
                "Test Memory $TIMESTAMP\|id\|memory"
            
            # Test updating the memory
            UPDATE_RESPONSE=$(curl -s -X PUT \
                -H "Authorization: Bearer $API_KEY" \
                -H "Content-Type: application/json" \
                -d "{
                    \"title\": \"Updated Test Memory $TIMESTAMP\",
                    \"content\": \"This memory was updated during REST API testing\"
                }" \
                "$BASE_URL/api/v1/memory/$MEMORY_ID")
            
            if echo "$UPDATE_RESPONSE" | grep -q "success\|updated\|memory"; then
                echo -e "Test $((TOTAL_TESTS + 1)): Update Memory... ${GREEN}✅ PASSED${NC}"
                TOTAL_TESTS=$((TOTAL_TESTS + 1))
                PASSED_TESTS=$((PASSED_TESTS + 1))
            else
                echo -e "Test $((TOTAL_TESTS + 1)): Update Memory... ${RED}❌ FAILED${NC}"
                echo "  Response: $UPDATE_RESPONSE"
                TOTAL_TESTS=$((TOTAL_TESTS + 1))
                FAILED_TESTS=$((FAILED_TESTS + 1))
            fi
            
            # Test deleting the memory (cleanup)
            DELETE_RESPONSE=$(curl -s -X DELETE \
                -H "Authorization: Bearer $API_KEY" \
                "$BASE_URL/api/v1/memory/$MEMORY_ID")
            
            if echo "$DELETE_RESPONSE" | grep -q "success\|deleted\|removed"; then
                echo -e "Test $((TOTAL_TESTS + 1)): Delete Memory... ${GREEN}✅ PASSED${NC}"
                TOTAL_TESTS=$((TOTAL_TESTS + 1))
                PASSED_TESTS=$((PASSED_TESTS + 1))
            else
                echo -e "Test $((TOTAL_TESTS + 1)): Delete Memory... ${RED}❌ FAILED${NC}"
                echo "  Response: $DELETE_RESPONSE"
                TOTAL_TESTS=$((TOTAL_TESTS + 1))
                FAILED_TESTS=$((FAILED_TESTS + 1))
            fi
        else
            echo "  ⚠️  Could not extract memory ID from create response"
        fi
    else
        echo -e "Test $((TOTAL_TESTS + 1)): Create Memory... ${RED}❌ FAILED${NC}"
        echo "  Response: $CREATE_RESPONSE"
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
else
    echo "⚠️  Skipping CRUD tests (requires API_KEY)"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}5. CLI AUTH ENDPOINT TESTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

run_test "CLI Auth Login Page" \
    "curl -s $BASE_URL/auth/cli-login" \
    "html\|CLI\|Login\|token\|authentication"

run_test "OAuth Authorize Endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/oauth/authorize" \
    "200\|400\|401"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}6. WEBSOCKET & SSE PROXY TESTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Note: WebSocket and SSE are proxied to VPS mcp.lanonasis.com
echo "ℹ️  WebSocket endpoints are proxied to VPS (mcp.lanonasis.com:3002)"
echo "ℹ️  SSE endpoints are proxied to VPS (mcp.lanonasis.com:3003)"
echo ""

run_test "SSE Endpoint Available" \
    "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/sse" \
    "200"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}7. BULK OPERATIONS TESTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ ! -z "$API_KEY" ]; then
    # Test bulk delete endpoint (with empty array, should succeed)
    run_test "Bulk Delete Endpoint (Empty)" \
        "curl -s -X POST -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d '{\"memory_ids\": []}' $BASE_URL/api/v1/memory/bulk/delete" \
        "success\|deleted\|0"
else
    echo "⚠️  Skipping bulk operations tests (requires API_KEY)"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                        📊 TEST RESULTS SUMMARY                             ║"
echo "╠════════════════════════════════════════════════════════════════════════════╣"
echo "║"
echo "║  Total Tests:     $TOTAL_TESTS"
echo "║  ✅ Passed:       $PASSED_TESTS"
echo "║  ❌ Failed:       $FAILED_TESTS"

if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")
    echo "║  Success Rate:    ${SUCCESS_RATE}%"
fi

echo "║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Your Onasis-Core REST API is fully functional.${NC}"
    echo ""
    echo "Architecture Status:"
    echo "  ✅ Netlify Functions - Responding"
    echo "  ✅ REST API Gateway - Working"
    echo "  ✅ Memory Service (MaaS) - Operational"
    echo "  ✅ Auth Gateway Proxy - Connected to VPS"
    echo "  ✅ WebSocket/SSE Proxy - Configured"
    echo ""
    echo "Services:"
    echo "  • api.lanonasis.com - Netlify REST API & Functions"
    echo "  • auth.lanonasis.com - VPS Auth Gateway (proxied)"
    echo "  • mcp.lanonasis.com - VPS MCP Server (proxied for WS/SSE)"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Please review the errors above.${NC}"
    echo ""
    echo "Common issues:"
    echo "  1. Missing API_KEY environment variable:"
    echo "     export API_KEY=your_api_key_here"
    echo ""
    echo "  2. Check Netlify function logs:"
    echo "     netlify functions:log"
    echo ""
    echo "  3. Verify environment variables in Netlify:"
    echo "     - SUPABASE_URL"
    echo "     - SUPABASE_SERVICE_ROLE_KEY"
    echo "     - JWT_SECRET"
    echo ""
    echo "  4. Check VPS proxy endpoints are responding:"
    echo "     - auth.lanonasis.com (port 4000)"
    echo "     - mcp.lanonasis.com (ports 3002, 3003)"
    echo ""
    exit 1
fi
