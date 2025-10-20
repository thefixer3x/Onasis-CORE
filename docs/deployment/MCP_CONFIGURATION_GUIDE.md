# MCP Configuration Guide - Onasis-CORE

**Created:** August 21, 2025  
**Version:** 1.0  
**Last Updated:** August 21, 2025

## Overview

Onasis-CORE provides a comprehensive Model Context Protocol (MCP) server implementation that serves as a multi-vendor gateway for Memory as a Service (MaaS) and other AI-powered tools. This guide provides complete configuration instructions for both local development and production deployment.

## Architecture Overview

### MCP Server Components
- **WebSocket MCP Handler:** Primary MCP server at `ws://localhost:9083/mcp`
- **Stdio MCP Server:** Claude Desktop integration interface
- **External MCP Client:** Reusable JavaScript library for vendor integration
- **Memory Service Backend:** Vector-based memory storage via lanonasis-maas

### Available Tools (17 Total)
```
Memory Management (6 tools):
├── create_memory - Create new memory with vector embedding
├── search_memories - Semantic vector search
├── get_memory - Retrieve memory by ID
├── update_memory - Update existing memory
├── delete_memory - Delete memory by ID
└── list_memories - List with pagination/filters

API Key Management (4 tools):
├── create_api_key - Generate new API keys
├── list_api_keys - List available keys
├── rotate_api_key - Rotate existing key
└── delete_api_key - Revoke API key

System Tools (7 tools):
├── get_health_status - System health check
├── get_auth_status - Authentication status
├── get_organization_info - Organization details
├── create_project - Create new project
├── list_projects - List available projects
├── get_config - Retrieve configuration
└── set_config - Update configuration
```

## Quick Start Configuration

### 1. Environment Setup

Create or update `.env` file:

```bash
# MCP Server Configuration
MCP_SERVER_PORT=9083
MCP_WEBSOCKET_PATH=/mcp
MCP_CORS_ORIGINS=localhost:3000,localhost:5173,localhost:8080

# Memory Service Integration
MEMORY_SERVICE_URL=https://mcp.lanonasis.com
MEMORY_SERVICE_API_KEY=your_api_key_here

# Database Configuration (Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# Authentication
AUTH_GATEWAY_URL=https://api.lanonasis.com
SERVICE_ID=onasis-core

# Logging
LOG_LEVEL=info
```

### 2. Start MCP Server

```bash
# Production deployment
npm run mcp:server

# Development with auto-restart
npm run mcp:dev

# Test connection
npm run mcp:test
```

### 3. Verify Installation

```bash
# Test WebSocket connection
node test-mcp-connection.js

# Test all 17 tools
node test-mcp-comprehensive.js

# Test external client
node test-external-client.js
```

## Integration Methods

### Method 1: Claude Desktop Integration

