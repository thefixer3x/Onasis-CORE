#!/bin/bash

##
# Lanonasis MCP Server - VPS Deployment Script
# Deploys standalone MCP server with 17+ tools to production VPS
# Server: srv896342.hstgr.cloud (168.231.74.29)
##

set -e

# Configuration
VPS_HOST="root@168.231.74.29"
VPS_PORT="2222"
DEPLOY_PATH="/opt/mcp-servers/lanonasis-standalone"
SERVICE_NAME="lanonasis-mcp-server"
BACKUP_RETAIN=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -f "src/index.js" ]; then
        error "Please run this script from the lanonasis-mcp root directory"
    fi
    
    # Check required files
    local required_files=("src/index.js" "src/config/prod-ca-2021.crt" "ecosystem.config.js" ".env.production")
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            error "Required file not found: $file"
        fi
    done
    
    # Check SSH connection
    if ! ssh -p $VPS_PORT -o ConnectTimeout=10 -o BatchMode=yes $VPS_HOST exit 2>/dev/null; then
        error "Cannot connect to VPS. Please check SSH configuration."
    fi
    
    success "Prerequisites check passed"
}

# Create deployment package
create_package() {
    log "Creating deployment package..."
    
    # Clean previous package
    rm -f lanonasis-mcp-standalone.tar.gz
    
    # Create package with all necessary files
    tar -czf lanonasis-mcp-standalone.tar.gz \
        --exclude=node_modules \
        --exclude=logs \
        --exclude=.git \
        --exclude="*.log" \
        src/ \
        scripts/ \
        docs/ \
        package.json \
        ecosystem.config.js \
        .env.production \
        README.md 2>/dev/null || true
    
    if [ ! -f "lanonasis-mcp-standalone.tar.gz" ]; then
        error "Failed to create deployment package"
    fi
    
    success "Deployment package created: $(du -h lanonasis-mcp-standalone.tar.gz | cut -f1)"
}

# Upload and deploy to VPS
deploy_to_vps() {
    log "Uploading deployment package to VPS..."
    
    # Upload package
    scp -P $VPS_PORT lanonasis-mcp-standalone.tar.gz $VPS_HOST:/tmp/
    
    log "Deploying Lanonasis MCP Server..."
    
    ssh -p $VPS_PORT $VPS_HOST << 'ENDSSH'
    set -e
    
    # Configuration
    DEPLOY_PATH="/opt/mcp-servers/lanonasis-standalone"
    SERVICE_NAME="lanonasis-mcp-server"
    
    echo "🚀 Starting Lanonasis MCP Server deployment..."
    
    # Create deployment directory structure
    mkdir -p /opt/mcp-servers
    mkdir -p /var/log/pm2
    mkdir -p /var/log/lanonasis-mcp
    mkdir -p /opt/certs
    
    # Navigate to deployment path
    mkdir -p $DEPLOY_PATH
    cd $DEPLOY_PATH
    
    # Backup existing deployment
    if [ -d "current" ]; then
        echo "📦 Backing up current deployment..."
        mv current backup-$(date +%Y%m%d-%H%M%S)
        
        # Keep only last 5 backups
        ls -dt backup-* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
    fi
    
    # Extract new deployment
    echo "📁 Extracting new deployment..."
    mkdir current
    cd current
    tar -xzf /tmp/lanonasis-mcp-standalone.tar.gz
    
    # Install dependencies
    echo "📦 Installing dependencies..."
    npm ci --silent
    
    # Build TypeScript
    echo "🔨 Building TypeScript..."
    npm run build
    
    # Setup environment variables
    echo "⚙️  Configuring environment..."
    if [ ! -f .env.production ]; then
        echo "❌ .env.production not found in package"
        exit 1
    fi
    
    # Copy SSL certificate
    echo "🔒 Setting up SSL certificate..."
    if [ -f "src/config/prod-ca-2021.crt" ]; then
        cp src/config/prod-ca-2021.crt /opt/certs/
        chmod 600 /opt/certs/prod-ca-2021.crt
        chown root:root /opt/certs/prod-ca-2021.crt
        echo "✅ SSL certificate configured"
    else
        echo "⚠️  SSL certificate not found, using system defaults"
    fi
    
    # Setup PM2 ecosystem if not already configured
    if [ -f ecosystem.config.js ]; then
        echo "🔄 Configuring PM2 ecosystem..."
        
        # Stop existing service if running
        pm2 stop $SERVICE_NAME 2>/dev/null || true
        pm2 delete $SERVICE_NAME 2>/dev/null || true
        
        # Start new service
        pm2 start ecosystem.config.js
        pm2 save
        
        # Ensure PM2 starts on boot
        pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
        
        echo "✅ PM2 service configured and started"
    else
        echo "❌ ecosystem.config.js not found"
        exit 1
    fi
    
    # Wait for service to start
    echo "⏳ Waiting for service to start..."
    sleep 5
    
    # Check service status
    if pm2 list | grep -q "$SERVICE_NAME.*online"; then
        echo "✅ Lanonasis MCP Server is running"
    else
        echo "❌ Failed to start service"
        pm2 logs $SERVICE_NAME --lines 10
        exit 1
    fi
    
    # Test health endpoint
    sleep 2
    if curl -s -f http://localhost:3001/health >/dev/null 2>&1; then
        echo "✅ Health check passed"
    else
        echo "⚠️  Health check failed, but service is running"
    fi
    
    # Display service information
    echo ""
    echo "🎉 Lanonasis MCP Server deployed successfully!"
    echo "📍 Service: $SERVICE_NAME"
    echo "🔌 Port: 3001 (stdio), 3002 (ws), 3003 (sse)"
    echo "📊 Status: $(pm2 jlist | jq -r '.[] | select(.name=="'$SERVICE_NAME'") | .pm2_env.status' 2>/dev/null || echo 'running')"
    echo "💾 Memory: $(pm2 jlist | jq -r '.[] | select(.name=="'$SERVICE_NAME'") | .monit.memory' 2>/dev/null | numfmt --to=iec 2>/dev/null || echo 'N/A')"
    echo "🕒 Uptime: $(pm2 jlist | jq -r '.[] | select(.name=="'$SERVICE_NAME'") | .pm2_env.pm_uptime' 2>/dev/null || echo 'N/A')"
    
    # Cleanup
    rm -f /tmp/lanonasis-mcp-standalone.tar.gz
    
    echo ""
    echo "📋 Next Steps:"
    echo "1. Configure nginx reverse proxy for mcp.lanonasis.com"
    echo "2. Update DNS to point mcp.lanonasis.com to this server"
    echo "3. Configure SSL certificate for the domain"
    echo "4. Test MCP connection from Claude"
    
ENDSSH
    
    success "Deployment completed successfully!"
}

