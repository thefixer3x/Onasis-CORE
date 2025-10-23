#!/bin/bash

# Comprehensive Service Verification Script for Lanonasis VPS
# Run this locally to test VPS services, PM2, and database connections
# Usage: ./verify-vps-services.sh [vps-ip-or-domain]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="${1:-168.231.74.29}"
BASE_URL="http://${VPS_HOST}"
TIMEOUT=10

# Counter for results
PASSED=0
FAILED=0
TOTAL=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((PASSED++))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    ((FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

test_endpoint() {
    local url=$1
    local description=$2
    local expected_status=${3:-200}
    
    ((TOTAL++))
    log_info "Testing: $description"
    
    response=$(curl -s -w "\n%{http_code}" --max-time $TIMEOUT "$url" 2>/dev/null || echo -e "\n000")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "$expected_status" ]; then
        log_success "$description (HTTP $http_code)"
        echo "$body" | jq . 2>/dev/null || echo "$body"
        return 0
    else
        log_error "$description (HTTP $http_code, expected $expected_status)"
        return 1
    fi
}

echo "=========================================="
echo "Lanonasis VPS Service Verification"
echo "Target: $VPS_HOST"
echo "Time: $(date)"
echo "=========================================="
echo ""

# 1. Basic Connectivity
log_info "1. Testing basic connectivity..."
if ping -c 1 -W 2 "$VPS_HOST" &>/dev/null; then
    log_success "Host is reachable"
else
    log_error "Host is not reachable"
    exit 1
fi
echo ""

# 2. Auth Gateway Health Check
log_info "2. Testing Auth Gateway Health..."
test_endpoint "${BASE_URL}:4000/health" "Auth Gateway Health"
echo ""

# 3. Auth Gateway Database Check
log_info "3. Testing Auth Gateway Database Connection..."
response=$(curl -s --max-time $TIMEOUT "${BASE_URL}:4000/health" 2>/dev/null)
db_healthy=$(echo "$response" | jq -r '.database.healthy // false' 2>/dev/null)
if [ "$db_healthy" = "true" ]; then
    log_success "Database connection healthy"
else
    log_error "Database connection unhealthy"
    echo "$response" | jq '.database'
fi
echo ""

# 4. Auth Service
log_info "4. Testing Auth Service (Quick Auth)..."
test_endpoint "${BASE_URL}:3005/health" "Auth Service Health"
echo ""

# 5. MCP Core
log_info "5. Testing MCP Core..."
test_endpoint "${BASE_URL}:3001/" "MCP Core Root"
echo ""

# 6. Onasis Gateway
log_info "6. Testing Onasis Gateway..."
test_endpoint "${BASE_URL}:3000/" "Onasis Gateway Root"
echo ""

# 7. Test Auth Endpoints
log_info "7. Testing Auth Gateway Endpoints..."

# Admin status
test_endpoint "${BASE_URL}:4000/admin/status" "Admin Status" 200
echo ""

# MCP health
test_endpoint "${BASE_URL}:4000/mcp/health" "MCP Health" 200
echo ""

# 8. Test Auth Login (should fail without credentials but endpoint should exist)
log_info "8. Testing Auth Login Endpoint..."
response=$(curl -s -X POST --max-time $TIMEOUT \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test"}' \
    "${BASE_URL}:4000/v1/auth/login" 2>/dev/null || echo "")
http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT \
    -X POST -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test"}' \
    "${BASE_URL}:4000/v1/auth/login" 2>/dev/null || echo "000")

if [ "$http_code" = "401" ] || [ "$http_code" = "400" ]; then
    log_success "Login endpoint accessible (expected auth failure)"
else
    log_error "Login endpoint not working properly (HTTP $http_code)"
fi
echo ""

# 9. Test CLI Auth Endpoint
log_info "9. Testing CLI Auth Endpoint..."
response=$(curl -s -X POST --max-time $TIMEOUT \
    -H "Content-Type: application/json" \
    -d '{"email":"test","password":"test"}' \
    "${BASE_URL}:4000/auth/cli-login" 2>/dev/null || echo "")
http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT \
    -X POST -H "Content-Type: application/json" \
    -d '{"email":"test","password":"test"}' \
    "${BASE_URL}:4000/auth/cli-login" 2>/dev/null || echo "000")

if [ "$http_code" = "401" ] || [ "$http_code" = "400" ]; then
    log_success "CLI Auth endpoint accessible"
else
    log_error "CLI Auth endpoint not working (HTTP $http_code)"
fi
echo ""

# 10. Check Database Health in Detail
log_info "10. Detailed Database Health Check..."
response=$(curl -s --max-time $TIMEOUT "${BASE_URL}:4000/health" 2>/dev/null)
db_status=$(echo "$response" | jq -r '.database.healthy' 2>/dev/null)
db_timestamp=$(echo "$response" | jq -r '.database.timestamp // "N/A"' 2>/dev/null)

if [ "$db_status" = "true" ]; then
    log_success "Database healthy - Timestamp: $db_timestamp"
else
    db_error=$(echo "$response" | jq -r '.database.error // "Unknown error"' 2>/dev/null)
    log_error "Database unhealthy - Error: $db_error"
fi
echo ""

# 11. Test CORS
log_info "11. Testing CORS Configuration..."
response=$(curl -s -I --max-time $TIMEOUT \
    -H "Origin: http://localhost:5173" \
    "${BASE_URL}:4000/health" 2>/dev/null)
cors_header=$(echo "$response" | grep -i "access-control-allow-origin" || echo "")
if [ -n "$cors_header" ]; then
    log_success "CORS configured: $cors_header"
else
    log_warning "CORS headers not found"
fi
echo ""

# 12. Performance Check
log_info "12. Performance Check..."
start_time=$(date +%s%N)
curl -s --max-time $TIMEOUT "${BASE_URL}:4000/health" &>/dev/null
end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))
if [ $duration -lt 1000 ]; then
    log_success "Response time: ${duration}ms (excellent)"
elif [ $duration -lt 3000 ]; then
    log_success "Response time: ${duration}ms (good)"
else
    log_warning "Response time: ${duration}ms (slow)"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi

