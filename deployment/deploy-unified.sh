#!/bin/bash

# Onasis-CORE Unified Router Deployment
# Deploy single URL that routes to all Supabase edge functions

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
ROUTER_PORT="3000"

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
    echo -e "${PURPLE}🔗 $1${NC}"
}

banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                     ONASIS-CORE                             ║"
    echo "║                  Unified Router                              ║"
    echo "║           Single URL → All Supabase Services               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking deployment prerequisites..."
    
    # Check SSH connection
    if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$VPS_USER@$VPS_HOST" exit &>/dev/null; then
        error "Cannot connect to VPS at $VPS_HOST. Please check SSH configuration."
    fi
    
    # Check if Node.js is available
    if ! ssh "$VPS_USER@$VPS_HOST" 'command -v node' &>/dev/null; then
        warning "Node.js not found on VPS, installing..."
        install_nodejs_on_vps
    fi
    
    # Check if PM2 is available
    if ! ssh "$VPS_USER@$VPS_HOST" 'command -v pm2' &>/dev/null; then
        log "Installing PM2 for process management..."
        ssh "$VPS_USER@$VPS_HOST" 'npm install -g pm2'
    fi
    
    success "Prerequisites check passed"
}

# Install Node.js if needed
install_nodejs_on_vps() {
    log "Installing Node.js on VPS..."
    ssh "$VPS_USER@$VPS_HOST" '
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        apt-get install -y nodejs
        npm install -g pm2
    '
    success "Node.js and PM2 installed"
}

# Deploy unified router
deploy_router() {
    log "Deploying Onasis-CORE Unified Router..."
    
    # Create deployment directory
    ssh "$VPS_USER@$VPS_HOST" "mkdir -p $DEPLOY_PATH"
    
    # Copy router files
    log "Copying router files to VPS..."
    rsync -avz --delete \
        --include='unified-router.js' \
        --include='package.json' \
        --include='.env.example' \
        --include='deployment/' \
        --include='docs/' \
        --include='README.md' \
        --exclude='*' \
        "$PROJECT_ROOT/" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
    
    success "Router files deployed"
}

# Configure environment
configure_environment() {
    log "Configuring unified router environment..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        cd $DEPLOY_PATH
        
        # Create logs directory
        mkdir -p logs
        
        # Create environment file if it doesn't exist
        if [ ! -f .env ]; then
            cp .env.example .env
            echo 'Environment file created from example'
        fi
        
        # Update environment for unified router
        cat >> .env << 'EOF'

# Unified Router Configuration
ROUTER_PORT=3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY

# Privacy Settings
PRIVACY_MODE=high
ENABLE_LOGGING=true
ENABLE_ANALYTICS=true

# Rate Limiting
GENERAL_RATE_LIMIT=500
AI_RATE_LIMIT=100
MEDIA_RATE_LIMIT=50
EOF
        
        # Install dependencies
        npm install --production
        
        # Create PM2 ecosystem file
        cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'onasis-unified-router',
    script: 'unified-router.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      ROUTER_PORT: 3000
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true
  }]
};
EOF
    "
    
    success "Environment configured"
}

# Configure Nginx for unified routing
configure_nginx() {
    log "Configuring Nginx for unified router..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        # Create unified Nginx configuration
        sudo tee /etc/nginx/sites-available/onasis-unified > /dev/null <<'EOF'
# Onasis-CORE Unified Router Configuration
# Single URL routing to all Supabase services

# Rate limiting zones
limit_req_zone \$binary_remote_addr zone=general_api:10m rate=500r/m;
limit_req_zone \$binary_remote_addr zone=ai_api:10m rate=100r/m;
limit_req_zone \$binary_remote_addr zone=media_api:10m rate=50r/m;

# Main unified router
server {
    listen 80;
    server_name 
        api.vortexai.io 
        gateway.apiendpoint.net 
        lanonasis.com 
        www.lanonasis.com
        proxy.connectionpoint.io
        unified.lanonasis.com;
    
    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection \"1; mode=block\" always;
    add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;
    add_header X-Powered-By \"Onasis-CORE Unified Router\" always;
    add_header X-Privacy-Level \"High\" always;
    
    # Hide nginx version
    server_tokens off;
    
    # Health check endpoint
    location /health {
        limit_req zone=general_api burst=100 nodelay;
        proxy_pass http://localhost:3000/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Service discovery
    location /services {
        limit_req zone=general_api burst=50 nodelay;
        proxy_pass http://localhost:3000/services;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \"\";
        proxy_set_header X-Forwarded-For \"\";
    }
    
    # AI services with strict rate limiting
    location ~ ^/api/(ai-chat|chat) {
        limit_req zone=ai_api burst=10 nodelay;
        
        # Privacy protection - strip identifying headers
        proxy_set_header X-Real-IP \"\";
        proxy_set_header X-Forwarded-For \"\";
        proxy_set_header Host \$host;
        proxy_set_header User-Agent \"Onasis-Client/1.0\";
        
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        
        # CORS for API access
        add_header Access-Control-Allow-Origin \"*\" always;
        add_header Access-Control-Allow-Methods \"GET, POST, PUT, DELETE, OPTIONS\" always;
        add_header Access-Control-Allow-Headers \"Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Service, X-Vendor\" always;
        
        if (\$request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin \"*\";
            add_header Access-Control-Allow-Methods \"GET, POST, PUT, DELETE, OPTIONS\";
            add_header Access-Control-Allow-Headers \"Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Service, X-Vendor\";
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }
    }
    
    # Media processing endpoints
    location ~ ^/api/(text-to-speech|speech-to-text|transcribe) {
        limit_req zone=media_api burst=5 nodelay;
        
        # Privacy protection
        proxy_set_header X-Real-IP \"\";
        proxy_set_header X-Forwarded-For \"\";
        proxy_set_header Host \$host;
        
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 600s;  # 10 minutes for media processing
        proxy_connect_timeout 30s;
        client_max_body_size 50M;  # Allow large audio files
    }
    
    # General API endpoints
    location /api/ {
        limit_req zone=general_api burst=20 nodelay;
        
        # Privacy protection
        proxy_set_header X-Real-IP \"\";
        proxy_set_header X-Forwarded-For \"\";
        proxy_set_header Host \$host;
        proxy_set_header User-Agent \"Onasis-Client/1.0\";
        
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
        
        # CORS
        add_header Access-Control-Allow-Origin \"*\" always;
        add_header Access-Control-Allow-Methods \"GET, POST, PUT, DELETE, OPTIONS\" always;
        add_header Access-Control-Allow-Headers \"Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Service\" always;
        
        if (\$request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin \"*\";
            add_header Access-Control-Allow-Methods \"GET, POST, PUT, DELETE, OPTIONS\";
            add_header Access-Control-Allow-Headers \"Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Service\";
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }
    }
    
    # Legacy API compatibility
    location /api/v1/ {
        limit_req zone=ai_api burst=10 nodelay;
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \"\";
        proxy_set_header X-Forwarded-For \"\";
    }
    
    # Webhook endpoints
    location /webhook/ {
        limit_req zone=general_api burst=5 nodelay;
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        
        # Only allow POST for webhooks
        limit_except POST {
            deny all;
        }
    }
    
    # Block sensitive paths
    location ~ ^/(\\.env|config|admin|debug|logs) {
        deny all;
        return 404;
    }
    
    # Root endpoint - service info
    location = / {
        limit_req zone=general_api burst=50 nodelay;
        proxy_pass http://localhost:3000/services;
        proxy_set_header Host \$host;
    }
    
    # Default 404 for other paths
    location / {
        return 404 '{\"error\":{\"message\":\"Endpoint not found\",\"available_endpoints\":[\"/health\",\"/services\",\"/api/{service}\"]}}';
        add_header Content-Type application/json always;
    }
    
    # Logging
    access_log /var/log/nginx/onasis-unified.access.log;
    error_log /var/log/nginx/onasis-unified.error.log;
}
EOF

        # Enable the site
        sudo ln -sf /etc/nginx/sites-available/onasis-unified /etc/nginx/sites-enabled/
        sudo rm -f /etc/nginx/sites-enabled/default
        
        # Test and reload nginx
        sudo nginx -t && sudo systemctl reload nginx
    "
    
    success "Nginx configured for unified routing"
}

# Start unified router
start_router() {
    log "Starting Onasis-CORE Unified Router..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        cd $DEPLOY_PATH
        
        # Stop any existing processes
        pm2 delete onasis-unified-router 2>/dev/null || true
        pkill -f 'unified-router.js' 2>/dev/null || true
        sleep 3
        
        # Start with PM2
        pm2 start ecosystem.config.js
        pm2 save
        
        # Setup PM2 startup
        sudo env PATH=\$PATH:/usr/bin pm2 startup systemd -u root --hp /root
        
        # Wait for service to start
        sleep 5
        
        # Check if service is running
        if pm2 list | grep -q 'onasis-unified-router.*online'; then
            echo 'Unified router started successfully'
        else
            echo 'Failed to start unified router'
            pm2 logs onasis-unified-router --lines 20
            exit 1
        fi
    "
    
    success "Unified router started with PM2"
}

# Health checks
perform_health_checks() {
    log "Performing comprehensive health checks..."
    
    local endpoints=(
        "3000:/health:Router Health"
        "3000:/services:Service Discovery"
    )
    
    for endpoint_info in "${endpoints[@]}"; do
        IFS=':' read -r port path name <<< "$endpoint_info"
        
        log "Checking $name at $path..."
        
        local attempts=0
        local max_attempts=15
        
        while [ $attempts -lt $max_attempts ]; do
            if ssh "$VPS_USER@$VPS_HOST" "curl -f http://localhost:$port$path >/dev/null 2>&1"; then
                success "$name health check passed"
                break
            fi
            
            attempts=$((attempts + 1))
            if [ $attempts -eq $max_attempts ]; then
                error "$name health check failed after $max_attempts attempts"
            fi
            
            warning "$name check attempt $attempts/$max_attempts failed, retrying..."
            sleep 3
        done
    done
    
    # Test service routing
    log "Testing service routing..."
    ssh "$VPS_USER@$VPS_HOST" "
        # Test service discovery
        response=\$(curl -s http://localhost:3000/services)
        if echo \"\$response\" | grep -q 'available_services'; then
            echo '✅ Service discovery working'
        else
            echo '⚠️  Service discovery response: '\$response
        fi
        
        # Test AI service routing (should show routing attempt)
        ai_response=\$(curl -s -X POST http://localhost:3000/api/ai-chat \
            -H 'Content-Type: application/json' \
            -d '{\"messages\":[{\"role\":\"user\",\"content\":\"test\"}]}')
        
        if echo \"\$ai_response\" | grep -q 'error\\|service'; then
            echo '✅ AI service routing active (authentication required as expected)'
        else
            echo '⚠️  AI service response: '\$ai_response
        fi
    "
}

# Show deployment status
show_status() {
    log "Onasis-CORE Unified Router Status:"
    echo ""
    
    ssh "$VPS_USER@$VPS_HOST" "
        echo 'PM2 Process Status:'
        pm2 list
        
        echo ''
        echo 'Port Status:'
        ss -tlnp | grep ':3000' && echo '✅ Port 3000: Listening' || echo '❌ Port 3000: Not listening'
        
        echo ''
        echo 'Nginx Status:'
        sudo systemctl is-active nginx >/dev/null && echo '✅ Nginx: Running' || echo '❌ Nginx: Failed'
        
        echo ''
        echo 'Recent Router Logs:'
        pm2 logs onasis-unified-router --lines 5 --nostream || echo 'No PM2 logs available'
        
        echo ''
        echo 'Service Test:'
        curl -s http://localhost:3000/health | jq '.available_services' 2>/dev/null || curl -s http://localhost:3000/health
    "
    
    echo ""
    info "🌐 Unified API Endpoints:"
    log "Primary: https://api.vortexai.io/api/{service}"
    log "Neutral: https://gateway.apiendpoint.net/api/{service}"
    log "Direct: https://lanonasis.com/api/{service}"
    log "Health: https://api.vortexai.io/health"
    log "Services: https://api.vortexai.io/services"
    
    echo ""
    info "🔗 Available Services:"
    log "• /api/ai-chat - Multi-model AI conversations"
    log "• /api/text-to-speech - TTS conversion"
    log "• /api/speech-to-text - STT transcription"
    log "• /api/extract-tags - Content tagging"
    log "• /api/generate-summary - Content summarization"
    log "• /api/generate-embedding - Vector embeddings"
    log "• /api/mcp-handler - Tool integrations"
    
    echo ""
    info "🛡️  Privacy Features:"
    log "✓ Single URL routes to all Supabase functions"
    log "✓ Vendor/client identity masking"
    log "✓ Request/response sanitization"
    log "✓ Anonymous session tracking"
    log "✓ PII auto-detection and removal"
    log "✓ Rate limiting with privacy protection"
}

# Main deployment function
main() {
    banner
    
    info "🚀 Deploying Onasis-CORE Unified Router to VPS: $VPS_HOST"
    info "🔗 Target Supabase: mxtsdgkwzjzlttpotole.supabase.co"
    echo ""
    
    check_prerequisites
    deploy_router
    configure_environment
    configure_nginx
    start_router
    perform_health_checks
    show_status
    
    echo ""
    success "🎉 Onasis-CORE Unified Router deployed successfully!"
    echo ""
    info "Next Steps:"
    log "1. Update .env with your Supabase keys:"
    log "   - SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    log "   - SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    log "2. Configure domain DNS to point to $VPS_HOST"
    log "3. Set up SSL certificates with Let's Encrypt"
    log "4. Test all service endpoints"
    log "5. Monitor logs and performance"
    echo ""
    info "🔧 Configuration:"
    log "SSH into VPS: ssh $VPS_USER@$VPS_HOST"
    log "Edit config: nano $DEPLOY_PATH/.env"
    log "View logs: pm2 logs onasis-unified-router"
    log "Restart: pm2 restart onasis-unified-router"
    echo ""
    info "📚 Documentation: https://docs.lanonasis.com"
}

# Execute main function
main "$@"