#### Configuration File
Add to Claude Desktop settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "onasis": {
      "command": "node",
      "args": ["/path/to/Onasis-CORE/stdio-mcp-server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Command Line Registration
```bash
# Register with Claude Desktop
claude mcp add-json onasis '{
  "command": "node",
  "args": ["/absolute/path/to/Onasis-CORE/stdio-mcp-server.js"],
  "env": {
    "NODE_ENV": "production"
  }
}'

# Verify registration
claude mcp list
```

#### Key Files Referenced:
- **Primary:** `/stdio-mcp-server.js` - Main MCP interface
- **Backend:** `/services/websocket-mcp-handler.js` - Tool implementations
- **Client:** `/external-mcp-client.js` - External integration library

### Method 2: WebSocket Direct Connection

#### JavaScript/Node.js Client
```javascript
import OnasisMCPClient from './external-mcp-client.js';

const client = new OnasisMCPClient('ws://localhost:9083/mcp');

async function useMemoryService() {
  try {
    await client.connect();
    
    // Create memory
    const memory = await client.createMemory(
      'Project Documentation',
      'This is important project context...',
      { memory_type: 'project', tags: ['docs', 'api'] }
    );
    
    // Search memories
    const results = await client.searchMemories('project context');
    
    // Get specific memory
    const retrieved = await client.getMemory(memory.id);
    
  } finally {
    client.close();
  }
}
```

#### Python Client
```python
import asyncio
import websockets
import json

async def connect_to_onasis():
    uri = "ws://localhost:9083/mcp"
    
    async with websockets.connect(uri) as websocket:
        # Initialize MCP connection
        init_msg = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "python-client",
                    "version": "1.0.0"
                }
            }
        }
        
        await websocket.send(json.dumps(init_msg))
        response = await websocket.recv()
        print("Connected:", json.loads(response))
        
        # List available tools
        tools_msg = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list"
        }
        
        await websocket.send(json.dumps(tools_msg))
        tools_response = await websocket.recv()
        print("Available tools:", json.loads(tools_response))

asyncio.run(connect_to_onasis())
```

### Method 3: REST API Proxy Integration

#### Frontend Integration (React/Next.js)
```typescript
// lib/onasis-client.ts
export class OnasisClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: { baseUrl: string; apiKey?: string }) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  async createMemory(data: {
    title: string;
    content: string;
    memory_type?: string;
    tags?: string[];
  }) {
    const response = await fetch(`${this.baseUrl}/api/memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'X-API-Key': this.apiKey })
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Failed to create memory: ${response.statusText}`);
    }

    return response.json();
  }

  async searchMemories(query: string, options?: {
    limit?: number;
    threshold?: number;
    memory_type?: string;
  }) {
    const params = new URLSearchParams({
      query,
      ...options && Object.fromEntries(
        Object.entries(options).map(([k, v]) => [k, String(v)])
      )
    });

    const response = await fetch(`${this.baseUrl}/api/memory/search?${params}`);
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// Usage
const client = new OnasisClient({
  baseUrl: process.env.NEXT_PUBLIC_ONASIS_URL || 'https://mcp.lanonasis.com',
  apiKey: process.env.NEXT_PUBLIC_API_KEY
});
```

## Configuration Reference

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MCP_SERVER_PORT` | WebSocket server port | `9083` | No |
| `MCP_WEBSOCKET_PATH` | WebSocket endpoint path | `/mcp` | No |
| `MCP_CORS_ORIGINS` | Allowed CORS origins | `localhost:3000` | No |
| `MEMORY_SERVICE_URL` | Backend memory service | - | Yes |
| `MEMORY_SERVICE_API_KEY` | Service authentication | - | Yes |
| `SUPABASE_URL` | Database connection | - | Yes |
| `SUPABASE_SERVICE_KEY` | Database service key | - | Yes |
| `AUTH_GATEWAY_URL` | Central auth service | - | No |
| `SERVICE_ID` | Service identifier | `onasis-core` | No |
| `LOG_LEVEL` | Logging verbosity | `info` | No |

### Connection Endpoints

#### Development (Local)
- **WebSocket:** `ws://localhost:9083/mcp`
- **HTTP Proxy:** `http://localhost:9083/api/*`
- **Health Check:** `http://localhost:9083/health`

#### Production
- **WebSocket:** `wss://mcp.lanonasis.com/mcp`
- **HTTP API:** `https://mcp.lanonasis.com/api/*`
- **Health Check:** `https://mcp.lanonasis.com/health`

### Tool Schemas

#### Memory Management Tools

**create_memory**
```json
{
  "name": "create_memory",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Memory title" },
      "content": { "type": "string", "description": "Memory content" },
      "memory_type": { 
        "type": "string", 
        "enum": ["context", "project", "knowledge", "reference", "personal", "workflow"],
        "default": "knowledge"
      },
      "tags": { 
        "type": "array", 
        "items": { "type": "string" },
        "description": "Memory tags for categorization"
      },
      "topic_id": { 
        "type": "string", 
        "description": "Topic ID for organization"
      }
    },
    "required": ["title", "content"]
  }
}
```

