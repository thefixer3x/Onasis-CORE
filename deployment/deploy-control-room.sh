#!/bin/bash

# Onasis-CORE Control Room Deployment
# Deploy the master dashboard for monitoring all platforms

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
CONTROL_ROOM_PORT="4000"

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
    echo -e "${PURPLE}🎛️  $1${NC}"
}

banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    ONASIS-CORE                              ║"
    echo "║                   CONTROL ROOM                              ║"
    echo "║           Single Source of Truth Dashboard                  ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Deploy control room
deploy_control_room() {
    log "Deploying Onasis-CORE Control Room..."
    
    # Ensure deployment directory exists
    ssh "$VPS_USER@$VPS_HOST" "mkdir -p $DEPLOY_PATH"
    
    # Copy control room files
    log "Copying control room files..."
    rsync -avz \
        "$PROJECT_ROOT/control-room/" \
        "$PROJECT_ROOT/multi-platform-router.js" \
        "$PROJECT_ROOT/package.json" \
        "$PROJECT_ROOT/.env.example" \
        "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
    
    success "Control room files deployed"
}

# Configure control room environment
configure_control_room() {
    log "Configuring Control Room environment..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        cd $DEPLOY_PATH
        
        # Install additional dependencies for control room
        npm install ws --save
        
        # Update environment for control room
        if [ ! -f .env ]; then
            cp .env.example .env
        fi
        
        # Add control room specific configuration
        cat >> .env << 'EOF'

# Control Room Configuration
CONTROL_ROOM_PORT=4000
ENABLE_WEBSOCKETS=true
MONITORING_INTERVAL=30000
ANALYTICS_RETENTION_DAYS=90

# Platform Monitoring URLs
SEFTEC_SAAS_URL=https://saas.seftec.tech
SEFTECHUB_URL=https://seftechub.com
VORTEXCORE_URL=https://vortexcore.app
LANONASIS_URL=https://lanonasis.com
MAAS_URL=https://maas.onasis.io

# Control Room Security
CONTROL_ROOM_SECRET=onasis_control_room_master_key_2024
ADMIN_ACCESS_TOKEN=control_room_admin_secure_token

# Real-time Features
ENABLE_REAL_TIME_MONITORING=true
ENABLE_ALERTS=true
ENABLE_AUTO_SCALING=true
EOF
        
        # Create PM2 ecosystem for multi-service setup
        cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'onasis-multi-platform',
      script: 'multi-platform-router.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        ROUTER_PORT: 3000
      },
      error_file: 'logs/platform-error.log',
      out_file: 'logs/platform-out.log',
      log_file: 'logs/platform-combined.log',
      time: true
    },
    {
      name: 'onasis-control-room',
      script: 'control-room/dashboard.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        CONTROL_ROOM_PORT: 4000
      },
      error_file: 'logs/control-room-error.log',
      out_file: 'logs/control-room-out.log',
      log_file: 'logs/control-room-combined.log',
      time: true
    }
  ]
};
EOF
    "
    
    success "Control room environment configured"
}

# Configure Nginx for control room
configure_nginx_control_room() {
    log "Configuring Nginx for Control Room access..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        # Update Nginx configuration to include control room
        sudo tee -a /etc/nginx/sites-available/onasis-unified > /dev/null <<'EOF'

# Control Room Dashboard
server {
    listen 80;
    server_name control.onasis.io dashboard.onasis.io admin.onasis.io;
    
    # Security headers for admin interface
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection \"1; mode=block\" always;
    add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;
    add_header Content-Security-Policy \"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';\" always;
    
    # Control Room Dashboard
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Extended timeout for real-time features
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        
        # WebSocket support
        proxy_buffering off;
    }
    
    # API endpoints with authentication
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        
        # Rate limiting for admin API
        limit_req zone=general_api burst=10 nodelay;
    }
    
    # Restrict access to sensitive paths
    location ~ ^/(logs|config|admin) {
        deny all;
        return 404;
    }
    
    access_log /var/log/nginx/control-room.access.log;
    error_log /var/log/nginx/control-room.error.log;
}
EOF

        # Test and reload nginx
        sudo nginx -t && sudo systemctl reload nginx
    "
    
    success "Nginx configured for Control Room"
}

# Start control room services
start_control_room() {
    log "Starting Control Room and Multi-Platform services..."
    
    ssh "$VPS_USER@$VPS_HOST" "
        cd $DEPLOY_PATH
        
        # Stop existing processes
        pm2 delete all 2>/dev/null || true
        sleep 3
        
        # Start all services with PM2
        pm2 start ecosystem.config.js
        pm2 save
        
        # Wait for services to start
        sleep 10
        
        # Check if services are running
        if pm2 list | grep -q 'onasis-multi-platform.*online' && pm2 list | grep -q 'onasis-control-room.*online'; then
            echo 'All services started successfully'
        else
            echo 'Some services failed to start'
            pm2 list
            exit 1
        fi
    "
    
    success "Control Room and Platform services started"
}

