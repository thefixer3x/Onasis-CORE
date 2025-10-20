#!/bin/bash

# Auth Gateway Deployment Script for Hostinger VPS
# Usage: ./deploy.sh [build|start|stop|restart|logs]

set -e

ACTION=${1:-start}
SERVICE_NAME="auth-gateway"
DEPLOY_DIR="/var/www/onasis-core/services/auth-gateway"
NGINX_CONF="/etc/nginx/sites-available/auth-gateway"

echo "🚀 Auth Gateway Deployment Script"
echo "=================================="
echo "Action: $ACTION"
echo ""

case $ACTION in
  build)
    echo "📦 Building auth gateway..."
    npm run build
    echo "✅ Build complete"
    ;;

  start)
    echo "🟢 Starting auth gateway with PM2..."
    pm2 start ecosystem.config.js --env production
    pm2 save
    echo "✅ Auth gateway started"
    ;;

  stop)
    echo "🛑 Stopping auth gateway..."
    pm2 stop $SERVICE_NAME
    echo "✅ Auth gateway stopped"
    ;;

  restart)
    echo "🔄 Restarting auth gateway..."
    pm2 restart $SERVICE_NAME
    echo "✅ Auth gateway restarted"
    ;;

  logs)
    echo "📋 Showing auth gateway logs..."
    pm2 logs $SERVICE_NAME --lines 100
    ;;

  nginx)
    echo "🌐 Configuring Nginx..."
    if [ ! -f "$NGINX_CONF" ]; then
      sudo cp nginx.conf $NGINX_CONF
      sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/auth-gateway
      echo "✅ Nginx config installed"
    else
      echo "⚠️  Nginx config already exists"
    fi

    echo "Testing Nginx configuration..."
    sudo nginx -t

    echo "Reloading Nginx..."
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded"
    ;;

  ssl)
    echo "🔒 Setting up SSL with Let's Encrypt..."
    sudo certbot --nginx -d api.lanonasis.com
    echo "✅ SSL certificate obtained"
    ;;

  deploy)
    echo "🚢 Full deployment..."

    echo "1. Building application..."
    npm ci --only=production
    npm run build

    echo "2. Stopping current instance..."
    pm2 stop $SERVICE_NAME || true

    echo "3. Starting new instance..."
    pm2 start ecosystem.config.js --env production
    pm2 save

    echo "4. Reloading Nginx..."
    sudo systemctl reload nginx

    echo "✅ Deployment complete!"
    echo ""
    echo "Check status with: pm2 status"
    echo "View logs with: pm2 logs $SERVICE_NAME"
    ;;

  status)
    echo "📊 Service status..."
    pm2 status $SERVICE_NAME
    echo ""
    echo "📡 Testing health endpoint..."
    curl -s http://localhost:4000/health | jq .
    ;;

  *)
    echo "❌ Unknown action: $ACTION"
    echo ""
    echo "Available actions:"
    echo "  build   - Build TypeScript to JavaScript"
    echo "  start   - Start the service with PM2"
    echo "  stop    - Stop the service"
    echo "  restart - Restart the service"
    echo "  logs    - View service logs"
    echo "  nginx   - Configure Nginx reverse proxy"
    echo "  ssl     - Set up SSL certificate"
    echo "  deploy  - Full deployment (build + restart + reload nginx)"
    echo "  status  - Check service status and health"
    exit 1
    ;;
esac
