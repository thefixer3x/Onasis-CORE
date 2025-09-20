#!/bin/bash

# API Testing Script
# Tests all authentication and API endpoints

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration - Update these for your environment
if [ "$1" == "production" ]; then
    API_URL="https://api.lanonasis.com"
    echo -e "${YELLOW}Testing PRODUCTION API${NC}"
else
    API_URL="https://4000-i9hl0dxks47udja9cy6pd-6532622b.e2b.dev"
    echo -e "${YELLOW}Testing SANDBOX API${NC}"
fi

echo "API URL: $API_URL"
echo "================================"

# Test credentials
EMAIL="demo@lanonasis.com"
PASSWORD="demo123"

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local token=$4
    local description=$5
    
    echo -e "\n${YELLOW}Testing:${NC} $description"
    echo "Endpoint: $method $API_URL$endpoint"
    
    if [ -z "$data" ]; then
        if [ -z "$token" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
                -H "Authorization: Bearer $token")
        fi
    else
        if [ -z "$token" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $token" \
                -d "$data")
        fi
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ Success${NC} (HTTP $http_code)"
        echo "Response: $body" | python3 -m json.tool 2>/dev/null || echo "$body"
    else
        echo -e "${RED}✗ Failed${NC} (HTTP $http_code)"
        echo "Response: $body"
    fi
    
    echo "$body"
}

# 1. Test root endpoint
echo -e "\n${YELLOW}=== Testing Root Endpoint ===${NC}"
test_endpoint "GET" "/" "" "" "Root endpoint"

# 2. Test health check
echo -e "\n${YELLOW}=== Testing Health Check ===${NC}"
test_endpoint "GET" "/health" "" "" "Health check"

# 3. Test login
echo -e "\n${YELLOW}=== Testing Authentication ===${NC}"
login_response=$(test_endpoint "POST" "/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "" "Login")

# Extract token from response
TOKEN=$(echo "$login_response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ ! -z "$TOKEN" ]; then
    echo -e "${GREEN}✓ Token obtained successfully${NC}"
    echo "Token: ${TOKEN:0:20}..."
    
    # 4. Test authenticated endpoints
    echo -e "\n${YELLOW}=== Testing Authenticated Endpoints ===${NC}"
    
    test_endpoint "GET" "/auth/userinfo" "" "$TOKEN" "Get user info"
    test_endpoint "GET" "/api/status" "" "$TOKEN" "API status"
    test_endpoint "GET" "/api/keys" "" "$TOKEN" "List API keys"
    test_endpoint "GET" "/api/stats" "" "$TOKEN" "Get statistics"
    
    # 5. Test API key creation
    echo -e "\n${YELLOW}=== Testing API Key Creation ===${NC}"
    test_endpoint "POST" "/api/keys" "{\"name\":\"Test Key\"}" "$TOKEN" "Create API key"
    
    # 6. Test MCP endpoints
    echo -e "\n${YELLOW}=== Testing MCP Endpoints ===${NC}"
    test_endpoint "GET" "/mcp/health" "" "" "MCP health check"
    test_endpoint "POST" "/mcp/execute" "{\"tool\":\"test\",\"params\":{}}" "$TOKEN" "Execute MCP command"
    
else
    echo -e "${RED}✗ Failed to obtain token${NC}"
fi

# 7. Test signup (optional)
echo -e "\n${YELLOW}=== Testing Signup (Optional) ===${NC}"
NEW_EMAIL="test_$(date +%s)@example.com"
# Uncomment to test signup
# test_endpoint "POST" "/auth/signup" "{\"email\":\"$NEW_EMAIL\",\"password\":\"Test123!\",\"name\":\"Test User\"}" "" "Signup"

# 8. Test OAuth flow
echo -e "\n${YELLOW}=== Testing OAuth Flow ===${NC}"
test_endpoint "GET" "/auth/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&state=test123" "" "" "OAuth authorize"

# Summary
echo -e "\n${YELLOW}================================${NC}"
echo -e "${GREEN}Testing Complete!${NC}"
echo ""
echo "Summary:"
echo "- API URL: $API_URL"
echo "- Authentication: ${TOKEN:+✓ Working}${TOKEN:-✗ Not working}"
echo ""
echo "Next steps:"
echo "1. If authentication fails, check backend logs: pm2 logs lanonasis-api-server"
echo "2. Check Nginx configuration if on VPS"
echo "3. Verify CORS settings match your frontend URL"