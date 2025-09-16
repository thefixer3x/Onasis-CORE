#!/bin/bash

# VPS Deployment Script for Lanonasis API
# This script sets up the backend API server on the VPS with proper Nginx configuration

echo "🚀 Setting up Lanonasis API on VPS..."

# Configuration
API_DOMAIN="api.lanonasis.com"
BACKEND_PORT=4000
MCP_PORT=8080

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Step 1: Install dependencies
print_status "Installing Node.js and PM2..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
npm install -g pm2

# Step 2: Clone or update the repository
print_status "Setting up application directory..."
APP_DIR="/var/www/lanonasis-api"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# Step 3: Copy backend server files
print_status "Copying backend server files..."
# This assumes you're deploying from the monorepo
cp -r apps/onasis-core/server/* $APP_DIR/

# Step 4: Install backend dependencies
print_status "Installing backend dependencies..."
cd $APP_DIR
npm install --production

# Step 5: Create environment file
print_status "Creating environment configuration..."
cat > $APP_DIR/.env << EOF
NODE_ENV=production
PORT=$BACKEND_PORT
JWT_SECRET=$(openssl rand -base64 32)
API_DOMAIN=$API_DOMAIN

# Add your Supabase credentials here if available
# SUPABASE_URL=your-supabase-url
# SUPABASE_ANON_KEY=your-supabase-key
EOF

# Step 6: Setup PM2 ecosystem file for production
print_status "Creating PM2 ecosystem file..."
cat > $APP_DIR/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'lanonasis-api',
    script: 'index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '512M'
  }]
}
EOF

# Step 7: Create logs directory
mkdir -p $APP_DIR/logs

# Step 8: Configure Nginx
print_status "Configuring Nginx..."
sudo tee /etc/nginx/sites-available/$API_DOMAIN > /dev/null << 'EOF'
server {
    listen 80;
    server_name api.lanonasis.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.lanonasis.com;
    
    # SSL will be configured by certbot
    # ssl_certificate /etc/letsencrypt/live/api.lanonasis.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.lanonasis.com/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # CORS headers
    add_header 'Access-Control-Allow-Origin' '$http_origin' always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Accept,Authorization,Cache-Control,Content-Type,DNT,If-Modified-Since,Keep-Alive,Origin,User-Agent,X-Requested-With' always;
    
    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        return 204;
    }
    
    # Authentication endpoints
    location /auth/ {
        proxy_pass http://localhost:4000/auth/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # API endpoints
    location /api/ {
        proxy_pass http://localhost:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Add authorization header passthrough
        proxy_set_header Authorization $http_authorization;
        proxy_pass_header Authorization;
    }
    
    # MCP endpoints
    location /mcp {
        proxy_pass http://localhost:4000/mcp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:4000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
    
    # Root endpoint - Returns API info
    location / {
        proxy_pass http://localhost:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Step 9: Enable the site
print_status "Enabling Nginx site..."
sudo ln -sf /etc/nginx/sites-available/$API_DOMAIN /etc/nginx/sites-enabled/
sudo nginx -t

# Step 10: Setup SSL with Let's Encrypt
print_status "Setting up SSL certificate..."
sudo certbot --nginx -d $API_DOMAIN --non-interactive --agree-tos --email admin@lanonasis.com

# Step 11: Start the application with PM2
print_status "Starting application with PM2..."
cd $APP_DIR
pm2 delete lanonasis-api 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER

# Step 12: Reload Nginx
print_status "Reloading Nginx..."
sudo systemctl reload nginx

# Step 13: Setup firewall
print_status "Configuring firewall..."
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw --force enable

# Step 14: Create health check script
print_status "Creating health check script..."
cat > $APP_DIR/health-check.sh << 'EOF'
#!/bin/bash
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health)
if [ $response -eq 200 ]; then
    echo "✓ API Server is healthy"
else
    echo "✗ API Server is not responding (HTTP $response)"
    pm2 restart lanonasis-api
fi
EOF
chmod +x $APP_DIR/health-check.sh

# Step 15: Add health check to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * $APP_DIR/health-check.sh") | crontab -

# Final status
echo ""
print_status "Deployment complete!"
echo ""
echo "📊 Status Check:"
echo "================"
pm2 status
echo ""
echo "🔍 Test endpoints:"
echo "=================="
echo "1. Health check: curl https://$API_DOMAIN/health"
echo "2. API info: curl https://$API_DOMAIN/"
echo "3. Auth test: curl -X POST https://$API_DOMAIN/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"demo@lanonasis.com\",\"password\":\"demo123\"}'"
echo ""
echo "📝 Logs:"
echo "========"
echo "View logs: pm2 logs lanonasis-api"
echo "View Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo ""
echo "🔐 Important:"
echo "============"
echo "1. Update JWT_SECRET in $APP_DIR/.env"
echo "2. Add Supabase credentials if using Supabase"
echo "3. Update CORS origins if needed in Nginx config"
echo "4. Monitor logs for any issues"