# Configure Nginx (if requested)
configure_nginx() {
    if [ "$1" = "--configure-nginx" ]; then
        log "Configuring Nginx reverse proxy..."
        
        ssh -p $VPS_PORT $VPS_HOST << 'ENDSSH'
        
        # Create nginx configuration for MCP server
        cat > /etc/nginx/sites-available/mcp.lanonasis.com << 'EOF'
server {
    listen 80;
    server_name mcp.lanonasis.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp.lanonasis.com;
    
    # SSL configuration (to be configured with certbot)
    ssl_certificate /etc/letsencrypt/live/mcp.lanonasis.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.lanonasis.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    
    # MCP Stdio endpoint
    location /mcp {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # MCP-specific timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Server-Sent Events
    location /sse {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE-specific configuration
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
    
    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Add health check headers
        add_header X-Service "Lanonasis MCP Server" always;
        add_header X-Version "1.0.0" always;
    }
    
    # WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

        # Enable the site
        ln -sf /etc/nginx/sites-available/mcp.lanonasis.com /etc/nginx/sites-enabled/
        
        # Test nginx configuration
        if nginx -t; then
            echo "✅ Nginx configuration is valid"
            systemctl reload nginx
            echo "🔄 Nginx reloaded"
        else
            echo "❌ Nginx configuration error"
            rm -f /etc/nginx/sites-enabled/mcp.lanonasis.com
        fi
        
        echo ""
        echo "📋 SSL Setup Required:"
        echo "Run: certbot --nginx -d mcp.lanonasis.com"
        
ENDSSH
        
        success "Nginx configuration completed"
    fi
}

# Cleanup function
cleanup() {
    log "Cleaning up local files..."
    rm -f lanonasis-mcp-standalone.tar.gz
}

# Main execution
main() {
    log "🚀 Starting Lanonasis MCP Server deployment to VPS"
    log "Target: $VPS_HOST:$VPS_PORT"
    log "Service: $SERVICE_NAME"
    
    check_prerequisites
    create_package
    deploy_to_vps
    configure_nginx "$@"
    cleanup
    
    success "🎉 Lanonasis MCP Server deployment completed successfully!"
    
    log ""
    log "📋 Summary:"
    log "• Service: lanonasis-mcp-server"
    log "• Ports: 3001 (HTTP), 3002 (WS), 3003 (SSE)" 
    log "• Health: https://mcp.lanonasis.com/health (after DNS + SSL)"
    log "• Logs: pm2 logs lanonasis-mcp-server"
    log "• Control: pm2 restart lanonasis-mcp-server"
    log ""
    log "Next: Update DNS and configure SSL with 'certbot --nginx -d mcp.lanonasis.com'"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Lanonasis MCP Server Deployment Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --configure-nginx    Also configure nginx reverse proxy"
        echo "  --help, -h          Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0                          # Deploy MCP server only"
        echo "  $0 --configure-nginx        # Deploy and configure nginx"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac