# Lanonasis Multi-Protocol MCP Server - Complete Guide
**Version:** 1.0.0  
**Created:** August 22, 2025  
**Updated:** August 22, 2025  

## 🌟 Overview

The Lanonasis Multi-Protocol MCP Server is a comprehensive, production-ready solution that supports **multiple connection methods** for maximum compatibility and flexibility. Whether you're connecting via Claude Desktop, CLI tools, IDE extensions, MCP Studio, or custom integrations, this server has you covered.

### **🔌 Supported Connection Methods**

| Protocol | Port | Use Case | Status |
|----------|------|----------|---------|
| **Stdio** | N/A | Claude Desktop, CLI tools, Standard MCP | ✅ Ready |
| **HTTP REST** | 3001 | Web apps, API integrations, Postman | ✅ Ready |
| **WebSocket** | 3002 | Real-time apps, Live integrations | ✅ Ready |
| **Server-Sent Events** | 3003 | Live dashboards, Streaming data | ✅ Ready |
| **Netlify Functions** | 443/80 | Serverless, Global CDN | ✅ Ready |

### **🛠️ 17+ Enterprise Tools Available**

#### **Memory Management (6 tools)**
1. `create_memory` - Create memories with vector embeddings
2. `search_memories` - Semantic vector search with AI
3. `get_memory` - Retrieve specific memory by ID
4. `update_memory` - Update existing memory content
5. `delete_memory` - Soft delete memories
6. `list_memories` - Paginated memory listing with filters

#### **API Key Management (4 tools)**  
7. `create_api_key` - Generate secure API keys
8. `list_api_keys` - View API key inventory
9. `rotate_api_key` - Rotate keys for security
10. `delete_api_key` - Revoke API access

#### **System & Organization (7 tools)**
11. `get_health_status` - Comprehensive health checks
12. `get_auth_status` - Authentication information
13. `get_organization_info` - Organization details & usage
14. `create_project` - Project management
15. `list_projects` - Project inventory
16. `get_config` - System configuration
17. `set_config` - Dynamic configuration updates

## 🚀 Quick Start Guide

### **Installation & Setup**

```bash
# Clone the repository
git clone https://github.com/lanonasis/onasis-mcp-server.git
cd onasis-mcp-server

# Install dependencies
npm install

# Configure environment
cp .env.example .env.production
# Edit .env.production with your settings

# Build TypeScript
npm run build

# Development mode (all protocols)
npm run dev

# Production mode (HTTP + WebSocket + SSE)
npm start

# Stdio only (for Claude Desktop)
npm run start:stdio
```

### **Environment Configuration**

```bash
# Server Configuration
NODE_ENV=production
PORT=3001                    # HTTP server port
MCP_WS_PORT=3002            # WebSocket port
MCP_SSE_PORT=3003           # Server-Sent Events port
MCP_HOST=0.0.0.0            # Bind address

# Protocol Toggles
ENABLE_HTTP=true            # Enable HTTP REST API
ENABLE_WEBSOCKET=true       # Enable WebSocket support
ENABLE_SSE=true             # Enable Server-Sent Events
ENABLE_STDIO=false          # Enable stdio (for PM2, use separate process)

# Supabase Configuration
ONASIS_SUPABASE_URL=https://api.lanonasis.com
ONASIS_SUPABASE_SERVICE_KEY=your_service_key_here
SUPABASE_SSL_CERT_PATH=/opt/certs/prod-ca-2021.crt

# OpenAI Configuration (for embeddings)
OPENAI_API_KEY=your_openai_key_here

# Security & Performance
CORS_ORIGINS=https://lanonasis.com,https://mcp.lanonasis.com
MCP_RATE_LIMIT=100          # Requests per 15min window
MCP_MAX_CONNECTIONS=1000    # Max concurrent connections
JWT_SECRET=your_jwt_secret_here
```

## 📡 Connection Methods

### **1. Stdio (Claude Desktop Integration)**

**Best for:** Claude Desktop, CLI tools, Standard MCP implementations

```bash
# Start stdio server
npm run start:stdio

# Test with MCP protocol
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run start:stdio
```

**Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "lanonasis-mcp": {
      "command": "node",
      "args": ["/path/to/onasis-mcp-server/dist/unified-mcp-server.js", "--stdio"],
      "env": {
        "ONASIS_SUPABASE_URL": "https://api.lanonasis.com"
      }
    }
  }
}
```

### **2. HTTP REST API**

**Best for:** Web applications, Postman, API integrations, MCP Studio

```bash
# Start HTTP server
npm run start:http

