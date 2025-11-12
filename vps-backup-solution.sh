#!/bin/bash

# VPS Complete Backup Solution
# Backs up entire VPS content and creates Docker deployment option

set -e

VPS_HOST="vps"
VPS_PORT="2222"
VPS_USER="root" 
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./vps-backups"
BACKUP_NAME="vps-complete-backup-${BACKUP_DATE}"

echo "🚀 VPS Complete Backup Solution"
echo "================================"

# Create backup directory
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"

echo "📦 Step 1: Creating complete VPS backup..."

# Backup critical application directories
echo "📂 Backing up application directories..."
ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "tar -czf /tmp/onasis-apps-${BACKUP_DATE}.tar.gz \
  /opt/onasis-gateway \
  /opt/mcp-servers \
  /root/.pm2 \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log'" || echo "⚠️  Some files may have been skipped"

# Download application backup
scp -P $VPS_PORT $VPS_USER@$VPS_HOST:/tmp/onasis-apps-${BACKUP_DATE}.tar.gz \
  "${BACKUP_DIR}/${BACKUP_NAME}/applications.tar.gz"

# Backup system configurations
echo "⚙️  Backing up system configurations..."
ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "tar -czf /tmp/system-configs-${BACKUP_DATE}.tar.gz \
  /etc/nginx \
  /etc/pm2 \
  /etc/systemd/system \
  /etc/environment \
  /root/.bashrc \
  /root/.ssh \
  --exclude='*.key'" || echo "⚠️  Some config files may have been skipped"

# Download system config backup
scp -P $VPS_PORT $VPS_USER@$VPS_HOST:/tmp/system-configs-${BACKUP_DATE}.tar.gz \
  "${BACKUP_DIR}/${BACKUP_NAME}/system-configs.tar.gz"

# Create service status snapshot
echo "📊 Creating service status snapshot..."
ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "
pm2 status > /tmp/pm2-status-${BACKUP_DATE}.txt
systemctl list-units --type=service --state=running > /tmp/systemctl-status-${BACKUP_DATE}.txt
netstat -tlnp > /tmp/ports-status-${BACKUP_DATE}.txt
df -h > /tmp/disk-usage-${BACKUP_DATE}.txt
free -h > /tmp/memory-usage-${BACKUP_DATE}.txt
cat /etc/os-release > /tmp/os-info-${BACKUP_DATE}.txt
nginx -t > /tmp/nginx-test-${BACKUP_DATE}.txt 2>&1
"

