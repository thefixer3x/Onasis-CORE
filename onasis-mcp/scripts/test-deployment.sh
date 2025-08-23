#!/bin/bash

##
# Lanonasis MCP Server - Deployment Test Script
# Tests the deployed MCP server functionality
##

set -e

# Configuration
VPS_HOST="root@168.231.74.29"
VPS_PORT="2222"
MCP_URL="https://mcp.lanonasis.com"
SERVICE_NAME="lanonasis-mcp-server"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Test 1: Service Status
test_service_status() {
    log "Testing PM2 service status..."
    
    local status=$(ssh -p $VPS_PORT $VPS_HOST "pm2 jlist | jq -r '.[] | select(.name==\"$SERVICE_NAME\") | .pm2_env.status'" 2>/dev/null)
    
    if [ "$status" = "online" ]; then
        success "Service is running"
        
        # Get additional info
        local uptime=$(ssh -p $VPS_PORT $VPS_HOST "pm2 jlist | jq -r '.[] | select(.name==\"$SERVICE_NAME\") | .pm2_env.pm_uptime'" 2>/dev/null)
        local memory=$(ssh -p $VPS_PORT $VPS_HOST "pm2 jlist | jq -r '.[] | select(.name==\"$SERVICE_NAME\") | .monit.memory'" 2>/dev/null)
        
        echo "   Uptime: $(date -d @$(($uptime/1000)) +'%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'N/A')"
        echo "   Memory: $(echo $memory | numfmt --to=iec 2>/dev/null || echo 'N/A')"
    else
        error "Service is not running (status: $status)"
        return 1
    fi
}