**search_memories**
```json
{
  "name": "search_memories",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search query" },
      "limit": { "type": "number", "default": 10, "maximum": 100 },
      "threshold": { "type": "number", "default": 0.7, "minimum": 0, "maximum": 1 },
      "memory_type": { "type": "string", "description": "Filter by memory type" },
      "tags": { 
        "type": "array", 
        "items": { "type": "string" },
        "description": "Filter by tags"
      }
    },
    "required": ["query"]
  }
}
```

#### API Key Management Tools

**create_api_key**
```json
{
  "name": "create_api_key",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "API key name" },
      "description": { "type": "string", "description": "Key description" },
      "access_level": { 
        "type": "string", 
        "enum": ["public", "authenticated", "team", "admin", "enterprise"],
        "default": "authenticated"
      },
      "expires_in_days": { "type": "number", "default": 365 },
      "project_id": { "type": "string", "description": "Associated project" }
    },
    "required": ["name"]
  }
}
```

## Security Configuration

### Authentication Integration

When using with the existing Central Auth system:

```javascript
// Middleware for authenticated MCP connections
const authenticateWebSocket = async (info) => {
  const token = info.req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    // Allow unauthenticated for development
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    return false;
  }

  try {
    const response = await fetch(`${process.env.AUTH_GATEWAY_URL}/v1/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return false;
  }
};
```

### CORS Configuration

```javascript
// services/websocket-mcp-handler.js
const corsOrigins = process.env.MCP_CORS_ORIGINS?.split(',') || [
  'localhost:3000',
  'localhost:5173', 
  'localhost:8080'
];

const verifyClient = (info) => {
  const origin = info.origin;
  const isAllowed = corsOrigins.some(allowed => 
    origin?.includes(allowed) || allowed === '*'
  );
  
  return isAllowed;
};
```

## Testing and Validation

### Comprehensive Test Suite

```bash
# Test all tools functionality
npm run test:mcp:comprehensive

# Test connection stability
npm run test:mcp:stress

# Test authentication flow
npm run test:mcp:auth

# Test memory operations
npm run test:mcp:memory
```

### Manual Testing Scripts

**Basic Connection Test:**
```javascript
// test-mcp-basic.js
import OnasisMCPClient from './external-mcp-client.js';

async function testBasicConnection() {
  const client = new OnasisMCPClient('ws://localhost:9083/mcp');
  
  try {
    console.log('🔗 Testing basic connection...');
    await client.connect();
    console.log('✅ Connected successfully');
    
    const tools = await client.listTools();
    console.log(`✅ Found ${tools.length} tools`);
    
    const health = await client.getHealthStatus();
    console.log('✅ Health check:', health.status);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    client.close();
  }
}

testBasicConnection();
```

**Memory Operations Test:**
```javascript
// test-mcp-memory.js
import OnasisMCPClient from './external-mcp-client.js';

async function testMemoryOperations() {
  const client = new OnasisMCPClient('ws://localhost:9083/mcp');
  
  try {
    await client.connect();
    
    // Create
    const memory = await client.createMemory(
      'Test Memory',
      'This is a test memory for validation'
    );
    console.log('✅ Created memory:', memory.id);
    
    // Search
    const results = await client.searchMemories('test memory');
    console.log('✅ Search results:', results.length);
    
    // Retrieve
    const retrieved = await client.getMemory(memory.id);
    console.log('✅ Retrieved memory:', retrieved.title);
    
    // Update
    const updated = await client.updateMemory(memory.id, {
      title: 'Updated Test Memory'
    });
    console.log('✅ Updated memory');
    
    // Delete
    await client.deleteMemory(memory.id);
    console.log('✅ Deleted memory');
    
  } catch (error) {
    console.error('❌ Memory test failed:', error.message);
  } finally {
    client.close();
  }
}

testMemoryOperations();
```

## Troubleshooting

### Common Issues

**1. Connection Refused**
```bash
# Check if server is running
lsof -i :9083

# Restart server
npm run mcp:restart