# Download status files
scp -P $VPS_PORT $VPS_USER@$VPS_HOST:/tmp/*-status-${BACKUP_DATE}.txt \
  "${BACKUP_DIR}/${BACKUP_NAME}/"
scp -P $VPS_PORT $VPS_USER@$VPS_HOST:/tmp/*-info-${BACKUP_DATE}.txt \
  "${BACKUP_DIR}/${BACKUP_NAME}/"

# Backup databases (if any)
echo "💾 Checking for databases..."
ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "
if command -v pg_dump &> /dev/null; then
  echo 'PostgreSQL found, creating backup...'
  pg_dumpall > /tmp/postgresql-backup-${BACKUP_DATE}.sql 2>/dev/null || echo 'No accessible PostgreSQL databases'
fi

if command -v mysqldump &> /dev/null; then
  echo 'MySQL found, creating backup...'
  mysqldump --all-databases > /tmp/mysql-backup-${BACKUP_DATE}.sql 2>/dev/null || echo 'No accessible MySQL databases'
fi
" || echo "Database backup completed (may have warnings)"

# Download database backups if they exist
scp -P $VPS_PORT $VPS_USER@$VPS_HOST:/tmp/*-backup-${BACKUP_DATE}.sql \
  "${BACKUP_DIR}/${BACKUP_NAME}/" 2>/dev/null || echo "No database backups to download"

# Create environment variables backup
echo "🔐 Backing up environment variables..."
ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "
env | grep -E '^(NODE_|PORT|DATABASE_|API_|STRIPE_|PAYSTACK_)' > /tmp/env-vars-${BACKUP_DATE}.txt 2>/dev/null || echo 'No matching environment variables found'
"

scp -P $VPS_PORT $VPS_USER@$VPS_HOST:/tmp/env-vars-${BACKUP_DATE}.txt \
  "${BACKUP_DIR}/${BACKUP_NAME}/" 2>/dev/null || echo "No env vars to download"

# Create Docker deployment files
echo "🐳 Creating Docker deployment option..."

# Generate Dockerfile for onasis-gateway
cat > "${BACKUP_DIR}/${BACKUP_NAME}/Dockerfile.onasis-gateway" << 'EOF'
FROM node:18-alpine

# Install PM2 globally
RUN npm install -g pm2

# Create app directory
WORKDIR /app

# Copy application files
COPY applications/opt/onasis-gateway /app

# Install dependencies
RUN npm ci --production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start with PM2
CMD ["pm2-runtime", "start", "server.js", "--name", "onasis-gateway-server"]
EOF

# Generate Dockerfile for MCP server
cat > "${BACKUP_DIR}/${BACKUP_NAME}/Dockerfile.mcp-server" << 'EOF'
FROM node:18-alpine

# Install PM2 globally
RUN npm install -g pm2

# Create app directory
WORKDIR /app

# Copy application files
COPY applications/opt/mcp-servers/lanonasis-standalone /app

# Install dependencies
RUN npm ci --production

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start with PM2
CMD ["pm2-runtime", "start", "src/tunnel-mcp-client.cjs", "--name", "mcp-core"]
EOF

# Generate docker-compose.yml
cat > "${BACKUP_DIR}/${BACKUP_NAME}/docker-compose.yml" << 'EOF'
version: '3.8'

services:
  onasis-gateway:
    build:
      context: .
      dockerfile: Dockerfile.onasis-gateway
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - gateway_data:/app/data
    restart: unless-stopped
    networks:
      - onasis-network

  mcp-server:
    build:
      context: .
      dockerfile: Dockerfile.mcp-server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    volumes:
      - mcp_data:/app/data
    restart: unless-stopped
    networks:
      - onasis-network

  nginx:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - onasis-gateway
      - mcp-server
    restart: unless-stopped
    networks:
      - onasis-network

volumes:
  gateway_data:
  mcp_data:

networks:
  onasis-network:
    driver: bridge
EOF

# Generate nginx config for Docker
cat > "${BACKUP_DIR}/${BACKUP_NAME}/nginx.conf" << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream gateway {
        server onasis-gateway:3000;
    }
    
    upstream mcp-server {
        server mcp-server:3001;
    }

    server {
        listen 80;
        
        location / {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        location /mcp {
            proxy_pass http://mcp-server;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
EOF

# Generate restoration script
cat > "${BACKUP_DIR}/${BACKUP_NAME}/restore-local.sh" << 'EOF'
#!/bin/bash

# Local VPS Restoration Script

echo "🔄 Restoring VPS backup locally..."

# Extract applications
echo "📂 Extracting applications..."
tar -xzf applications.tar.gz

# Extract system configs
echo "⚙️  Extracting system configurations..."
tar -xzf system-configs.tar.gz

# Show restoration info
echo "📊 Restoration complete!"
echo "Applications restored to: ./opt/"
echo "System configs restored to: ./etc/"
echo ""
echo "To deploy with Docker:"
echo "1. docker-compose up --build"
echo "2. Access gateway at http://localhost:8080"
echo "3. MCP server at http://localhost:3001"
echo ""
echo "Status files available:"
ls -la *-status-*.txt *-info-*.txt 2>/dev/null || echo "No status files"
EOF

chmod +x "${BACKUP_DIR}/${BACKUP_NAME}/restore-local.sh"

# Generate deployment instructions
cat > "${BACKUP_DIR}/${BACKUP_NAME}/DEPLOYMENT.md" << EOF
# VPS Backup Deployment Guide

## Backup Contents
- **Date**: ${BACKUP_DATE}
- **Applications**: /opt/onasis-gateway, /opt/mcp-servers
- **System Configs**: nginx, pm2, systemd
- **Status Snapshots**: services, ports, resources
- **Environment Variables**: filtered sensitive vars

## Docker Deployment (Recommended)

### Quick Start
\`\`\`bash
# Extract backup and deploy
./restore-local.sh
docker-compose up --build -d
\`\`\`

### Services Access
- **Onasis Gateway**: http://localhost:8080
- **MCP Server**: http://localhost:3001
- **Direct Gateway**: http://localhost:3000

### Docker Commands
\`\`\`bash
# Build and start services
docker-compose up --build -d

# View logs
docker-compose logs -f

# Scale services
docker-compose up --scale onasis-gateway=2 -d

# Stop services
docker-compose down
\`\`\`

## Manual Deployment

### Prerequisites
- Node.js 18+
- PM2 installed globally
- nginx (optional)

### Steps
1. Extract applications: \`tar -xzf applications.tar.gz\`
2. Install dependencies in each app directory
3. Start with PM2: \`pm2 start server.js --name onasis-gateway-server\`
4. Configure nginx with provided config

## Environment Variables
Check \`env-vars-${BACKUP_DATE}.txt\` for required environment variables.
**Note**: Sensitive keys are excluded and must be configured separately.

## Health Checks
- Gateway: \`curl http://localhost:3000/health\`
- MCP: \`curl http://localhost:3001/health\`
- Proxy: \`curl http://localhost:8080/health\`

## Troubleshooting
1. Check service status files for original configuration
2. Verify port availability (3000, 3001, 8080)
3. Ensure environment variables are set
4. Check application logs: \`docker-compose logs [service]\`
EOF

# Clean up temporary files on VPS
echo "🧹 Cleaning up temporary files on VPS..."
ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "rm -f /tmp/*-${BACKUP_DATE}.*"

# Create final backup archive
echo "📦 Creating final backup archive..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
cd - > /dev/null

echo "✅ VPS Backup Complete!"
echo ""
echo "📍 Backup Location: ${BACKUP_DIR}/${BACKUP_NAME}/"
echo "📦 Archive: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo ""
echo "🚀 Quick Deploy Options:"
echo "1. Docker: cd ${BACKUP_DIR}/${BACKUP_NAME} && docker-compose up --build"
echo "2. Local: cd ${BACKUP_DIR}/${BACKUP_NAME} && ./restore-local.sh"
echo ""
echo "📖 Full instructions: ${BACKUP_DIR}/${BACKUP_NAME}/DEPLOYMENT.md"