# Lanonasis MCP Server - Standalone Enterprise Edition

[![MCP Version](https://img.shields.io/badge/MCP-v1.0.0-blue.svg)](https://docs.anthropic.com/claude/docs/mcp)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Memory-aware AI assistant with 17+ enterprise tools for production deployment. Standards-compliant MCP stdio interface with Supabase integration.

## 🚀 Features

### **17+ Production-Ready Tools**
- **Memory Management**: Create, search, update, delete memories with vector embeddings
- **API Key Management**: Enterprise-grade key rotation and access control  
- **System Tools**: Health monitoring, authentication, organization management
- **Project Management**: Multi-tenant project organization
- **Configuration Management**: Dynamic settings and feature flags

### **Enterprise Capabilities** 
- 🔒 **SSL/TLS Security**: Supabase SSL certificate integration
- 📊 **Health Monitoring**: Comprehensive health checks and metrics
- 🔄 **Zero Downtime**: Hot reloads and graceful shutdowns
- 📈 **Scalable**: PM2 process management with auto-restart
- 🌐 **Multi-Protocol**: Stdio, HTTP, WebSocket, Server-Sent Events

## 📋 Quick Start

### **Prerequisites**
- Node.js 18+ 
- PM2 (for production deployment)
- Nginx (for reverse proxy)
- Valid Supabase project

### **Local Development**
```bash
# Clone and setup
git clone https://github.com/lanonasis/onasis-mcp-server.git
cd onasis-mcp-server

# Install dependencies  
npm install

# Configure environment
cp .env.example .env.production
# Edit .env.production with your Supabase credentials

# Start development server
npm run dev

# Test MCP connection
npm run test
```

### **Production Deployment**
```bash
# Deploy to VPS (srv896342.hstgr.cloud)
./scripts/deploy-to-vps.sh

# Deploy with Nginx configuration
./scripts/deploy-to-vps.sh --configure-nginx

# Configure SSL certificate
ssh -p 2222 root@168.231.74.29
certbot --nginx -d mcp.lanonasis.com
```

## 🏗️ Architecture

### **Service Endpoints**
```
🌐 mcp.lanonasis.com
├── /mcp     → Stdio MCP server (port 3001)
├── /sse     → Server-Sent Events (port 3003)  
├── /health  → Health monitoring
└── /ws      → WebSocket (port 3002)
```

### **Directory Structure**
```
lanonasis-mcp-server/
├── src/
│   ├── index.js              # Main stdio MCP server
│   ├── http-bridge.js        # HTTP interface (optional)
│   ├── lib/                  # Shared libraries
│   │   ├── websocket-mcp-handler.js
│   │   └── enhanced-api-gateway.js
│   └── config/
│       └── prod-ca-2021.crt  # Supabase SSL certificate
├── scripts/
│   ├── deploy-to-vps.sh      # Production deployment
│   ├── test-mcp-connection.js
│   └── test-memory-operations.js
├── docs/                     # Documentation
├── ecosystem.config.js       # PM2 configuration
└── package.json             # Dependencies and scripts
```

## 🔧 Configuration

### **Environment Variables**
```bash
# Server Configuration
NODE_ENV=production
PORT=3001
MCP_WS_PORT=3002
MCP_SSE_PORT=3003

# Lanonasis Supabase Integration  
ONASIS_SUPABASE_URL=https://api.lanonasis.com
ONASIS_SUPABASE_ANON_KEY=your_key_here
ONASIS_SUPABASE_SERVICE_KEY=your_service_key_here
SUPABASE_SSL_CERT_PATH=/opt/certs/prod-ca-2021.crt

# Security & Performance
CORS_ORIGINS=https://lanonasis.com,https://mcp.lanonasis.com
MCP_RATE_LIMIT=100
MCP_MAX_CONNECTIONS=1000
```

### **PM2 Configuration**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'lanonasis-mcp-server',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
```

## 🛠️ Available Tools

### **Memory Management (6 tools)**
1. `create_memory` - Create memory with vector embedding
2. `search_memories` - Semantic vector search  
3. `get_memory` - Retrieve specific memory
4. `update_memory` - Update existing memory
5. `delete_memory` - Remove memory
6. `list_memories` - Paginated memory listing

### **API Key Management (4 tools)**
7. `create_api_key` - Generate new API key
8. `list_api_keys` - List active keys
9. `rotate_api_key` - Rotate existing key  
10. `delete_api_key` - Revoke API key

### **System & Health (7 tools)**
11. `get_health_status` - System health check
12. `get_auth_status` - Authentication status
13. `get_organization_info` - Organization details
14. `create_project` - New project creation
15. `list_projects` - Project listing
16. `get_config` - Configuration retrieval
17. `set_config` - Dynamic configuration

## 🧪 Testing & Monitoring

### **Health Checks**
```bash
# Local health check
curl http://localhost:3001/health

# Production health check  
curl https://mcp.lanonasis.com/health

# Response format
{
  "status": "healthy",
  "services": {
    "mcp": "running",
    "supabase": "connected",
    "websocket": "ready"
  },
  "uptime": "24h 15m",
  "version": "1.0.0",
  "tools_count": 17
}
```

### **Performance Monitoring**
```bash
# PM2 monitoring dashboard
pm2 monit

# Service logs
pm2 logs lanonasis-mcp-server

# System metrics
pm2 show lanonasis-mcp-server
```

### **MCP Protocol Testing**
```bash
# Test MCP connection
npm run test

# Test memory operations  
npm run test:memory

# Manual stdio test
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node src/index.js
```

## 🔒 Security Features

### **SSL/TLS Configuration**
- Supabase SSL certificate integration
- TLS 1.2+ enforcement
- HSTS headers
- XSS protection headers

### **Access Control**
- JWT-based authentication
- API key management with rotation
- Rate limiting (100 req/15min)
- CORS policy enforcement

### **Data Protection**
- Environment variable encryption
- Secure secret management  
- Audit logging
- Connection timeout controls

## 📊 Claude Integration

### **MCP Configuration**
```json
{
  "mcpServers": {
    "lanonasis-mcp": {
      "command": "node",
      "args": ["/path/to/lanonasis-mcp-server/src/index.js"],
      "env": {
        "ONASIS_SUPABASE_URL": "https://api.lanonasis.com",
        "ONASIS_SUPABASE_ANON_KEY": "your_key_here"
      }
    }
  }
}
```

### **Remote MCP Connection**
```json
{
  "mcpServers": {
    "lanonasis-mcp-remote": {
      "command": "curl",
      "args": ["-X", "POST", "https://mcp.lanonasis.com/mcp"],
      "env": {
        "AUTHORIZATION": "Bearer your_api_key"
      }
    }
  }
}
```

## 🚀 Deployment Scenarios

### **Development**
```bash
npm run dev  # Local development with hot reload
```

### **Testing**  
```bash
npm run test  # Run all tests
npm run test:memory  # Test memory operations only
```

### **Production**
```bash
./scripts/deploy-to-vps.sh  # Deploy to production VPS
```

### **Docker (Future)**
```bash
docker build -t lanonasis-mcp-server .
docker run -p 3001:3001 lanonasis-mcp-server
```

## 🔄 CI/CD Pipeline

### **GitHub Actions**
```yaml
name: Deploy Lanonasis MCP
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to VPS
        run: ./scripts/deploy-to-vps.sh
```

### **Automated Deployments**
- **Trigger**: Push to main branch
- **Process**: Test → Build → Deploy → Health Check
- **Rollback**: Automatic on failure (< 5 minutes)
- **Notifications**: Slack/Discord integration ready

## 📞 Support & Documentation

### **Resources**
- **Documentation**: `/docs` directory
- **API Reference**: [mcp.lanonasis.com/docs](https://mcp.lanonasis.com/docs)
- **Health Dashboard**: [mcp.lanonasis.com/health](https://mcp.lanonasis.com/health)
- **Issue Tracker**: [GitHub Issues](https://github.com/lanonasis/onasis-mcp-server/issues)

### **Community**
- **Discord**: [Lanonasis Community](https://discord.gg/lanonasis)
- **Docs**: [docs.lanonasis.com](https://docs.lanonasis.com)
- **Status**: [status.lanonasis.com](https://status.lanonasis.com)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🏆 Production Ready Features

✅ **Standards Compliant** - Full MCP protocol support  
✅ **Enterprise Security** - SSL, JWT, rate limiting  
✅ **High Availability** - PM2, health checks, auto-restart  
✅ **Monitoring** - Comprehensive logging and metrics  
✅ **Scalable** - Multi-protocol, load balancer ready  
✅ **Documented** - Complete API documentation  
✅ **Tested** - Unit tests and integration tests  
✅ **Deployable** - One-command production deployment  

**🎯 Ready for Claude integration with 17+ enterprise tools!**