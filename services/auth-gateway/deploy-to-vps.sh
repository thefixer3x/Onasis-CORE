#!/bin/bash

# Deploy Auth Gateway to VPS (168.231.74.29)
# This replaces the broken api.lanonasis.com routing

echo "🚀 Deploying Auth Gateway to VPS (168.231.74.29)"
echo "================================================"

VPS_IP="168.231.74.29"
VPS_USER="root"  # Adjust if different
VPS_PORT="2222"  # Custom SSH port
APP_NAME="auth-gateway"
DEPLOY_PATH="/var/www/auth-gateway"

echo "📦 Application ready for deployment (using tsx runtime)..."
# Skip build due to TypeScript module resolution issues - use tsx runtime

echo "📤 Uploading to VPS..."
# Create deployment directory
ssh vps "mkdir -p ${DEPLOY_PATH}"

# Upload files
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'logs' \
  ./ vps:${DEPLOY_PATH}/

echo "⚙️  Installing dependencies on VPS..."
ssh vps "cd ${DEPLOY_PATH} && npm install --production"

echo "🔧 Setting up environment..."
# Copy production environment
ssh vps "cd ${DEPLOY_PATH} && cp .env.example .env"

echo "📝 Creating systemd service..."
ssh vps "cat > /etc/systemd/system/auth-gateway.service << 'EOF'
[Unit]
Description=Auth Gateway Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${DEPLOY_PATH}
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=4000

[Install]
WantedBy=multi-user.target
EOF"

echo "🔄 Starting service..."
ssh vps "systemctl daemon-reload"
ssh vps "systemctl enable auth-gateway"
ssh vps "systemctl restart auth-gateway"

echo "🌐 Setting up Nginx reverse proxy..."
ssh vps "cat > /etc/nginx/sites-available/auth-gateway << 'EOF'
server {
    listen 80;
    server_name auth.yourdomain.com;  # Update this
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF"

ssh vps "ln -sf /etc/nginx/sites-available/auth-gateway /etc/nginx/sites-enabled/"
ssh vps "nginx -t && systemctl reload nginx"

echo "✅ Deployment complete!"
echo ""
echo "🔗 Service URL: http://${VPS_IP}:4000"
echo "🔗 With domain: http://auth.yourdomain.com"
echo ""
echo "📊 Check status:"
echo "   ssh vps 'systemctl status auth-gateway'"
echo ""
echo "📋 Next steps:"
echo "1. Update DNS: auth.yourdomain.com → ${VPS_IP}"
echo "2. Configure SSL with Let's Encrypt"
echo "3. Update MaaS dashboard to use new auth URL"
echo "4. Test OAuth flow end-to-end"