# List all tools
curl -X GET https://mcp.lanonasis.com/api/v1/tools

# Execute a tool
curl -X POST https://mcp.lanonasis.com/api/v1/tools/search_memories \
  -H "Content-Type: application/json" \
  -d '{"query": "typescript tutorial", "limit": 5}'

# Health check
curl -X GET https://mcp.lanonasis.com/health
```

**API Endpoints:**
- `GET /health` - Health status
- `GET /api/v1/tools` - List available tools
- `POST /api/v1/tools/:toolName` - Execute specific tool
- `POST /api/v1/mcp/message` - MCP protocol over HTTP

### **3. WebSocket (Real-time)**

**Best for:** Real-time applications, Live integrations, Interactive dashboards

```javascript
// Connect to WebSocket
const ws = new WebSocket('wss://mcp.lanonasis.com:3002');

// List tools
ws.send(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list'
}));

// Execute tool
ws.send(JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'search_memories',
    arguments: { query: 'machine learning', limit: 3 }
  }
}));

// Handle responses
ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log('MCP Response:', response);
};
```

### **4. Server-Sent Events (Live Streaming)**

**Best for:** Live dashboards, Real-time notifications, Streaming data

```javascript
// Connect to SSE endpoint
const eventSource = new EventSource('https://mcp.lanonasis.com:3003/sse');

// Listen for events
eventSource.addEventListener('connected', (event) => {
  console.log('Connected:', JSON.parse(event.data));
});

eventSource.addEventListener('tools', (event) => {
  const tools = JSON.parse(event.data);
  console.log('Available tools:', tools);
});

eventSource.addEventListener('tool_result', (event) => {
  const result = JSON.parse(event.data);
  console.log('Tool result:', result);
});

// Execute tool via HTTP (broadcasts to all SSE clients)
fetch('https://mcp.lanonasis.com:3003/sse/tool/search_memories?query=nodejs&limit=3')
  .then(response => response.json())
  .then(data => console.log(data));
```

### **5. Netlify Functions (Global CDN)**

**Best for:** Global distribution, Serverless, Authentication flows

```javascript
// Authentication endpoint
const response = await fetch('https://mcp.lanonasis.com/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'secure_password',
    client_id: 'my_app'
  })
});

// SSE proxy endpoint
const eventSource = new EventSource('https://mcp.lanonasis.com/sse');
```

## 🏭 Production Deployment

### **VPS Deployment (Recommended)**

```bash
# Deploy to production VPS
./scripts/deploy-to-vps.sh --configure-nginx

# Test deployment
./scripts/test-deployment.sh

# Check services
pm2 status
pm2 logs lanonasis-mcp-server
```

### **PM2 Process Management**

```bash
# Start all services
pm2 start ecosystem.config.js

# Individual service control
pm2 start lanonasis-mcp-server    # HTTP + WS + SSE
pm2 start lanonasis-mcp-stdio     # Stdio only

# Monitoring
pm2 monit
pm2 show lanonasis-mcp-server
```

### **Nginx Configuration**

```nginx
# /etc/nginx/sites-available/mcp.lanonasis.com
server {
    listen 443 ssl http2;
    server_name mcp.lanonasis.com;
    
    ssl_certificate /etc/letsencrypt/live/mcp.lanonasis.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.lanonasis.com/privkey.pem;
    
    # HTTP API (port 3001)
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
    }
    
    # WebSocket (port 3002)
    location /ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    # Server-Sent Events (port 3003)
    location /sse {
        proxy_pass http://127.0.0.1:3003/sse;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # SSE-specific
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
}
```

## 🧪 Testing & Validation

### **Health Checks**

```bash
# Check all services
curl -s https://mcp.lanonasis.com/health | jq

# Expected response
{
  "status": "healthy",
  "version": "1.0.0",
  "server_info": {
    "name": "lanonasis-mcp-server",
    "protocols": {
      "stdio": false,
      "http": 3001,
      "websocket": 3002, 
      "sse": 3003
    },
    "tools_count": 17
  },
  "services": {
    "supabase": "connected",
    "openai": "configured"
  }
}
```

### **Tool Testing**

```bash
# Test memory creation
curl -X POST https://mcp.lanonasis.com/api/v1/tools/create_memory \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Memory",
    "content": "This is a test memory for validation",
    "memory_type": "knowledge",
    "tags": ["test", "validation"]
  }' | jq