# Health checks for all services
perform_comprehensive_health_checks() {
    log "Performing comprehensive health checks..."
    
    local services=(
        "3000:/health:Multi-Platform Router"
        "4000:/health:Control Room Dashboard"
    )
    
    for service_info in "${services[@]}"; do
        IFS=':' read -r port path name <<< "$service_info"
        
        log "Checking $name at port $port..."
        
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
    
    # Test WebSocket connection
    log "Testing Control Room WebSocket..."
    ssh "$VPS_USER@$VPS_HOST" "
        timeout 5s node -e \"
            const WebSocket = require('ws');
            const ws = new WebSocket('ws://localhost:4000');
            ws.on('open', () => {
                console.log('✅ WebSocket connection successful');
                ws.close();
                process.exit(0);
            });
            ws.on('error', (err) => {
                console.log('❌ WebSocket connection failed:', err.message);
                process.exit(1);
            });
        \" 2>/dev/null && echo '✅ WebSocket test passed' || echo '⚠️  WebSocket test failed'
    "
}

# Show comprehensive status
show_control_room_status() {
    log "Onasis-CORE Complete System Status:"
    echo ""
    
    ssh "$VPS_USER@$VPS_HOST" "
        echo 'PM2 Process Status:'
        pm2 list
        
        echo ''
        echo 'Port Status:'
        echo 'Checking active ports...'
        ss -tlnp | grep -E ':(3000|4000)' | while read line; do
            port=\$(echo \$line | grep -o ':[0-9]*' | head -1 | cut -d: -f2)
            case \$port in
                3000) echo '✅ Port 3000: Multi-Platform Router' ;;
                4000) echo '✅ Port 4000: Control Room Dashboard' ;;
            esac
        done
        
        echo ''
        echo 'Service Health Status:'
        curl -s http://localhost:3000/health | jq -r '.status' 2>/dev/null && echo '✅ Multi-Platform Router: Healthy' || echo '❌ Multi-Platform Router: Unhealthy'
        curl -s http://localhost:4000/health | jq -r '.status' 2>/dev/null && echo '✅ Control Room: Healthy' || echo '❌ Control Room: Unhealthy'
        
        echo ''
        echo 'System Resources:'
        echo \"CPU Usage: \$(top -bn1 | grep \\\"Cpu(s)\\\" | awk '{print \$2}' | cut -d'%' -f1)%\"
        echo \"Memory Usage: \$(free -m | grep Mem | awk '{printf \\\"%.1f%%\\\", \$3/\$2 * 100.0}')\"
        echo \"Disk Usage: \$(df -h / | awk 'NR==2{printf \\\"%s\\\", \$5}')\"
    "
    
    echo ""
    info "🌐 Master Control URLs:"
    log "Control Room Dashboard: https://control.onasis.io"
    log "Alternative Access: https://dashboard.onasis.io"
    log "Admin Interface: https://admin.onasis.io"
    log "Direct Access: http://$VPS_HOST:4000"
    
    echo ""
    info "🔗 Platform API Endpoints:"
    log "Seftec SaaS: https://saas.seftec.tech/api"
    log "SeftecHub: https://seftechub.com/api"
    log "VortexCore: https://vortexcore.app/api"
    log "LanOnasis: https://lanonasis.com/api"
    log "MaaS: https://maas.onasis.io/api"
    
    echo ""
    info "🎛️  Control Room Features:"
    log "✓ Real-time platform monitoring"
    log "✓ Multi-platform analytics dashboard"
    log "✓ WebSocket live updates"
    log "✓ System metrics and health checks"
    log "✓ Platform management controls"
    log "✓ Emergency response protocols"
    log "✓ Usage and billing analytics"
    log "✓ Cross-platform user management"
    
    echo ""
    info "📊 Monitoring Capabilities:"
    log "• Platform health and uptime"
    log "• API response times and error rates"
    log "• User activity and engagement"
    log "• Revenue and billing analytics"
    log "• Resource utilization tracking"
    log "• Security and compliance monitoring"
}

# Main deployment function
main() {
    banner
    
    info "🚀 Deploying Onasis-CORE Control Room"
    info "🎯 Creating Single Source of Truth for:"
    log "   • saas.seftec.tech (Seftec SaaS)"
    log "   • seftechub.com (SeftecHub)"
    log "   • vortexcore.app (VortexCore)"
    log "   • lanonasis.com (LanOnasis)"
    log "   • maas.onasis.io (MaaS)"
    echo ""
    
    deploy_control_room
    configure_control_room
    configure_nginx_control_room
    start_control_room
    perform_comprehensive_health_checks
    show_control_room_status
    
    echo ""
    success "🎉 Onasis-CORE Control Room deployed successfully!"
    echo ""
    info "🎛️  You now have complete oversight of your entire platform ecosystem!"
    echo ""
    info "Next Steps:"
    log "1. Access Control Room: https://control.onasis.io"
    log "2. Configure domain DNS for all platforms"
    log "3. Set up SSL certificates for production domains"
    log "4. Configure Supabase API keys in .env"
    log "5. Set up alerts and monitoring thresholds"
    log "6. Configure payment processing for billing"
    echo ""
    info "🛠️  Management Commands:"
    log "View logs: pm2 logs"
    log "Restart services: pm2 restart all"
    log "Monitor resources: pm2 monit"
    log "Update services: pm2 reload all"
    echo ""
    info "📞 Support:"
    log "Documentation: https://docs.onasis.io"
    log "Control Room Guide: https://docs.onasis.io/control-room"
}

# Execute main function
main "$@"