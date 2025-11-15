# Comprehensive Standalone MCP Deployment Plan

**Generated:** August 22, 2025 15:02 UTC  
**Target Server:** srv896342.hstgr.cloud (168.231.74.29)  
**Deployment Strategy:** Standalone MCP Server with Zero Downtime

## 🚀 Executive Summary

Deploy a standards-compliant MCP server from onasis-core to VPS with proper domain routing, SSL certificates, and Supabase connectivity while maintaining existing services.

## 📋 Domain & Infrastructure Strategy

### **Domain Configuration Recommendations**

#### **Current Setup Analysis**

- **api.lanonasis.com**: Supabase project site (✅ Keep on Netlify)
- **mcp.lanonasis.com**: Currently pointing to Netlify (❓ Decision needed)
- **VPS**: srv896342.hstgr.cloud (168.231.74.29)

#### **Recommended Domain Strategy**

```
🌐 mcp.lanonasis.com → VPS (168.231.74.29)
├── /mcp          → Stdio MCP server endpoint
├── /sse          → Server-Sent Events for real-time
├── /health       → Health monitoring
└── /api/v1/*     → HTTP bridge (optional)

🌐 api.lanonasis.com → Keep on Netlify
├── /sse          → Netlify function (legacy)
├── /api/mcp      → Netlify function (legacy)
└── /api/v1/maas/* → MAAS API (keep existing)
```

#### **Migration Strategy**

1. **Phase 1**: Deploy MCP server to `mcp.lanonasis.com/mcp`
2. **Phase 2**: Update DNS to point `mcp.lanonasis.com` → VPS
3. **Phase 3**: Keep `api.lanonasis.com` on Netlify for existing services

## 🏗️ Deployment Architecture

### **Target VPS Structure**

```bash
/opt/mcp-servers/
├── onasis-standalone/              # New standalone MCP server
│   ├── current/                    # Active deployment
│   │   ├── src/
│   │   │   ├── stdio-mcp-server.js # Standards-compliant MCP
│   │   │   ├── http-bridge.js      # Optional HTTP interface
│   │   │   └── tools/              # Tool implementations
│   │   ├── ecosystem.config.js     # PM2 configuration
│   │   ├── .env.production         # Environment variables
│   │   └── package.json            # Dependencies
│   ├── backup-*/                   # Previous versions
│   └── logs/                       # Dedicated logging
├── ghost-protocol-legacy/          # Existing files (preserve)
└── nginx-configs/                  # Nginx configurations
```

### **Port Allocation Strategy**

```
Port 3001: onasis-mcp-standalone    # Stdio MCP server HTTP bridge
Port 3002: onasis-mcp-websocket     # WebSocket (if needed)
Port 3003: onasis-mcp-sse           # Server-Sent Events

# Avoid conflicts with existing ghost-protocol (port 3000)
```

## 🔧 Technical Implementation Plan

### **Phase 1: Infrastructure Preparation**

#### **1.1 SSL Certificate Setup**

```bash
# Fix existing SSL issues
sudo certbot delete --cert-name api.connectionpoint.tech
sudo certbot --nginx -d mcp.lanonasis.com

# Verify nginx configuration
nginx -t && systemctl reload nginx
```

#### **1.2 Supabase SSL Configuration**

```bash
# Copy certificate to VPS
scp -P 2222 docs/prod-ca-2021.crt root@168.231.74.29:/opt/certs/
chmod 600 /opt/certs/prod-ca-2021.crt

# Environment variable
export SUPABASE_SSL_CERT_PATH="/opt/certs/prod-ca-2021.crt"
```

### **Phase 2: MCP Server Deployment**

#### **2.1 Create Deployment Package**

```bash
# Local preparation
cd /Users/seyederick/DevOps/_project_folders/Onasis-CORE
tar -czf onasis-mcp-standalone.tar.gz \\
  stdio-mcp-server.js \\
  deploy/mcp-core.js \\
  services/websocket-mcp-handler.js \\
  services/enhanced-api-gateway.js \\
  package.json \\
  docs/prod-ca-2021.crt
```

#### **2.2 VPS Deployment Script**

```bash
#!/bin/bash
# deploy-standalone-mcp.sh

set -e

VPS_HOST="root@168.231.74.29"
VPS_PORT="2222"
DEPLOY_PATH="/opt/mcp-servers/onasis-standalone"
SERVICE_NAME="onasis-mcp-standalone"

echo "🚀 Deploying Onasis Standalone MCP Server..."

# Upload deployment package
scp -P $VPS_PORT onasis-mcp-standalone.tar.gz $VPS_HOST:/tmp/

ssh -p $VPS_PORT $VPS_HOST << 'ENDSSH'
  # Create deployment directory
  mkdir -p /opt/mcp-servers/onasis-standalone
  cd /opt/mcp-servers/onasis-standalone

  # Backup existing deployment
  if [ -d "current" ]; then
    mv current backup-$(date +%Y%m%d-%H%M%S)
  fi

  # Extract new deployment
  mkdir current
  cd current
  tar -xzf /tmp/onasis-mcp-standalone.tar.gz

  # Install dependencies
  npm install --production

  # Setup environment
  cat > .env.production << 'EOF'
NODE_ENV=production
PORT=3001
MCP_WS_PORT=3002
MCP_SSE_PORT=3003
ONASIS_SUPABASE_URL=https://<project-ref>.supabase.co
ONASIS_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
ONASIS_SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SSL_CERT_PATH=/opt/certs/prod-ca-2021.crt
EOF

  # Copy SSL certificate
  mkdir -p /opt/certs
  cp docs/prod-ca-2021.crt /opt/certs/
  chmod 600 /opt/certs/prod-ca-2021.crt

  # Setup PM2 ecosystem
  cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'onasis-mcp-standalone',
    script: './stdio-mcp-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/var/log/pm2/onasis-mcp-error.log',
    out_file: '/var/log/pm2/onasis-mcp-out.log',
    log_file: '/var/log/pm2/onasis-mcp-combined.log',
    time: true,
    merge_logs: true
  }]
};
EOF

  # Start with PM2
  pm2 start ecosystem.config.js
  pm2 save
  pm2 startup

  echo "✅ Onasis MCP Server deployed successfully!"
ENDSSH
```

