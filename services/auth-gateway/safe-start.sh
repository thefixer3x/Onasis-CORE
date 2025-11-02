#!/bin/bash
# Safe startup script for auth-gateway with PM2
# Includes pre-flight checks and health monitoring

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Auth Gateway - Safe PM2 Startup Script      ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}\n"

# Function to print status
print_status() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Step 1: Run pre-flight checks
print_status "Running pre-flight checks..."
if node preflight-check.js; then
    print_success "Pre-flight checks passed"
else
    print_error "Pre-flight checks failed!"
    echo -e "\n${RED}Cannot proceed with deployment. Fix errors above.${NC}\n"
    exit 1
fi

# Step 2: Check if PM2 process already exists
print_status "Checking for existing PM2 processes..."
if pm2 describe auth-gateway-local > /dev/null 2>&1; then
    print_warning "Found existing auth-gateway-local process"
    echo -e "${YELLOW}Options:${NC}"
    echo "  1. Stop and restart (recommended)"
    echo "  2. Reload (zero-downtime)"
    echo "  3. Cancel"
    read -p "Choose option (1-3): " choice
    
    case $choice in
        1)
            print_status "Stopping existing process..."
            pm2 stop auth-gateway-local
            pm2 delete auth-gateway-local
            print_success "Stopped and removed existing process"
            ;;
        2)
            print_status "Reloading process..."
            pm2 reload auth-gateway-local
            print_success "Process reloaded"
            # Skip to monitoring
            SKIP_START=true
            ;;
        3)
            print_warning "Cancelled by user"
            exit 0
            ;;
        *)
            print_error "Invalid option"
            exit 1
            ;;
    esac
fi

# Step 3: Start PM2 process (if not reloaded)
if [ "$SKIP_START" != "true" ]; then
    print_status "Starting PM2 process with local configuration..."
    pm2 start ecosystem.config.local.js
    print_success "PM2 process started"
fi

# Step 4: Wait for service to be ready
print_status "Waiting for service to initialize (10 seconds)..."
sleep 10

# Step 5: Check PM2 status
print_status "Checking PM2 status..."
pm2 status auth-gateway-local

# Step 6: Health check
print_status "Performing health check..."
MAX_RETRIES=5
RETRY_COUNT=0
HEALTH_OK=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f http://localhost:4000/health > /dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        print_warning "Health check attempt $RETRY_COUNT failed, retrying..."
        sleep 2
    fi
done

if [ "$HEALTH_OK" = true ]; then
    print_success "Health check passed!"
    echo -e "\n${GREEN}Response:${NC}"
    curl -s http://localhost:4000/health | jq '.' 2>/dev/null || curl -s http://localhost:4000/health
else
    print_error "Health check failed after $MAX_RETRIES attempts!"
    echo -e "\n${RED}Checking PM2 logs for errors...${NC}\n"
    pm2 logs auth-gateway-local --lines 20 --nostream
    echo -e "\n${RED}Service may be in a restart loop. Check logs above.${NC}"
    exit 1
fi

# Step 7: Monitor for restart loops
print_status "Monitoring for restart loops (30 seconds)..."
INITIAL_RESTARTS=$(pm2 jlist | jq '.[] | select(.name=="auth-gateway-local") | .pm2_env.restart_time' 2>/dev/null || echo "0")
sleep 30
FINAL_RESTARTS=$(pm2 jlist | jq '.[] | select(.name=="auth-gateway-local") | .pm2_env.restart_time' 2>/dev/null || echo "0")

if [ "$FINAL_RESTARTS" -gt "$INITIAL_RESTARTS" ]; then
    RESTART_DIFF=$((FINAL_RESTARTS - INITIAL_RESTARTS))
    print_error "Service restarted $RESTART_DIFF times in 30 seconds!"
    echo -e "\n${RED}Possible restart loop detected. Checking logs...${NC}\n"
    pm2 logs auth-gateway-local --lines 50 --nostream
    echo -e "\n${YELLOW}Service is unstable. Consider stopping it:${NC}"
    echo "  pm2 stop auth-gateway-local"
    exit 1
else
    print_success "No restarts detected - service is stable"
fi

# Step 8: Final status
echo -e "\n${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           Deployment Successful! ✓             ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}Service Information:${NC}"
echo -e "  Name:        auth-gateway-local"
echo -e "  URL:         http://localhost:4000"
echo -e "  Health:      http://localhost:4000/health"
echo -e "  Mode:        Single instance (fork)"
echo -e "  Environment: development"

echo -e "\n${BLUE}Useful Commands:${NC}"
echo -e "  View logs:      ${CYAN}pm2 logs auth-gateway-local${NC}"
echo -e "  Monitor:        ${CYAN}pm2 monit${NC}"
echo -e "  Status:         ${CYAN}pm2 status${NC}"
echo -e "  Restart:        ${CYAN}pm2 restart auth-gateway-local${NC}"
echo -e "  Stop:           ${CYAN}pm2 stop auth-gateway-local${NC}"
echo -e "  Delete:         ${CYAN}pm2 delete auth-gateway-local${NC}"

echo -e "\n${BLUE}Test Endpoints:${NC}"
echo -e "  Health:         ${CYAN}curl http://localhost:4000/health${NC}"
echo -e "  Admin login:    ${CYAN}./test-admin-login.sh${NC}"
echo -e "  App register:   ${CYAN}./test-app-registration.sh${NC}"

echo -e "\n${GREEN}✓ Ready for testing!${NC}\n"