# Test semantic search
curl -X POST https://mcp.lanonasis.com/api/v1/tools/search_memories \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test validation",
    "limit": 5,
    "threshold": 0.7
  }' | jq
```

### **Protocol Testing**

```bash
# Test stdio protocol
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node dist/unified-mcp-server.js --stdio

# Test WebSocket
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3002');
ws.on('open', () => {
  ws.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}));
});
ws.on('message', (data) => {
  console.log(JSON.parse(data));
  ws.close();
});
"

# Test SSE
curl -N https://mcp.lanonasis.com:3003/sse
```

## 🔧 Development & Customization

### **Development Commands**

```bash
# Development with hot reload
npm run dev                 # All protocols
npm run dev:stdio          # Stdio only  
npm run dev:http           # HTTP only

# Building
npm run build              # Compile TypeScript
npm run type-check         # Type checking only

# Testing
npm run test               # Unit tests
npm run test:connection    # Connection tests
npm run test:memory        # Memory operations
npm run test:coverage      # Coverage report

# Code quality
npm run lint               # ESLint check
npm run lint:fix           # Auto-fix issues
```

### **Adding New Tools**

```typescript
// Add to src/unified-mcp-server.ts

// 1. Add tool handler to initializeTools()
initializeTools() {
  return {
    // ... existing tools
    my_new_tool: this.myNewToolHandler.bind(this),
  };
}

// 2. Add tool definition to getToolDefinitions()
{
  name: 'my_new_tool',
  description: 'Description of what the tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  }
}

// 3. Implement the handler
async myNewToolHandler(args) {
  try {
    // Tool logic here
    return {
      success: true,
      result: 'Tool result'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### **Custom Protocol Support**

```typescript
// Add new protocol in startUnifiedServer()
async startUnifiedServer() {
  const startTasks = [];
  
  // Add your custom protocol
  if (this.config.enableCustom) {
    startTasks.push(this.startCustomServer());
  }
  
  await Promise.all(startTasks);
}

async startCustomServer() {
  // Implement custom protocol server
}
```

## 🔐 Security Features

### **Authentication & Authorization**
- JWT-based authentication with configurable expiry
- API key management with rotation capabilities  
- Role-based access control (admin, user, viewer)
- Rate limiting to prevent abuse (100 req/15min default)

### **Data Protection**
- TLS/SSL encryption for all HTTP/WebSocket connections
- Supabase SSL certificate integration
- Input validation with Zod schemas
- Sanitized error messages (no sensitive data exposure)

### **Network Security**
- CORS policy enforcement with configurable origins
- Security headers via Helmet.js
- Request logging for audit trails
- Connection timeout controls

## 📊 Monitoring & Observability

### **Health Monitoring**
```bash
# Basic health check
curl https://mcp.lanonasis.com/health

# Detailed health with metrics
curl -X POST https://mcp.lanonasis.com/api/v1/tools/get_health_status \
  -H "Content-Type: application/json" \
  -d '{"include_metrics": true}'
```

### **Logs & Metrics**
```bash
# PM2 logs
pm2 logs lanonasis-mcp-server
pm2 logs lanonasis-mcp-stdio

# System metrics
pm2 monit

# Log files
tail -f /var/log/pm2/lanonasis-mcp-combined.log
```

### **Performance Monitoring**
- Memory usage tracking with automatic restarts
- Connection count monitoring
- Request rate monitoring
- Database query performance tracking

## 🤝 Integration Examples

### **Claude Desktop**
```json
{
  "mcpServers": {
    "lanonasis": {
      "command": "node",
      "args": ["/opt/mcp-servers/lanonasis-standalone/current/dist/unified-mcp-server.js", "--stdio"]
    }
  }
}
```

### **MCP Studio**
```bash
# Start HTTP server for MCP Studio
npm run studio

# Configure MCP Studio to connect to:
# http://localhost:3001/api/v1/mcp/message
```

### **Custom Applications**
```javascript
// React/Vue.js integration
const mcpClient = {
  async callTool(name, args) {
    const response = await fetch(`https://mcp.lanonasis.com/api/v1/tools/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    return response.json();
  }
};

// Usage
const memories = await mcpClient.callTool('search_memories', {
  query: 'react hooks tutorial',
  limit: 5
});
```

### **CLI Integration**
```bash
# Install Lanonasis CLI
npm install -g @lanonasis/cli

# Configure
memory config set apiUrl https://mcp.lanonasis.com
memory config set apiKey your_api_key

# Use tools
memory search "javascript tutorial"
memory create -t "My Note" -c "Content here"
```

## 📈 Scaling & Performance

### **Horizontal Scaling**
```bash
# Multiple instances with PM2
pm2 start ecosystem.config.js -i 4  # 4 instances

# Load balancer configuration (Nginx)
upstream mcp_backend {
  server 127.0.0.1:3001;
  server 127.0.0.1:3004;
  server 127.0.0.1:3005;
  server 127.0.0.1:3006;
}
```

### **Performance Tuning**
```bash
# Environment variables for performance
MCP_MAX_CONNECTIONS=2000     # Increase connection limit
MCP_RATE_LIMIT=200          # Increase rate limit
NODE_OPTIONS="--max-old-space-size=2048"  # Increase memory
```

### **Caching Strategy**
- In-memory caching for frequently accessed data
- Redis integration ready (optional)
- CDN caching for static responses
- Database query optimization

## 🔄 CI/CD Pipeline

### **GitHub Actions**
```yaml
name: Deploy Lanonasis MCP Server
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
      - name: Build TypeScript
        run: npm run build
      - name: Deploy to VPS
        run: ./scripts/deploy-to-vps.sh
        env:
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## 🎯 Use Cases

### **1. AI Assistant Integration**
- **Claude Desktop**: Direct stdio integration
- **ChatGPT**: HTTP API integration  
- **Custom AI Apps**: WebSocket for real-time

### **2. Development Tools**
- **VSCode Extension**: HTTP API calls
- **CLI Tools**: Stdio or HTTP depending on use case
- **IDE Integrations**: Various protocols supported

### **3. Web Applications**
- **Frontend Apps**: HTTP REST API
- **Real-time Dashboards**: WebSocket or SSE
- **Static Sites**: Netlify Functions integration

### **4. Enterprise Systems**
- **Microservices**: HTTP API integration
- **Event-driven Architecture**: WebSocket notifications
- **Analytics Platforms**: SSE for live data streaming

## 🆘 Troubleshooting

### **Common Issues**

**Connection Refused**
```bash
# Check if services are running
pm2 status

# Check ports
lsof -i :3001
lsof -i :3002
lsof -i :3003

# Restart services
pm2 restart lanonasis-mcp-server
```

**SSL Certificate Issues**
```bash
# Check certificate
openssl x509 -in /opt/certs/prod-ca-2021.crt -text -noout

# Update certificate path
export SUPABASE_SSL_CERT_PATH=/opt/certs/prod-ca-2021.crt
```

**Memory/Performance Issues**
```bash
# Check memory usage
pm2 show lanonasis-mcp-server

# Increase memory limit
pm2 restart lanonasis-mcp-server --max-memory-restart 2G
```

### **Debug Mode**
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Check logs
tail -f logs/lanonasis-mcp.log
```

## 📞 Support & Resources

### **Documentation**
- **API Reference**: `https://mcp.lanonasis.com/docs`
- **Health Dashboard**: `https://mcp.lanonasis.com/health`
- **GitHub Repository**: `https://github.com/lanonasis/onasis-mcp-server`

### **Community**
- **Discord**: [Lanonasis Community](https://discord.gg/lanonasis)
- **Issues**: [GitHub Issues](https://github.com/lanonasis/onasis-mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/lanonasis/onasis-mcp-server/discussions)

---

## 🏆 Production Ready Checklist

- ✅ **Standards Compliant** - Full MCP protocol support
- ✅ **Multi-Protocol** - Stdio, HTTP, WebSocket, SSE, Netlify
- ✅ **17+ Enterprise Tools** - Complete memory & API management  
- ✅ **Production Security** - SSL, JWT, rate limiting, validation
- ✅ **High Availability** - PM2, auto-restart, health monitoring
- ✅ **Scalable Architecture** - Horizontal scaling ready
- ✅ **Complete Documentation** - API docs, guides, examples
- ✅ **CI/CD Ready** - Automated testing and deployment
- ✅ **Monitoring & Observability** - Logs, metrics, health checks
- ✅ **Enterprise Features** - Multi-tenant, role-based access

**🎉 Your unified MCP server is production-ready with support for ALL connection methods!**