### **Phase 3: Nginx Configuration**

#### **3.1 MCP Server Nginx Config**

```nginx
# /etc/nginx/sites-available/mcp.lanonasis.com
server {
    listen 80;
    server_name mcp.lanonasis.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp.lanonasis.com;

    ssl_certificate /etc/letsencrypt/live/mcp.lanonasis.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.lanonasis.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    # MCP Stdio endpoint (main)
    location /mcp {
        proxy_pass http://localhost:3001;
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

    # Server-Sent Events endpoint
    location /sse {
        proxy_pass http://localhost:3003;
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

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket endpoint (if needed)
    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔒 Security & Environment Configuration

### **Environment Variables Setup**

```bash
# /opt/mcp-servers/onasis-standalone/current/.env.production
NODE_ENV=production
PORT=3001
MCP_WS_PORT=3002
MCP_SSE_PORT=3003

# Supabase Configuration (namespaced to avoid conflicts)
ONASIS_SUPABASE_URL=https://<project-ref>.supabase.co
ONASIS_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
ONASIS_SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SSL_CERT_PATH=/opt/certs/prod-ca-2021.crt

# CORS Configuration
CORS_ORIGINS=https://lanonasis.com,https://api.lanonasis.com,https://mcp.lanonasis.com

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/onasis-mcp/combined.log
```

### **Firewall Configuration**

```bash
# Update VPS firewall (via Hostinger hPanel)
# Open ports: 22, 2222, 80, 443, 3001-3003
# Restrict 3001-3003 to specific IPs if possible
```

## 📊 Monitoring & Health Checks

### **Health Check Endpoints**

```
GET https://mcp.lanonasis.com/health
Response: {
  "status": "healthy",
  "services": {
    "mcp": "running",
    "supabase": "connected",
    "websocket": "ready"
  },
  "uptime": "24h 15m",
  "version": "1.0.0"
}
```

### **PM2 Monitoring Setup**

```bash
# Install PM2 monitoring tools
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Setup monitoring dashboard
pm2 monit
```

## 🧪 Testing & Validation

### **Deployment Verification Checklist**

- [ ] MCP server responds on stdio interface
- [ ] Health endpoint returns 200 OK
- [ ] Supabase connection established with SSL
- [ ] PM2 process running and stable
- [ ] Nginx proxy working correctly
- [ ] SSL certificate valid and secure
- [ ] Domain routing functional
- [ ] CORS headers properly configured

### **Claude Integration Test**

```json
{
  "mcpServers": {
    "onasis-core": {
      "command": "node",
      "args": ["/path/to/local/stdio-client.js"],
      "env": {
        "MCP_SERVER_URL": "https://mcp.lanonasis.com/mcp"
      }
    }
  }
}
```

## 🚀 Deployment Execution Steps

### **Step 1: Prepare Local Environment**

```bash
cd /Users/seyederick/DevOps/_project_folders/Onasis-CORE
chmod +x deploy-standalone-mcp.sh
```

### **Step 2: Execute Deployment**

```bash
./deploy-standalone-mcp.sh
```

### **Step 3: Configure DNS**

```bash
# Update DNS settings (via Netlify DNS or domain registrar)
# Point mcp.lanonasis.com → 168.231.74.29
```

### **Step 4: Enable SSL & Nginx**

```bash
ssh -p 2222 root@168.231.74.29
certbot --nginx -d mcp.lanonasis.com
ln -s /etc/nginx/sites-available/mcp.lanonasis.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### **Step 5: Validate Deployment**

```bash
curl -I https://mcp.lanonasis.com/health
pm2 status
pm2 logs onasis-mcp-standalone
```

## 🔄 CI/CD Integration Hooks

### **GitHub Actions Workflow**

```yaml
# .github/workflows/deploy-mcp.yml
name: Deploy Onasis MCP Server
on:
  push:
    branches: [main]
    paths: ["stdio-mcp-server.js", "deploy/**", "services/**"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to VPS
        run: ./deploy-standalone-mcp.sh
        env:
          SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
          SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
```

---

## 🎯 Success Criteria

1. **✅ Standards Compliance**: MCP server follows stdio protocol
2. **✅ Zero Downtime**: Existing services remain operational
3. **✅ SSL Security**: All endpoints properly encrypted
4. **✅ Monitoring**: Health checks and logging functional
5. **✅ Scalability**: PM2 process management with auto-restart
6. **✅ Domain Strategy**: Clean separation between services

**Estimated Deployment Time**: 30-45 minutes  
**Rollback Time**: < 5 minutes (via PM2 and nginx config)

---

**Related Documents:**

- VPS-ARCHITECTURE-DIAGRAM-20250822.md
- docs/MCP_ORCHESTRATION_ARCHITECTURE.md
- docs/EAS_DEPLOYMENT_CHECKLIST.md