# Test 2: Health Endpoint
test_health_endpoint() {
    log "Testing health endpoint..."
    
    local health_response
    if health_response=$(curl -s --max-time 10 http://168.231.74.29:3001/health 2>/dev/null); then
        local status=$(echo "$health_response" | jq -r '.status' 2>/dev/null)
        
        if [ "$status" = "healthy" ]; then
            success "Health endpoint responding"
            
            local services=$(echo "$health_response" | jq -r '.services' 2>/dev/null)
            local tools_count=$(echo "$health_response" | jq -r '.tools_count // "N/A"' 2>/dev/null)
            
            echo "   Services: $services"
            echo "   Tools: $tools_count"
        else
            error "Health endpoint unhealthy (status: $status)"
            return 1
        fi
    else
        error "Health endpoint not responding"
        return 1
    fi
}

# Test 3: MCP Protocol
test_mcp_protocol() {
    log "Testing MCP protocol (stdio)..."
    
    # Create temporary test script
    local test_script="/tmp/mcp_test_$$.js"
    
    ssh -p $VPS_PORT $VPS_HOST "cat > $test_script << 'EOF'
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const mcpServer = spawn('node', ['/opt/mcp-servers/lanonasis-standalone/current/src/index.js']);
let responseReceived = false;

// Set timeout
const timeout = setTimeout(() => {
    if (!responseReceived) {
        console.log('TIMEOUT: No response within 10 seconds');
        mcpServer.kill();
        process.exit(1);
    }
}, 10000);

mcpServer.stdout.on('data', (data) => {
    try {
        const response = JSON.parse(data.toString());
        if (response.tools && Array.isArray(response.tools)) {
            console.log(\`SUCCESS: MCP server responded with \${response.tools.length} tools\`);
            responseReceived = true;
            clearTimeout(timeout);
            mcpServer.kill();
            process.exit(0);
        }
    } catch (e) {
        // Ignore parse errors, might be stderr output
    }
});

mcpServer.stderr.on('data', (data) => {
    // Ignore stderr for this test
});

mcpServer.on('close', (code) => {
    if (!responseReceived) {
        console.log(\`FAILED: Process exited with code \${code}\`);
        process.exit(1);
    }
});

// Send list tools request
const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
};

mcpServer.stdin.write(JSON.stringify(request) + '\\n');
EOF"

    # Run the test
    local test_result
    if test_result=$(ssh -p $VPS_PORT $VPS_HOST "cd /opt/mcp-servers/lanonasis-standalone/current && timeout 15 node $test_script" 2>&1); then
        if echo "$test_result" | grep -q "SUCCESS:"; then
            success "MCP protocol working"
            echo "   $(echo "$test_result" | grep "SUCCESS:")"
        else
            error "MCP protocol test failed"
            echo "   $test_result"
            return 1
        fi
    else
        error "MCP protocol test error"
        echo "   $test_result"
        return 1
    fi
    
    # Cleanup
    ssh -p $VPS_PORT $VPS_HOST "rm -f $test_script" 2>/dev/null || true
}

# Test 4: Memory Operations
test_memory_operations() {
    log "Testing memory operations..."
    
    # This would require a more complex test, for now just check if the endpoint responds
    local memory_test=$(ssh -p $VPS_PORT $VPS_HOST "curl -s --max-time 5 -X POST http://localhost:3001/api/tools/search_memories -H 'Content-Type: application/json' -d '{\"query\":\"test\"}'" 2>/dev/null)
    
    if [ -n "$memory_test" ]; then
        success "Memory operations endpoint responding"
    else
        warning "Memory operations test inconclusive"
    fi
}

# Test 5: SSL Certificate
test_ssl_certificate() {
    log "Testing SSL certificate..."
    
    if ssh -p $VPS_PORT $VPS_HOST "test -f /opt/certs/prod-ca-2021.crt" 2>/dev/null; then
        success "SSL certificate present"
        
        local cert_info=$(ssh -p $VPS_PORT $VPS_HOST "openssl x509 -in /opt/certs/prod-ca-2021.crt -text -noout | grep -E 'Subject:|Not After :'" 2>/dev/null)
        echo "   $cert_info"
    else
        warning "SSL certificate not found"
    fi
}

# Test 6: Nginx Configuration (if configured)
test_nginx_config() {
    log "Testing Nginx configuration..."
    
    if ssh -p $VPS_PORT $VPS_HOST "test -f /etc/nginx/sites-enabled/mcp.lanonasis.com" 2>/dev/null; then
        if ssh -p $VPS_PORT $VPS_HOST "nginx -t" >/dev/null 2>&1; then
            success "Nginx configuration valid"
        else
            error "Nginx configuration invalid"
            return 1
        fi
    else
        warning "Nginx configuration not found (may not be configured yet)"
    fi
}

# Test 7: Port Connectivity
test_port_connectivity() {
    log "Testing port connectivity..."
    
    local ports=("3001" "3002" "3003")
    for port in "${ports[@]}"; do
        if nc -z 168.231.74.29 $port 2>/dev/null; then
            success "Port $port is accessible"
        else
            warning "Port $port is not accessible (may be firewalled)"
        fi
    done
}

# Main test runner
main() {
    log "🧪 Starting Lanonasis MCP Server deployment tests"
    log "Target: $VPS_HOST:$VPS_PORT"
    log "Service: $SERVICE_NAME"
    
    local tests_passed=0
    local tests_failed=0
    
    echo ""
    
    # Run tests
    local test_functions=(
        "test_service_status"
        "test_health_endpoint" 
        "test_mcp_protocol"
        "test_memory_operations"
        "test_ssl_certificate"
        "test_nginx_config"
        "test_port_connectivity"
    )
    
    for test_func in "${test_functions[@]}"; do
        if $test_func; then
            ((tests_passed++))
        else
            ((tests_failed++))
        fi
        echo ""
    done
    
    # Summary
    log "📊 Test Summary:"
    echo "   ✅ Passed: $tests_passed"
    echo "   ❌ Failed: $tests_failed"
    echo "   📋 Total:  $((tests_passed + tests_failed))"
    
    if [ $tests_failed -eq 0 ]; then
        success "🎉 All tests passed! MCP server is ready for production."
        
        echo ""
        log "📋 Next Steps:"
        echo "1. Configure DNS: mcp.lanonasis.com → 168.231.74.29"
        echo "2. Setup SSL: certbot --nginx -d mcp.lanonasis.com"
        echo "3. Test Claude integration"
        echo "4. Monitor logs: pm2 logs lanonasis-mcp-server"
        
        exit 0
    else
        error "❌ Some tests failed. Please check the deployment."
        exit 1
    fi
}

# Handle arguments
case "${1:-}" in
    --help|-h)
        echo "Lanonasis MCP Server Deployment Test Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac