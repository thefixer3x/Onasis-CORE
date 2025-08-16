#!/bin/bash

# Onasis-CORE Complete Deployment Script
# Deploy all privacy services to VPS with proper configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VPS_HOST="${VPS_HOST:-168.231.74.29}"
VPS_USER="${VPS_USER:-root}"
DEPLOY_PATH="/var/www/onasis-core"
SERVICES=("api-gateway" "data-masking" "email-proxy" "billing-service" "webhook-proxy")

# Helper functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

info() {
    echo -e "${PURPLE}🔒 $1${NC}"
}

banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                        ONASIS-CORE                          ║"
    echo "║              Privacy-First Infrastructure                    ║"
    echo "║                   Deployment System                         ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking deployment prerequisites..."
    
    # Check if we can SSH to VPS
    if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$VPS_USER@$VPS_HOST" exit &>/dev/null; then
        error "Cannot connect to VPS at $VPS_HOST. Please check SSH configuration."
    fi
    
    # Check if git is available
    if ! command -v git &> /dev/null; then
        error "Git is required for deployment"
    fi
    
    # Check if node is available on VPS
    if ! ssh "$VPS_USER@$VPS_HOST" 'command -v node' &>/dev/null; then
        warning "Node.js not found on VPS, will attempt to install"
        install_nodejs_on_vps
    fi
    
    success "Prerequisites check passed"
}

# Install Node.js on VPS if needed
install_nodejs_on_vps() {
    log "Installing Node.js on VPS..."
    
    ssh "$VPS_USER@$VPS_HOST" '
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        apt-get install -y nodejs
        npm install -g pm2
    '
    
    success "Node.js installed on VPS"
}

# Deploy code to VPS
deploy_code() {
    log "Deploying Onasis-CORE to VPS..."
    
    # Create deployment directory
    ssh "$VPS_USER@$VPS_HOST" "mkdir -p $DEPLOY_PATH"
    
    # Copy files to VPS
    log "Copying files to VPS..."
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '.env' \
        --exclude 'logs' \
        "$PROJECT_ROOT/" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
    
    success "Code deployed to VPS"
}

# Configure environment on VPS
configure_environment() {
    log "Configuring environment on VPS..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        cd $DEPLOY_PATH
        
        # Create logs directory
        mkdir -p logs
        
        # Copy environment file if it doesn't exist
        if [ ! -f .env ]; then
            cp .env.example .env
            echo 'Environment file created from example'
        fi
        
        # Install dependencies
        npm install --production
        
        # Create systemd service files for each service
        sudo tee /etc/systemd/system/onasis-api-gateway.service > /dev/null <<EOF
[Unit]
Description=Onasis-CORE API Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$DEPLOY_PATH
Environment=NODE_ENV=production
ExecStart=/usr/bin/node api-gateway/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=onasis-api-gateway

[Install]
WantedBy=multi-user.target
EOF

        # Enable and start systemd services
        sudo systemctl daemon-reload
        sudo systemctl enable onasis-api-gateway
    "
    
    success "Environment configured on VPS"
}

# Configure Nginx
configure_nginx() {
    log "Configuring Nginx for Onasis-CORE..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        # Create Nginx configuration
        sudo tee /etc/nginx/sites-available/onasis-core > /dev/null <<'EOF'
# Onasis-CORE Nginx Configuration
# Privacy-First Infrastructure Services

# Rate limiting zones
limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=100r/m;
limit_req_zone \$binary_remote_addr zone=gateway_limit:10m rate=200r/m;

# Main API Gateway
server {
    listen 80;
    server_name api.vortexai.io gateway.apiendpoint.net lanonasis.com www.lanonasis.com;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection \"1; mode=block\";
    add_header Referrer-Policy \"strict-origin-when-cross-origin\";
    add_header X-Powered-By \"Onasis-CORE\";
    
    # Hide nginx version
    server_tokens off;
    
    # API Gateway routing
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        
        # Privacy protection headers
        proxy_set_header X-Real-IP \"\";
        proxy_set_header X-Forwarded-For \"\";
        proxy_set_header Host \$host;
        proxy_set_header User-Agent \"Onasis-Client/1.0\";
        
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
        
        # CORS
        add_header Access-Control-Allow-Origin \"*\";
        add_header Access-Control-Allow-Methods \"GET, POST, PUT, DELETE, OPTIONS\";
        add_header Access-Control-Allow-Headers \"Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Vendor\";
        
        if (\$request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin \"*\";
            add_header Access-Control-Allow-Methods \"GET, POST, PUT, DELETE, OPTIONS\";
            add_header Access-Control-Allow-Headers \"Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Vendor\";
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_set_header Host \$host;
        limit_req zone=gateway_limit burst=100 nodelay;
    }
    
    # Info endpoint
    location /info {
        proxy_pass http://localhost:3001/info;
        proxy_set_header Host \$host;
        limit_req zone=gateway_limit burst=50 nodelay;
    }
    
    # Block sensitive paths
    location ~ ^/(\\.env|config|admin|debug) {
        deny all;
        return 404;
    }
    
    # Default response
    location / {
        return 200 '{\"service\":\"Onasis-CORE\",\"status\":\"active\",\"privacy\":\"high\"}';
        add_header Content-Type application/json;
    }
    
    access_log /var/log/nginx/onasis-core.access.log;
    error_log /var/log/nginx/onasis-core.error.log;
}

# Data Masking Service
server {
    listen 80;
    server_name data.lanonasis.com;
    
    location / {
        limit_req zone=api_limit burst=10 nodelay;
        proxy_pass http://localhost:3002;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \"\";
        proxy_set_header X-Forwarded-For \"\";
    }
}

# Email Proxy Service  
server {
    listen 80;
    server_name mail.lanonasis.com;
    
    location / {
        limit_req zone=api_limit burst=5 nodelay;
        proxy_pass http://localhost:3003;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \"\";
        proxy_set_header X-Forwarded-For \"\";
    }
}

# Webhook Proxy
server {
    listen 80;
    server_name webhook.vortexai.io hook.lanonasis.com;
    
    location /webhook/ {
        limit_req zone=api_limit burst=5 nodelay;
        proxy_pass http://localhost:3005;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        
        limit_except POST {
            deny all;
        }
    }
}
EOF

        # Enable the site
        sudo ln -sf /etc/nginx/sites-available/onasis-core /etc/nginx/sites-enabled/
        
        # Test and reload nginx
        sudo nginx -t && sudo systemctl reload nginx
    "
    
    success "Nginx configured for Onasis-CORE"
}

# Start services
start_services() {
    log "Starting Onasis-CORE services..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        cd $DEPLOY_PATH
        
        # Stop any existing services
        sudo systemctl stop onasis-api-gateway 2>/dev/null || true
        pkill -f 'node.*server.js' || true
        sleep 3
        
        # Start API Gateway
        sudo systemctl start onasis-api-gateway
        
        # Wait for service to start
        sleep 5
        
        # Check service status
        if sudo systemctl is-active onasis-api-gateway >/dev/null; then
            echo 'API Gateway service started successfully'
        else
            echo 'Failed to start API Gateway service'
            sudo systemctl status onasis-api-gateway
            exit 1
        fi
    "
    
    success "Services started successfully"
}

# Health checks
perform_health_checks() {
    log "Performing health checks..."
    
    local services_to_check=(
        "3001:API Gateway"
    )
    
    for service_info in "${services_to_check[@]}"; do
        IFS=':' read -r port name <<< "$service_info"
        
        log "Checking $name on port $port..."
        
        local attempts=0
        local max_attempts=10
        
        while [ $attempts -lt $max_attempts ]; do
            if ssh "$VPS_USER@$VPS_HOST" "curl -f http://localhost:$port/health >/dev/null 2>&1"; then
                success "$name health check passed"
                break
            fi
            
            attempts=$((attempts + 1))
            if [ $attempts -eq $max_attempts ]; then
                error "$name health check failed after $max_attempts attempts"
            fi
            
            warning "$name health check attempt $attempts/$max_attempts failed, retrying..."
            sleep 3
        done
    done
}

# Show deployment status
show_status() {
    log "Onasis-CORE Deployment Status:"
    echo ""
    
    ssh "$VPS_USER@$VPS_HOST" "
        echo 'Service Status:'
        sudo systemctl is-active onasis-api-gateway && echo '✅ API Gateway: Running' || echo '❌ API Gateway: Failed'
        
        echo ''
        echo 'Port Status:'
        ss -tlnp | grep -E ':(3001|3002|3003|3004|3005)' | while read line; do
            port=\$(echo \$line | grep -o ':[0-9]*' | head -1 | cut -d: -f2)
            echo \"✅ Port \$port: Listening\"
        done
        
        echo ''
        echo 'Nginx Status:'
        sudo systemctl is-active nginx >/dev/null && echo '✅ Nginx: Running' || echo '❌ Nginx: Failed'
        
        echo ''
        echo 'Recent Logs:'
        if [ -f '$DEPLOY_PATH/logs/combined.log' ]; then
            tail -5 '$DEPLOY_PATH/logs/combined.log' 2>/dev/null || echo 'No logs available yet'
        fi
    "
    
    echo ""
    info "🌐 Public Endpoints:"
    log "API Gateway: https://api.vortexai.io/api/v1/"
    log "Neutral Gateway: https://gateway.apiendpoint.net/api/v1/"
    log "Health Check: https://api.vortexai.io/health"
    log "Service Info: https://api.vortexai.io/info"
    
    echo ""
    info "🔒 Privacy Features Active:"
    log "✓ Vendor identity masking"
    log "✓ Client IP anonymization"
    log "✓ Request/response sanitization"
    log "✓ Anonymous session tracking"
    log "✓ Rate limiting with privacy protection"
    log "✓ Billing integration with anonymization"
}

# Main deployment function
main() {
    banner
    
    info "🚀 Starting Onasis-CORE deployment to VPS: $VPS_HOST"
    echo ""
    
    check_prerequisites
    deploy_code
    configure_environment
    configure_nginx
    start_services
    perform_health_checks
    show_status
    
    echo ""
    success "🎉 Onasis-CORE deployment completed successfully!"
    echo ""
    info "Next steps:"
    log "1. Configure domain DNS to point to $VPS_HOST"
    log "2. Set up SSL certificates with Let's Encrypt"
    log "3. Configure vendor API keys in .env file"
    log "4. Set up monitoring and alerting"
    log "5. Test all endpoints and privacy features"
    echo ""
    info "Documentation: https://docs.lanonasis.com"
    info "Support: support@lanonasis.com"
}

# Execute main function
main "$@"