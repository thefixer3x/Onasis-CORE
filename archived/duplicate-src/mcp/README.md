# MCP (Model Context Protocol) Server

## Overview

The Onasis MCP server provides real-time SSE (Server-Sent Events) streaming for AI agent integration, following industry standards similar to Vercel MCP and Netlify MCP.

**Production Endpoint**: `https://mcp.lanonasis.com/sse`

## Features

- **Real-time SSE streaming** for bidirectional communication
- **Built-in tools** for memory service and API key management  
- **Authentication** via vendor API keys
- **Multi-tenant support** with organization isolation
- **Automatic reconnection** with exponential backoff
- **Health monitoring** with heartbeat/ping-pong
- **REST API fallback** for direct HTTP access

## Endpoints

### SSE Streaming
- `GET /mcp/sse` - Main SSE endpoint for real-time communication
- Headers required:
  - `X-API-Key`: Your API key
  - `X-Client-Id`: Unique client identifier (optional)
  - `X-MCP-Capabilities`: Comma-separated capabilities (optional)

### REST Endpoints
- `POST /mcp/message` - Send messages to SSE connection
- `GET /mcp/health` - Health check
- `GET /mcp/tools` - List available MCP tools

### Memory Service (via MCP or REST)
- `memory_create` - Create new memory with vector embedding
- `memory_search` - Semantic vector search
- `memory_list` - List memories with filters
- `GET /mcp/memory/:id` - Get specific memory
- `PUT /mcp/memory/:id` - Update memory
- `DELETE /mcp/memory/:id` - Delete memory

### API Key Management
- `api_key_create` - Create new API key
- `GET /mcp/api-keys` - List API keys
- `POST /mcp/api-keys/:id/rotate` - Rotate API key
- `DELETE /mcp/api-keys/:id` - Delete API key

## Client Usage

### JavaScript/TypeScript Client

```typescript
import { MCPClient } from '@lanonasis/mcp-client';

// Create client
const client = new MCPClient({
  endpoint: 'https://mcp.lanonasis.com',
  apiKey: 'your-api-key',
  capabilities: ['memory', 'api_keys']
});

// Connect to SSE
await client.connect();

// Listen for events
client.on('ready', (info) => {
  console.log('Connected:', info);
});

client.on('notification', (event) => {
  console.log('Notification:', event);
});

// Use tools
const memory = await client.createMemory({
  title: 'Important Note',
  content: 'This is a test memory',
  type: 'context',
  tags: ['test', 'demo']
});

const results = await client.searchMemory({
  query: 'test memory',
  limit: 10,
  threshold: 0.7
});
```

### REST API Usage

```typescript
import { MCPRestAPI } from '@lanonasis/mcp-client';

const api = new MCPRestAPI({
  endpoint: 'https://api.lanonasis.com/mcp',
  apiKey: 'your-api-key'
});

// Create memory
const memory = await api.createMemory({
  title: 'Note',
  content: 'Content here',
  type: 'knowledge'
});

// Search memories
const results = await api.searchMemory({
  query: 'search term',
  limit: 20
});
```

### CLI Integration

The CLI v1.5.1 automatically uses the MCP endpoint when configured:

```bash
# Configure CLI to use MCP
memory config set apiUrl https://mcp.lanonasis.com

# Use memory commands (automatically uses MCP)
memory create -t "Title" -c "Content"
memory search "query"
```

### cURL Examples

```bash
# Connect to SSE stream
curl -N -H "X-API-Key: your-api-key" \
  https://mcp.lanonasis.com/sse

# Send message to connection
curl -X POST https://mcp.lanonasis.com/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "connectionId": "your-connection-id",
    "message": {
      "id": "msg-123",
      "type": "request",
      "method": "memory_search",
      "params": {
        "query": "test"
      }
    }
  }'

# List available tools
curl https://mcp.lanonasis.com/tools \
  -H "X-API-Key: your-api-key"
```

## Protocol Specification

### Message Format

All messages follow this structure:

```typescript
interface MCPMessage {
  id: string;          // Unique message ID
  type: 'request' | 'response' | 'notification' | 'error';
  method?: string;     // Tool/method name for requests
  params?: any;        // Parameters for the method
  result?: any;        // Result for responses
  error?: {           // Error details
    code: number;
    message: string;
    data?: any;
  };
  timestamp: string;   // ISO 8601 timestamp
}
```

### Connection Flow

1. **Client connects** to SSE endpoint with API key
2. **Server validates** API key and creates connection
3. **Server sends** `connection.established` notification
4. **Client sends** requests via POST to `/mcp/message`
5. **Server streams** responses back via SSE
6. **Heartbeat** ping/pong maintains connection

### Error Codes

- `-32600` - Invalid request
- `-32601` - Method not found
- `-32602` - Invalid params
- `-32603` - Internal error
- `-32700` - Parse error

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "run", "mcp:start"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
      - name: mcp
        image: lanonasis/mcp-server:latest
        ports:
        - containerPort: 3001
        env:
        - name: SUPABASE_URL=https://<project-ref>.supabase.co
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: supabase-url
        - name: SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: supabase-key
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-service
spec:
  selector:
    app: mcp-server
  ports:
  - port: 80
    targetPort: 3001
  type: LoadBalancer
```

### Nginx Configuration

```nginx
# mcp.lanonasis.com
server {
    listen 443 ssl http2;
    server_name mcp.lanonasis.com;

    ssl_certificate /etc/ssl/certs/lanonasis.com.crt;
    ssl_certificate_key /etc/ssl/private/lanonasis.com.key;

    # SSE specific settings
    location /sse {
        proxy_pass http://mcp-backend/mcp/sse;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        
        # SSE specific
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        keepalive_timeout 86400s;
        
        # Disable buffering for SSE
        proxy_set_header X-Accel-Buffering no;
        
        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Headers "Content-Type, X-API-Key";
    }

    # Regular HTTP endpoints
    location / {
        proxy_pass http://mcp-backend;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}

upstream mcp-backend {
    least_conn;
    server mcp-server-1:3001;
    server mcp-server-2:3001;
    server mcp-server-3:3001;
}
```

## Environment Variables

```bash
# Required
https://<project-ref>.supabase.co
REDACTED_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY=your-openai-key

# Optional
MCP_PORT=3001
MCP_CORS_ORIGIN=*
MCP_HEARTBEAT_INTERVAL=15000
MCP_CONNECTION_TIMEOUT=30000
MCP_MAX_CONNECTIONS=1000
```

## Testing

### Unit Tests
```bash
npm test src/mcp
```

### Integration Tests
```bash
npm run test:integration:mcp
```

### Load Testing
```bash
# Using artillery
artillery run tests/load/mcp-load-test.yml
```

## Monitoring

- **Prometheus metrics** at `/mcp/metrics`
- **Health check** at `/mcp/health`
- **Connection count** tracking
- **Message throughput** monitoring
- **Error rate** tracking

## Security

- **API key authentication** required
- **Organization-based isolation**
- **Rate limiting** per API key
- **Input validation** on all endpoints
- **CORS configuration** for browser clients
- **SSL/TLS encryption** required in production

## Compatibility

- **CLI v1.5.1+** - Full support
- **VSCode Extension** - Via MCP client
- **Cursor IDE** - Via MCP protocol
- **Windsurf IDE** - Via MCP protocol
- **Custom integrations** - Via client libraries

## Support

- Documentation: https://docs.lanonasis.com/mcp
- API Reference: https://api.lanonasis.com/docs#mcp
- GitHub: https://github.com/lanonasis/mcp-server
- Support: support@lanonasis.com