# Check logs
tail -f logs/mcp-server.log
```

**2. Authentication Failures**
- Verify `MEMORY_SERVICE_API_KEY` is correct
- Check `AUTH_GATEWAY_URL` accessibility
- Ensure proper CORS configuration

**3. Tool Not Found Errors**
- Verify all 17 tools are loaded: `npm run mcp:list-tools`
- Check backend service connectivity
- Review WebSocket connection logs

**4. Memory Service Issues**
- Test Supabase connectivity: `npm run test:db`
- Verify vector extension: `SELECT * FROM pg_extension WHERE extname = 'vector';`
- Check memory service logs

### Debugging

**Enable Debug Logging:**
```bash
export LOG_LEVEL=debug
export DEBUG=mcp:*
npm run mcp:server
```

**WebSocket Connection Debug:**
```javascript
// Enable WebSocket debugging
const client = new OnasisMCPClient('ws://localhost:9083/mcp', {
  debug: true,
  reconnect: true,
  timeout: 10000
});
```

## Performance Optimization

### Connection Pooling
```javascript
// For high-throughput applications
class OnasisMCPPool {
  constructor(url, poolSize = 5) {
    this.url = url;
    this.pool = [];
    this.poolSize = poolSize;
  }

  async getConnection() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }

    const client = new OnasisMCPClient(this.url);
    await client.connect();
    return client;
  }

  releaseConnection(client) {
    if (this.pool.length < this.poolSize) {
      this.pool.push(client);
    } else {
      client.close();
    }
  }
}
```

### Batch Operations
```javascript
// Batch memory operations for efficiency
async function batchCreateMemories(memories) {
  const client = new OnasisMCPClient('ws://localhost:9083/mcp');
  await client.connect();

  try {
    const results = await Promise.all(
      memories.map(memory => client.createMemory(memory.title, memory.content))
    );
    return results;
  } finally {
    client.close();
  }
}
```

## File References

### Core Implementation Files
- **`/stdio-mcp-server.js`** - Main Claude Desktop integration interface
- **`/services/websocket-mcp-handler.js`** - Primary MCP server implementation
- **`/external-mcp-client.js`** - Reusable JavaScript client library
- **`/deploy/mcp-server.js`** - Production deployment script

### Configuration Files
- **`/.env`** - Environment configuration
- **`/package.json`** - Scripts and dependencies
- **`/docker-compose.yml`** - Container deployment

### Test Files
- **`/test-mcp-connection.js`** - Basic connection test
- **`/test-mcp-comprehensive.js`** - All tools functionality test
- **`/test-external-client.js`** - External client validation
- **`/test-retrieve-memory.js`** - Memory operations test

### Documentation Files
- **`/MCP_SERVER_CHECKPOINT.md`** - Development checkpoint
- **`/INTEGRATION_GUIDE.md`** - Service integration guide
- **`/CENTRAL_AUTH_INTEGRATION_GUIDE.md`** - Authentication integration

## Production Deployment

### Docker Configuration
```dockerfile
# Dockerfile.mcp
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 9083
CMD ["node", "deploy/mcp-server.js"]
```

### Docker Compose
```yaml
# docker-compose.mcp.yml
version: '3.8'
services:
  onasis-mcp:
    build:
      context: .
      dockerfile: Dockerfile.mcp
    ports:
      - "9083:9083"
    environment:
      - NODE_ENV=production
      - MCP_SERVER_PORT=9083
      - MEMORY_SERVICE_URL=${MEMORY_SERVICE_URL}
      - MEMORY_SERVICE_API_KEY=${MEMORY_SERVICE_API_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9083/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Process Management
```bash
# Using PM2 for production
pm2 start deploy/mcp-server.js --name onasis-mcp
pm2 save
pm2 startup

# Monitor
pm2 logs onasis-mcp
pm2 status
```

## Support and Updates

- **Issues:** Report to Onasis-CORE repository issues
- **Documentation:** This guide will be updated with new features
- **Examples:** Reference implementation in `/test-*.js` files
- **Integration Support:** See `CENTRAL_AUTH_INTEGRATION_GUIDE.md` for auth integration

---

**Generated:** August 21, 2025  
**MCP Protocol Version:** 2024-11-05  
**Onasis-CORE Version:** 1.0.0  
**Tools Available:** 17 (Memory: 6, API Keys: 4, System: 7)