#!/bin/bash

# ============================================================================
# ONASIS-CORE CONFIGURATION & CONNECTIVITY VERIFICATION
# Checks DNS, routing, and service configuration
# ============================================================================

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║           🔍 ONASIS-CORE CONFIGURATION VERIFICATION                       ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Test DNS Resolution
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}1. DNS RESOLUTION CHECK${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Testing DNS resolution for api.lanonasis.com..."
if host api.lanonasis.com > /dev/null 2>&1; then
    IP=$(host api.lanonasis.com | grep "has address" | awk '{print $4}' | head -1)
    echo -e "${GREEN}✅ DNS Resolved${NC}"
    echo "   IP Address: $IP"
    
    # Check if it's Netlify
    if host $IP | grep -q "netlify"; then
        echo "   Provider: Netlify ✅"
    else
        echo "   Provider: $(host $IP | head -1)"
    fi
else
    echo -e "${RED}❌ DNS Resolution Failed${NC}"
fi

echo ""

# Test Base URL Connectivity
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}2. BASE URL CONNECTIVITY${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Testing HTTPS connection to api.lanonasis.com..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://api.lanonasis.com)
if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "301" ] || [ "$HTTP_CODE" == "302" ]; then
    echo -e "${GREEN}✅ Connection Successful${NC} (HTTP $HTTP_CODE)"
else
    echo -e "${RED}❌ Connection Failed${NC} (HTTP $HTTP_CODE)"
fi

echo ""

# Test Health Endpoints
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}3. HEALTH ENDPOINTS CHECK${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

declare -a HEALTH_ENDPOINTS=(
    "/health:General Health"
    "/api/v1/health:API v1 Health"
    "/auth/health:Auth Gateway Health"
)

for endpoint_desc in "${HEALTH_ENDPOINTS[@]}"; do
    IFS=':' read -r endpoint desc <<< "$endpoint_desc"
    echo -n "Testing $desc ($endpoint)... "
    
    RESPONSE=$(curl -s https://api.lanonasis.com$endpoint)
    if echo "$RESPONSE" | grep -q "status\|healthy\|ok"; then
        echo -e "${GREEN}✅ PASSED${NC}"
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "   Response: $RESPONSE"
    fi
done

echo ""

# Test Netlify Function Routes
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}4. NETLIFY FUNCTION ROUTING CHECK${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

declare -a FUNCTION_ROUTES=(
    "/auth/cli-login:CLI Auth Login Page"
    "/.netlify/functions/health:Direct Health Function"
    "/.netlify/functions/maas-api:Direct MaaS API Function"
)

for route_desc in "${FUNCTION_ROUTES[@]}"; do
    IFS=':' read -r route desc <<< "$route_desc"
    echo -n "Testing $desc... "
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://api.lanonasis.com$route)
    if [ "$HTTP_CODE" == "200" ]; then
        echo -e "${GREEN}✅ Accessible (HTTP $HTTP_CODE)${NC}"
    else
        echo -e "${YELLOW}⚠️  HTTP $HTTP_CODE${NC}"
    fi
done

echo ""

# Test Memory API Routes
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}5. MEMORY API ROUTE VERIFICATION${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

declare -a MEMORY_ROUTES=(
    "/api/v1/memory:Singular Memory Route"
    "/api/v1/memories:Plural Memories Route"
    "/api/v1/memory/count:Memory Count Endpoint"
    "/api/v1/memory/stats:Memory Stats Endpoint"
)

echo "Note: These require authentication. Testing without auth (expecting 401)..."
echo ""

for route_desc in "${MEMORY_ROUTES[@]}"; do
    IFS=':' read -r route desc <<< "$route_desc"
    echo -n "Testing $desc... "
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://api.lanonasis.com$route)
    if [ "$HTTP_CODE" == "401" ]; then
        echo -e "${GREEN}✅ Route exists (HTTP $HTTP_CODE - Auth Required)${NC}"
    elif [ "$HTTP_CODE" == "200" ]; then
        echo -e "${GREEN}✅ Accessible (HTTP $HTTP_CODE)${NC}"
    else
        echo -e "${YELLOW}⚠️  HTTP $HTTP_CODE${NC}"
    fi
done

echo ""

# Check VPS Proxy Configuration
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}6. VPS PROXY CONFIGURATION CHECK${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Checking if VPS services are reachable (may timeout if not accessible)..."
echo ""

# Check Auth Gateway (proxied)
echo -n "Auth Gateway (auth.lanonasis.com)... "
if timeout 3 curl -s -o /dev/null -w "%{http_code}" https://auth.lanonasis.com/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Reachable${NC}"
else
    echo -e "${YELLOW}⚠️  Not directly reachable (may be firewalled)${NC}"
fi

# Check MCP Server (direct VPS)
echo -n "MCP Server (mcp.lanonasis.com:3001)... "
if timeout 3 curl -s -o /dev/null http://mcp.lanonasis.com:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Reachable${NC}"
else
    echo -e "${YELLOW}⚠️  Not reachable${NC}"
fi

echo ""

# Test _redirects Configuration
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}7. REDIRECT RULES VERIFICATION${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -f "apps/onasis-core/_redirects" ]; then
    echo "Analyzing _redirects file..."
    echo ""
    
    echo "Memory API Routes:"
    grep -E "memory|memories" apps/onasis-core/_redirects | sed 's/^/  /'
    echo ""
    
    echo "Auth Routes:"
    grep -E "auth|oauth" apps/onasis-core/_redirects | sed 's/^/  /'
    echo ""
    
    echo "MCP Routes:"
    grep -E "mcp|ws|sse" apps/onasis-core/_redirects | sed 's/^/  /'
    echo ""
else
    echo -e "${RED}❌ _redirects file not found${NC}"
fi

# Environment Check
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}8. ENVIRONMENT CONFIGURATION${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ -f "apps/onasis-core/.env" ]; then
    echo "Found .env file. Checking key variables (values hidden)..."
    echo ""
    
    for var in SUPABASE_URL=https://<project-ref>.supabase.co
        if grep -q "^${var}=" apps/onasis-core/.env; then
            echo -e "  ${GREEN}✅${NC} $var is set"
        else
            echo -e "  ${YELLOW}⚠️${NC}  $var is not set"
        fi
    done
else
    echo -e "${YELLOW}⚠️  No .env file found in apps/onasis-core/${NC}"
    echo "   Note: Netlify uses environment variables, not .env files"
fi

echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                           📊 VERIFICATION SUMMARY                          ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

echo "Service Architecture:"
echo "  • api.lanonasis.com → Netlify (REST API, Memory Service, Netlify Functions)"
echo "  • auth.lanonasis.com → VPS (Auth Gateway, proxied via _redirects)"
echo "  • mcp.lanonasis.com → VPS (MCP Server, proxied for WS/SSE)"
echo ""

echo "Configuration Files:"
echo "  • _redirects - Routing configuration"
echo "  • netlify.toml - Build & deployment settings"
echo "  • netlify/functions/* - Serverless functions"
echo ""

echo "Next Steps:"
echo "  1. Run full end-to-end test with API key:"
echo "     export API_KEY=your_api_key"
echo "     bash apps/onasis-core/test-end-to-end.sh"
echo ""
echo "  2. Check Netlify deployment status:"
echo "     netlify status"
echo ""
echo "  3. View function logs:"
echo "     netlify functions:log"
echo ""

echo "For detailed testing, see:"
echo "  • apps/onasis-core/test-end-to-end.sh - Full API testing"
echo "  • apps/mcp-core/test-end-to-end.sh - MCP protocol testing"
echo ""
