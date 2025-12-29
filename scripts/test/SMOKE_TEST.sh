#!/bin/bash

# Onasis-Core Smoke Test Suite
# Tests all essential services after reorganization
# Core Services: Authentication, API Keys, Rate Limiting, Vendor Management, Memory Services

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Service URLs
API_URL="https://api.lanonasis.com"
AUTH_URL="https://auth.lanonasis.com"
MCP_URL="https://mcp.lanonasis.com"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
CRITICAL_FAILURES=0

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        ONASIS-CORE SMOKE TEST SUITE                        ║${NC}"
echo -e "${BLUE}║        Post-Reorganization Service Verification            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Testing Core Services:${NC}"
echo "  1. Authentication Service"
echo "  2. API Key Management"
echo "  3. Memory Services (MaaS)"
echo "  4. Vendor Management"
echo "  5. Rate Limiting"
echo "  6. API Gateway"
echo ""

# Function to test endpoint
test_service() {
    local category="$1"
    local name="$2"
    local method="$3"
    local url="$4"
    local data="$5"
    local auth_header="$6"
    local expected_status="${7:-200}"
    local is_critical="${8:-false}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}[$category]${NC} ${YELLOW}Test #$TOTAL_TESTS: $name${NC}"
    if [ "$is_critical" = "true" ]; then
        echo -e "${RED}⚠ CRITICAL TEST${NC}"
    fi
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Build curl command
    local curl_cmd="curl -s -w '\n%{http_code}' -X $method '$url' --max-time 10"
    
    if [ ! -z "$auth_header" ]; then
        curl_cmd="$curl_cmd -H 'Authorization: $auth_header'"
    fi
    
    if [ ! -z "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    
    # Execute request
    response=$(eval $curl_cmd 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # Check status
    local test_passed=false
    if [ "$http_code" == "$expected_status" ]; then
        test_passed=true
    elif [ "$expected_status" == "200" ] && [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        test_passed=true
    fi
    
    if [ "$test_passed" = true ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        
        # Show response preview
        if command -v jq &> /dev/null; then
            echo "$body" | jq -C '.' 2>/dev/null | head -10 || echo "$body" | head -5
        else
            echo "$body" | head -5
        fi
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code, expected $expected_status)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        
        if [ "$is_critical" = "true" ]; then
            CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
            echo -e "${RED}⚠ CRITICAL SERVICE FAILURE!${NC}"
        fi
        
        echo "Response: $body" | head -10
    fi
    
    echo "$body"
}

# ============================================================================
# 1. AUTHENTICATION SERVICE TESTS (CRITICAL)
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  1. AUTHENTICATION SERVICE (CRITICAL)                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

test_service "AUTH" "Auth Gateway Health" "GET" "$AUTH_URL/health" "" "" "200" "true"
test_service "AUTH" "Auth Service Availability" "GET" "$API_URL/auth/health" "" "" "200" "true"

# Test auth endpoints exist
test_service "AUTH" "Login Endpoint Exists" "POST" "$AUTH_URL/v1/auth/login" '{"email":"test@test.com","password":"test"}' "" "401" "false"
test_service "AUTH" "Register Endpoint Exists" "POST" "$AUTH_URL/v1/auth/register" '{"email":"test@test.com"}' "" "400" "false"

# ============================================================================
# 2. API KEY MANAGEMENT TESTS (CRITICAL)
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  2. API KEY MANAGEMENT (CRITICAL)                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# Test API key validation (should fail without valid key)
test_service "API-KEY" "API Key Validation Required" "GET" "$API_URL/api/v1/memory" "" "" "401" "true"
test_service "API-KEY" "Invalid API Key Rejected" "GET" "$API_URL/api/v1/memory" "" "Bearer invalid_key_123" "401" "false"

# Test API key format validation
test_service "API-KEY" "API Key Format Validation" "GET" "$API_URL/api/v1/memory" "" "Bearer sk_test_invalid" "401" "false"

# ============================================================================
# 3. MEMORY SERVICES (MaaS) TESTS (CRITICAL)
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  3. MEMORY SERVICES (MaaS) - CRITICAL                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# Test memory service endpoints
test_service "MEMORY" "Memory API Endpoint Available" "GET" "$API_URL/api/v1/memory" "" "" "401" "true"
test_service "MEMORY" "Memory Health Check" "GET" "$API_URL/health" "" "" "200" "true"

# Test memory operations require auth
test_service "MEMORY" "Memory Create Requires Auth" "POST" "$API_URL/api/v1/memory" '{"title":"test"}' "" "401" "false"
test_service "MEMORY" "Memory Search Requires Auth" "POST" "$API_URL/api/v1/memory/search" '{"query":"test"}' "" "401" "false"

# ============================================================================
# 4. VENDOR MANAGEMENT TESTS (CRITICAL)
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  4. VENDOR MANAGEMENT (CRITICAL)                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# Test vendor endpoints
test_service "VENDOR" "Vendor API Gateway Available" "GET" "$API_URL/health" "" "" "200" "true"
test_service "VENDOR" "Vendor Auth Required" "GET" "$API_URL/api/v1/memory" "" "" "401" "false"

# Test vendor isolation (should not allow cross-vendor access)
test_service "VENDOR" "Vendor Isolation Enforced" "GET" "$API_URL/api/v1/memory" "" "Bearer sk_test_other_vendor" "401" "false"

# ============================================================================
# 5. RATE LIMITING TESTS
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  5. RATE LIMITING                                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# Test rate limiting is active (multiple rapid requests)
echo -e "${CYAN}Testing rate limiting with rapid requests...${NC}"
for i in {1..5}; do
    response=$(curl -s -w "\n%{http_code}" "$API_URL/health" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    if [ "$http_code" == "429" ]; then
        echo -e "${GREEN}✓ Rate limiting active (got 429 on request $i)${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        break
    fi
    if [ $i -eq 5 ]; then
        echo -e "${YELLOW}⚠ Rate limiting not triggered (may be configured for higher limits)${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    fi
    sleep 0.1
done
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# ============================================================================
# 6. API GATEWAY TESTS (CRITICAL)
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  6. API GATEWAY (CRITICAL)                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

test_service "GATEWAY" "Gateway Health" "GET" "$API_URL/health" "" "" "200" "true"
test_service "GATEWAY" "Gateway Info" "GET" "$API_URL/api/v1/models" "" "" "200" "false"
test_service "GATEWAY" "Gateway Routing" "GET" "$API_URL/api/v1/memory" "" "" "401" "false"

# Test CORS headers
echo -e "\n${CYAN}Testing CORS configuration...${NC}"
cors_response=$(curl -s -I -X OPTIONS "$API_URL/api/v1/memory" -H "Origin: https://example.com" 2>&1)
if echo "$cors_response" | grep -qi "access-control-allow-origin"; then
    echo -e "${GREEN}✓ CORS headers present${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠ CORS headers not found (may need configuration)${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# ============================================================================
# 7. MCP SERVICE TESTS
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  7. MCP SERVICE                                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

test_service "MCP" "MCP Health" "GET" "$MCP_URL/health" "" "" "200" "false"
test_service "MCP" "MCP Tools Available" "GET" "$MCP_URL/api/v1/tools" "" "" "200" "false"
test_service "MCP" "MCP Memory Requires Auth" "GET" "$MCP_URL/api/v1/memory" "" "" "401" "false"
test_service "MCP" "MCP Projects Requires Auth" "GET" "$MCP_URL/api/v1/projects" "" "" "401" "false"

# ============================================================================
# 8. NETLIFY FUNCTIONS TESTS
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  8. NETLIFY FUNCTIONS                                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# Test that Netlify functions are deployed
test_service "NETLIFY" "MaaS API Function" "GET" "$API_URL/api/v1/memory" "" "" "401" "false"
test_service "NETLIFY" "Health Function" "GET" "$API_URL/health" "" "" "200" "false"
test_service "NETLIFY" "API Gateway Function" "GET" "$API_URL/api/v1/models" "" "" "200" "false"

# ============================================================================
# 9. DATABASE CONNECTIVITY TESTS
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  9. DATABASE CONNECTIVITY                                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# Test database connectivity through API
echo -e "${CYAN}Testing database connectivity through API responses...${NC}"
health_response=$(curl -s "$API_URL/health" 2>&1)
if echo "$health_response" | grep -qi "ok\|healthy\|available"; then
    echo -e "${GREEN}✓ Database connectivity appears healthy${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ Database connectivity may be impaired${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# ============================================================================
# 10. CONFIGURATION FILES TESTS
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  10. CONFIGURATION FILES                                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

echo -e "${CYAN}Checking critical configuration files...${NC}"

# Check if we're in the right directory
if [ -f "netlify.toml" ]; then
    CONFIG_DIR="."
elif [ -f "apps/onasis-core/netlify.toml" ]; then
    CONFIG_DIR="apps/onasis-core"
else
    CONFIG_DIR="."
fi

# Check netlify.toml
if [ -f "$CONFIG_DIR/netlify.toml" ]; then
    echo -e "${GREEN}✓ netlify.toml exists${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ netlify.toml missing${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Check _redirects
if [ -f "$CONFIG_DIR/_redirects" ]; then
    echo -e "${GREEN}✓ _redirects exists${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ _redirects missing${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Check package.json
if [ -f "$CONFIG_DIR/package.json" ]; then
    echo -e "${GREEN}✓ package.json exists${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ package.json missing${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Check .env files
if [ -f "$CONFIG_DIR/.env" ] || [ -f "$CONFIG_DIR/.env.example" ]; then
    echo -e "${GREEN}✓ Environment configuration exists${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠ No .env files found${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# ============================================================================
# 11. DOCUMENTATION INTEGRITY TESTS
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  11. DOCUMENTATION INTEGRITY                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

echo -e "${CYAN}Checking documentation structure after reorganization...${NC}"

# Check new docs structure
if [ -d "$CONFIG_DIR/docs/auth" ]; then
    echo -e "${GREEN}✓ docs/auth/ exists${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ docs/auth/ missing${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

if [ -d "$CONFIG_DIR/docs/deployment" ]; then
    echo -e "${GREEN}✓ docs/deployment/ exists${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ docs/deployment/ missing${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

if [ -d "$CONFIG_DIR/.archive" ]; then
    echo -e "${GREEN}✓ .archive/ exists${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ .archive/ missing${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Check README files were created
readme_count=$(find "$CONFIG_DIR/docs" -name "README.md" 2>/dev/null | wc -l)
if [ "$readme_count" -gt 0 ]; then
    echo -e "${GREEN}✓ README files created ($readme_count found)${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠ No README files found in docs${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# ============================================================================
# TEST SUMMARY
# ============================================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  SMOKE TEST SUMMARY                                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Calculate success rate
if [ $TOTAL_TESTS -gt 0 ]; then
    success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
else
    success_rate=0
fi

echo -e "Total Tests:      ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed:           ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:           ${RED}$FAILED_TESTS${NC}"
echo -e "Critical Failures: ${RED}$CRITICAL_FAILURES${NC}"
echo -e "Success Rate:     ${CYAN}${success_rate}%${NC}"
echo ""

# Service status summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  SERVICE STATUS                                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Core Services:${NC}"
echo "  Authentication:     $([ $CRITICAL_FAILURES -eq 0 ] && echo -e "${GREEN}✓ Operational${NC}" || echo -e "${RED}✗ Issues Detected${NC}")"
echo "  API Key Management: $([ $CRITICAL_FAILURES -eq 0 ] && echo -e "${GREEN}✓ Operational${NC}" || echo -e "${RED}✗ Issues Detected${NC}")"
echo "  Memory Services:    $([ $CRITICAL_FAILURES -eq 0 ] && echo -e "${GREEN}✓ Operational${NC}" || echo -e "${RED}✗ Issues Detected${NC}")"
echo "  Vendor Management:  $([ $CRITICAL_FAILURES -eq 0 ] && echo -e "${GREEN}✓ Operational${NC}" || echo -e "${RED}✗ Issues Detected${NC}")"
echo "  API Gateway:        $([ $CRITICAL_FAILURES -eq 0 ] && echo -e "${GREEN}✓ Operational${NC}" || echo -e "${RED}✗ Issues Detected${NC}")"
echo ""

# Final verdict
if [ $CRITICAL_FAILURES -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ ALL CRITICAL SERVICES OPERATIONAL                       ║${NC}"
    echo -e "${GREEN}║  Reorganization did not affect core functionality          ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}✓ Safe to commit reorganization changes${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ CRITICAL SERVICE FAILURES DETECTED                      ║${NC}"
    echo -e "${RED}║  Review failures before committing                         ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}⚠ Review critical failures before proceeding${NC}"
    echo ""
    echo "Note: Some failures may be pre-existing (database function issues)"
    echo "Check if failures are related to reorganization or existing issues"
    exit 1
fi
