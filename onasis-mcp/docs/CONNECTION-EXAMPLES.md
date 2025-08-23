# Lanonasis MCP Server - Connection Examples
**Complete guide for connecting via all supported protocols**

## 🔌 Connection Method Matrix

| Client/Tool | Stdio | HTTP | WebSocket | SSE | Netlify | Status |
|-------------|-------|------|-----------|-----|---------|--------|
| Claude Desktop | ✅ Primary | ❌ | ❌ | ❌ | ❌ | Ready |
| MCP Studio | ❌ | ✅ Primary | ✅ Alt | ❌ | ❌ | Ready |
| CLI Tools | ✅ Primary | ✅ Alt | ❌ | ❌ | ✅ Auth | Ready |
| Web Apps | ❌ | ✅ Primary | ✅ Real-time | ✅ Streaming | ✅ CDN | Ready |
| IDE Extensions | ✅ Local | ✅ Remote | ✅ Live | ❌ | ❌ | Ready |
| Mobile Apps | ❌ | ✅ Primary | ✅ Real-time | ✅ Updates | ✅ Global | Ready |
| IoT/Embedded | ✅ Simple | ✅ Standard | ✅ Persistent | ✅ Events | ❌ | Ready |

## 📡 Protocol-Specific Examples

### **1. Stdio Protocol (MCP Standard)**

#### **Claude Desktop Configuration**
```json
// ~/.config/claude_desktop_config.json (Linux/macOS)
// %APPDATA%\Claude\config.json (Windows)
{
  "mcpServers": {
    "lanonasis-mcp": {
      "command": "node",
      "args": [
        "/opt/mcp-servers/lanonasis-standalone/current/dist/unified-mcp-server.js",
        "--stdio"
      ],
      "env": {
        "ONASIS_SUPABASE_URL": "https://api.lanonasis.com",
        "ONASIS_SUPABASE_SERVICE_KEY": "your_service_key_here",
        "OPENAI_API_KEY": "your_openai_key_here"
      }
    }
  }
}
```

#### **CLI Tool Integration**
```bash
#!/bin/bash
# cli-mcp-example.sh

# Direct stdio communication
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \\
  node /path/to/unified-mcp-server.js --stdio

# Create memory via stdio
echo '{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "create_memory",
    "arguments": {
      "title": "Stdio Test",
      "content": "This memory was created via stdio protocol",
      "memory_type": "knowledge"
    }
  }
}' | node /path/to/unified-mcp-server.js --stdio
```

#### **Node.js Stdio Client**
```javascript
// stdio-client.js
import { spawn } from 'child_process';

class StdioMCPClient {
  constructor(serverPath) {
    this.server = spawn('node', [serverPath, '--stdio']);
    this.messageId = 1;
    this.pendingRequests = new Map();
    
    this.server.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        const handler = this.pendingRequests.get(response.id);
        if (handler) {
          handler.resolve(response);
          this.pendingRequests.delete(response.id);
        }
      } catch (error) {
        console.error('Parse error:', error);
      }
    });
  }
  
  async callTool(name, args = {}) {
    const id = this.messageId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args }
    };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\\n');
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }
  
  async listTools() {
    const id = this.messageId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/list'
    };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\\n');
    });
  }
  
  close() {
    this.server.kill();
  }
}

// Usage example
const client = new StdioMCPClient('/path/to/unified-mcp-server.js');

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools.result.tools);

// Create a memory
const result = await client.callTool('create_memory', {
  title: 'Node.js Integration',
  content: 'Successfully integrated MCP server with Node.js stdio client',
  memory_type: 'knowledge',
  tags: ['nodejs', 'integration', 'mcp']
});

console.log('Memory created:', result.result);

client.close();
```

### **2. HTTP REST API**

#### **cURL Examples**
```bash
# Health check
curl -X GET https://mcp.lanonasis.com/health | jq

# List all available tools
curl -X GET https://mcp.lanonasis.com/api/v1/tools | jq

# Create memory
curl -X POST https://mcp.lanonasis.com/api/v1/tools/create_memory \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_jwt_token" \\
  -d '{
    "title": "HTTP API Test",
    "content": "This memory was created via HTTP REST API",
    "memory_type": "reference",
    "tags": ["http", "api", "test"]
  }' | jq

# Search memories with semantic search
curl -X POST https://mcp.lanonasis.com/api/v1/tools/search_memories \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "API integration tutorial",
    "limit": 10,
    "threshold": 0.7,
    "memory_type": "reference"
  }' | jq

# Get organization info
curl -X POST https://mcp.lanonasis.com/api/v1/tools/get_organization_info \\
  -H "Content-Type: application/json" \\
  -d '{"include_usage": true}' | jq

# Create API key
curl -X POST https://mcp.lanonasis.com/api/v1/tools/create_api_key \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Integration Key",
    "description": "API key for my web application",
    "access_level": "authenticated",
    "expires_in_days": 90
  }' | jq
```

#### **JavaScript/Fetch**
```javascript
// http-client.js
class LanonasisMCPClient {
  constructor(baseUrl, apiKey = null) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      ...options,
      headers
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async listTools() {
    return this.request('/api/v1/tools');
  }
  
  async callTool(name, args = {}) {
    return this.request(`/api/v1/tools/${name}`, {
      method: 'POST',
      body: JSON.stringify(args)
    });
  }
  
  async getHealth(includeMetrics = false) {
    return this.callTool('get_health_status', { include_metrics: includeMetrics });
  }
  
  async createMemory(title, content, options = {}) {
    return this.callTool('create_memory', {
      title,
      content,
      memory_type: options.type || 'knowledge',
      tags: options.tags || [],
      topic_id: options.topicId
    });
  }
  
  async searchMemories(query, options = {}) {
    return this.callTool('search_memories', {
      query,
      limit: options.limit || 10,
      threshold: options.threshold || 0.7,
      memory_type: options.type,
      tags: options.tags
    });
  }
  
  async createApiKey(name, options = {}) {
    return this.callTool('create_api_key', {
      name,
      description: options.description,
      access_level: options.accessLevel || 'authenticated',
      expires_in_days: options.expiresInDays || 365,
      project_id: options.projectId
    });
  }
}

// Usage examples
const client = new LanonasisMCPClient('https://mcp.lanonasis.com');

// List available tools
const tools = await client.listTools();
console.log(`Available tools: ${tools.count}`);

// Create a memory
const memory = await client.createMemory(
  'JavaScript Client Test',
  'Successfully integrated with Lanonasis MCP server via HTTP API',
  { type: 'reference', tags: ['javascript', 'http', 'integration'] }
);
console.log('Memory created:', memory.result.memory.id);

// Search for related memories
const searchResults = await client.searchMemories('javascript integration');
console.log(`Found ${searchResults.result.count} related memories`);

// Get system health
const health = await client.getHealth(true);
console.log('System status:', health.result.status);
```

#### **Python Requests**
```python
# http-client.py
import requests
import json
from typing import Dict, List, Optional

class LanonasisMCPClient:
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        
        if api_key:
            self.session.headers.update({
                'Authorization': f'Bearer {api_key}'
            })
    
    def _request(self, endpoint: str, method: str = 'GET', data: Optional[Dict] = None) -> Dict:
        url = f"{self.base_url}{endpoint}"
        
        if method == 'POST' and data:
            response = self.session.post(url, json=data)
        else:
            response = self.session.get(url)
        
        response.raise_for_status()
        return response.json()
    
    def list_tools(self) -> Dict:
        return self._request('/api/v1/tools')
    
    def call_tool(self, name: str, args: Dict = None) -> Dict:
        return self._request(f'/api/v1/tools/{name}', 'POST', args or {})
    
    def create_memory(self, title: str, content: str, memory_type: str = 'knowledge', 
                     tags: List[str] = None, topic_id: str = None) -> Dict:
        return self.call_tool('create_memory', {
            'title': title,
            'content': content,
            'memory_type': memory_type,
            'tags': tags or [],
            'topic_id': topic_id
        })
    
    def search_memories(self, query: str, limit: int = 10, threshold: float = 0.7,
                       memory_type: str = None, tags: List[str] = None) -> Dict:
        params = {
            'query': query,
            'limit': limit,
            'threshold': threshold
        }
        if memory_type:
            params['memory_type'] = memory_type
        if tags:
            params['tags'] = tags
        
        return self.call_tool('search_memories', params)
    
    def get_health(self, include_metrics: bool = False) -> Dict:
        return self.call_tool('get_health_status', {'include_metrics': include_metrics})
    
    def create_api_key(self, name: str, description: str = None, 
                      access_level: str = 'authenticated', expires_in_days: int = 365) -> Dict:
        return self.call_tool('create_api_key', {
            'name': name,
            'description': description,
            'access_level': access_level,
            'expires_in_days': expires_in_days
        })

# Usage example
if __name__ == "__main__":
    client = LanonasisMCPClient('https://mcp.lanonasis.com')
    
    # List available tools
    tools = client.list_tools()
    print(f"Available tools: {tools['count']}")
    
    # Create a memory
    memory = client.create_memory(
        title='Python Client Test',
        content='Successfully integrated with Lanonasis MCP server via Python HTTP client',
        memory_type='reference',
        tags=['python', 'http', 'integration']
    )
    print(f"Memory created: {memory['result']['memory']['id']}")
    
    # Search memories
    results = client.search_memories('python integration', limit=5)
    print(f"Found {results['result']['count']} memories")
    
    # Check health
    health = client.get_health(include_metrics=True)
    print(f"System status: {health['result']['status']}")
```

### **3. WebSocket Real-time**

#### **JavaScript WebSocket Client**
```javascript
// websocket-client.js
class LanonasisWebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.messageId = 1;
    this.pendingRequests = new Map();
    this.eventHandlers = new Map();
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.id && this.pendingRequests.has(message.id)) {
            const handler = this.pendingRequests.get(message.id);
            if (message.error) {
              handler.reject(new Error(message.error.message));
            } else {
              handler.resolve(message.result);
            }
            this.pendingRequests.delete(message.id);
          }
          
          // Handle events
          if (message.event) {
            const handlers = this.eventHandlers.get(message.event) || [];
            handlers.forEach(handler => handler(message.data));
          }
        } catch (error) {
          console.error('Message parse error:', error);
        }
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Auto-reconnect logic could go here
      };
    });
  }
  
  async sendRequest(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    
    const id = this.messageId++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }
  
  async listTools() {
    return this.sendRequest('tools/list');
  }
  
  async callTool(name, args = {}) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }
  
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }
  
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage example
async function main() {
  const client = new LanonasisWebSocketClient('wss://mcp.lanonasis.com:3002');
  
  try {
    await client.connect();
    
    // List available tools
    const tools = await client.listTools();
    console.log('Available tools:', tools.tools.length);
    
    // Create memory
    const memory = await client.callTool('create_memory', {
      title: 'WebSocket Test',
      content: 'Real-time memory creation via WebSocket',
      memory_type: 'reference',
      tags: ['websocket', 'realtime']
    });
    console.log('Memory created:', memory.content[0].text);
    
    // Search memories
    const searchResults = await client.callTool('search_memories', {
      query: 'websocket realtime',
      limit: 5
    });
    console.log('Search completed:', JSON.parse(searchResults.content[0].text));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.close();
  }
}

main();
```

#### **Node.js WebSocket Client**
```javascript
// node-websocket-client.js
import WebSocket from 'ws';

class LanonasisWebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.messageId = 1;
    this.pendingRequests = new Map();
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.on('open', () => {
        console.log('Connected to MCP WebSocket server');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.id && this.pendingRequests.has(message.id)) {
            const handler = this.pendingRequests.get(message.id);
            if (message.error) {
              handler.reject(new Error(message.error.message));
            } else {
              handler.resolve(message.result);
            }
            this.pendingRequests.delete(message.id);
          }
        } catch (error) {
          console.error('Parse error:', error);
        }
      });
      
      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('WebSocket connection closed');
      });
    });
  }
  
  async callTool(name, args = {}) {
    const id = this.messageId++;
    const message = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args }
    };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }
  
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Example usage
const client = new LanonasisWebSocketClient('ws://localhost:3002');

try {
  await client.connect();
  
  // Bulk memory operations
  const memories = [];
  for (let i = 0; i < 10; i++) {
    const memory = await client.callTool('create_memory', {
      title: `Bulk Memory ${i + 1}`,
      content: `This is bulk memory entry number ${i + 1} created via WebSocket`,
      memory_type: 'knowledge',
      tags: ['bulk', 'websocket', `batch-${Math.ceil((i + 1) / 5)}`]
    });
    memories.push(JSON.parse(memory.content[0].text));
    console.log(`Created memory ${i + 1}/10`);
  }
  
  console.log(`Successfully created ${memories.length} memories`);
  
} catch (error) {
  console.error('Error:', error);
} finally {
  client.close();
}
```

### **4. Server-Sent Events (SSE)**

#### **JavaScript SSE Client**
```javascript
// sse-client.js
class LanonasisSSEClient {
  constructor(url) {
    this.url = url;
    this.eventSource = null;
    this.eventHandlers = new Map();
  }
  
  connect() {
    this.eventSource = new EventSource(`${this.url}/sse`);
    
    // Built-in event handlers
    this.eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      console.log('Connected to SSE:', data);
    });
    
    this.eventSource.addEventListener('tools', (event) => {
      const data = JSON.parse(event.data);
      console.log(`Available tools: ${data.tools.length}`);
    });
    
    this.eventSource.addEventListener('tool_result', (event) => {
      const data = JSON.parse(event.data);
      const handlers = this.eventHandlers.get('tool_result') || [];
      handlers.forEach(handler => handler(data));
    });
    
    this.eventSource.addEventListener('error', (event) => {
      console.error('SSE error:', event);
    });
    
    return this;
  }
  
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
    
    // Also listen to the EventSource
    this.eventSource.addEventListener(eventType, (event) => {
      const data = JSON.parse(event.data);
      handler(data);
    });
  }
  
  async executeTool(name, args = {}) {
    const params = new URLSearchParams();
    Object.entries(args).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        params.append(key, JSON.stringify(value));
      } else {
        params.append(key, value.toString());
      }
    });
    
    const response = await fetch(`${this.url}/sse/tool/${name}?${params}`);
    return response.json();
  }
  
  close() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }
}

// Usage example
const client = new LanonasisSSEClient('https://mcp.lanonasis.com:3003');

// Connect and listen for tool results
client.connect()
  .on('tool_result', (data) => {
    console.log(`Tool ${data.tool} executed:`, data.result);
  });

// Execute tools (results will be broadcast to all connected clients)
setTimeout(async () => {
  // Create memory
  await client.executeTool('create_memory', {
    title: 'SSE Test Memory',
    content: 'This memory was created via Server-Sent Events',
    memory_type: 'reference',
    tags: ['sse', 'streaming']
  });
  
  // Search memories
  await client.executeTool('search_memories', {
    query: 'SSE streaming',
    limit: 3
  });
  
  // Get health status
  await client.executeTool('get_health_status', {
    include_metrics: true
  });
}, 1000);

// Clean up after 30 seconds
setTimeout(() => {
  client.close();
}, 30000);
```

#### **Node.js SSE Client**
```javascript
// node-sse-client.js
import fetch from 'node-fetch';
import EventSource from 'eventsource';

class LanonasisSSEClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.eventSource = null;
  }
  
  connect() {
    this.eventSource = new EventSource(`${this.baseUrl}/sse`);
    
    this.eventSource.onopen = () => {
      console.log('SSE connection opened');
    };
    
    this.eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      console.log('Connected:', data.timestamp);
    });
    
    this.eventSource.addEventListener('tools', (event) => {
      const data = JSON.parse(event.data);
      console.log(`Available tools: ${data.tools.length}`);
    });
    
    this.eventSource.addEventListener('tool_result', (event) => {
      const data = JSON.parse(event.data);
      console.log(`[${data.timestamp}] ${data.tool}:`, data.result);
    });
    
    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };
    
    return this;
  }
  
  async executeTool(name, args = {}) {
    const params = new URLSearchParams();
    Object.entries(args).forEach(([key, value]) => {
      if (typeof value === 'object') {
        params.append(key, JSON.stringify(value));
      } else {
        params.append(key, value.toString());
      }
    });
    
    const response = await fetch(`${this.baseUrl}/sse/tool/${name}?${params}`);
    return response.json();
  }
  
  close() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }
}

// Example: Real-time memory monitoring
const client = new LanonasisSSEClient('http://localhost:3003');
client.connect();

// Simulate continuous memory operations
const interval = setInterval(async () => {
  try {
    await client.executeTool('create_memory', {
      title: `Auto Memory ${Date.now()}`,
      content: 'Automatically created memory for monitoring',
      memory_type: 'workflow',
      tags: ['auto', 'monitoring', new Date().toISOString().split('T')[0]]
    });
  } catch (error) {
    console.error('Error creating memory:', error);
  }
}, 5000);

// Clean up after 1 minute
setTimeout(() => {
  clearInterval(interval);
  client.close();
  console.log('Monitoring stopped');
}, 60000);
```

### **5. MCP Studio Integration**

#### **Studio Configuration**
```json
// mcp-studio-config.json
{
  "servers": [
    {
      "name": "Lanonasis MCP Server",
      "url": "https://mcp.lanonasis.com/api/v1/mcp/message",
      "protocol": "http",
      "authentication": {
        "type": "bearer",
        "token": "your_jwt_token_here"
      },
      "description": "Enterprise MCP server with 17+ tools for memory management"
    }
  ]
}
```

#### **Studio HTTP Endpoint**
```bash
# Start server in studio-compatible mode
npm run studio

# Or start with explicit HTTP mode
npm run start:http

# Studio will connect to:
# http://localhost:3001/api/v1/mcp/message
```

### **6. Mobile App Integration**

#### **React Native Example**
```javascript
// react-native-client.js
import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList } from 'react-native';

class LanonasisMCPClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  
  async callTool(name, args = {}) {
    const response = await fetch(`${this.baseUrl}/api/v1/tools/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authentication headers if needed
      },
      body: JSON.stringify(args)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }
}

const MemoryApp = () => {
  const [memories, setMemories] = useState([]);
  const [client] = useState(new LanonasisMCPClient('https://mcp.lanonasis.com'));
  
  const searchMemories = async (query) => {
    try {
      const result = await client.callTool('search_memories', {
        query,
        limit: 20
      });
      setMemories(result.result.memories);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };
  
  const createMemory = async (title, content) => {
    try {
      await client.callTool('create_memory', {
        title,
        content,
        memory_type: 'personal',
        tags: ['mobile', 'react-native']
      });
      // Refresh the list
      searchMemories('');
    } catch (error) {
      console.error('Create failed:', error);
    }
  };
  
  useEffect(() => {
    searchMemories('');
  }, []);
  
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Button 
        title="Add Test Memory" 
        onPress={() => createMemory('Mobile Test', 'Created from React Native app')}
      />
      
      <FlatList
        data={memories}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ padding: 10, borderBottomWidth: 1 }}>
            <Text style={{ fontWeight: 'bold' }}>{item.title}</Text>
            <Text>{item.content}</Text>
            <Text style={{ color: 'gray' }}>Type: {item.memory_type}</Text>
          </View>
        )}
      />
    </View>
  );
};

export default MemoryApp;
```

### **7. IoT/Embedded Integration**

#### **Arduino/ESP32 Example**
```cpp
// arduino-mcp-client.ino
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "your_wifi_ssid";
const char* password = "your_wifi_password";
const char* mcpUrl = "https://mcp.lanonasis.com/api/v1/tools";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  
  Serial.println("Connected to WiFi");
  
  // Create initial memory
  createSensorMemory("system_boot", "ESP32 system started successfully");
}

void loop() {
  // Read sensor data (example)
  float temperature = 25.5; // Replace with actual sensor reading
  float humidity = 60.0;    // Replace with actual sensor reading
  
  // Create memory entry for sensor data
  String content = "Temperature: " + String(temperature) + "°C, Humidity: " + String(humidity) + "%";
  createSensorMemory("sensor_reading", content);
  
  delay(60000); // Send data every minute
}

void createSensorMemory(String title, String content) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(String(mcpUrl) + "/create_memory");
    http.addHeader("Content-Type", "application/json");
    
    // Create JSON payload
    DynamicJsonDocument doc(1024);
    doc["title"] = title;
    doc["content"] = content;
    doc["memory_type"] = "workflow";
    JsonArray tags = doc.createNestedArray("tags");
    tags.add("iot");
    tags.add("sensor");
    tags.add("esp32");
    
    String payload;
    serializeJson(doc, payload);
    
    int httpResponseCode = http.POST(payload);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Memory created: " + response);
    } else {
      Serial.println("Error creating memory: " + String(httpResponseCode));
    }
    
    http.end();
  }
}
```

#### **Raspberry Pi Python Client**
```python
# raspberry-pi-client.py
import requests
import time
import json
from datetime import datetime
import subprocess

class IoTMCPClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
    
    def create_memory(self, title, content, memory_type='workflow', tags=None):
        url = f"{self.base_url}/api/v1/tools/create_memory"
        payload = {
            'title': title,
            'content': content,
            'memory_type': memory_type,
            'tags': tags or []
        }
        
        try:
            response = self.session.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error creating memory: {e}")
            return None
    
    def get_system_info(self):
        # Get CPU temperature
        try:
            temp_output = subprocess.check_output(['vcgencmd', 'measure_temp']).decode()
            cpu_temp = temp_output.strip().split('=')[1].replace("'C", "")
        except:
            cpu_temp = "unknown"
        
        # Get memory usage
        try:
            mem_output = subprocess.check_output(['free', '-h']).decode()
            memory_lines = mem_output.strip().split('\\n')
            memory_info = memory_lines[1].split()
            memory_usage = f"Used: {memory_info[2]}, Available: {memory_info[6]}"
        except:
            memory_usage = "unknown"
        
        return {
            'cpu_temperature': cpu_temp,
            'memory_usage': memory_usage,
            'timestamp': datetime.now().isoformat()
        }

# Main monitoring loop
def main():
    client = IoTMCPClient('https://mcp.lanonasis.com')
    
    # Create startup memory
    startup_info = {
        'device': 'Raspberry Pi',
        'location': 'Home Lab',
        'startup_time': datetime.now().isoformat()
    }
    
    client.create_memory(
        'IoT Device Startup',
        f'Raspberry Pi monitoring system started: {json.dumps(startup_info)}',
        'workflow',
        ['iot', 'raspberry-pi', 'startup']
    )
    
    # Monitoring loop
    while True:
        try:
            system_info = client.get_system_info()
            
            # Create memory entry for system status
            client.create_memory(
                f'System Status - {datetime.now().strftime("%Y-%m-%d %H:%M")}',
                f'System monitoring data: {json.dumps(system_info)}',
                'workflow',
                ['iot', 'monitoring', 'raspberry-pi']
            )
            
            print(f"[{datetime.now()}] System status logged")
            
            # Wait 5 minutes before next reading
            time.sleep(300)
            
        except KeyboardInterrupt:
            print("Monitoring stopped")
            break
        except Exception as e:
            print(f"Monitoring error: {e}")
            time.sleep(60)  # Wait 1 minute before retrying

if __name__ == "__main__":
    main()
```

## 🔄 Integration Testing

### **Multi-Protocol Test Suite**
```bash
#!/bin/bash
# test-all-protocols.sh

echo "🧪 Testing all MCP server protocols..."

# Test HTTP API
echo "Testing HTTP API..."
curl -f -s https://mcp.lanonasis.com/health > /dev/null && echo "✅ HTTP OK" || echo "❌ HTTP Failed"

# Test WebSocket
echo "Testing WebSocket..."
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('wss://mcp.lanonasis.com:3002');
ws.on('open', () => {
  console.log('✅ WebSocket OK');
  ws.close();
});
ws.on('error', () => {
  console.log('❌ WebSocket Failed');
});
"

# Test SSE
echo "Testing Server-Sent Events..."
timeout 5 curl -N -s https://mcp.lanonasis.com:3003/sse | head -1 > /dev/null && echo "✅ SSE OK" || echo "❌ SSE Failed"

# Test Stdio
echo "Testing Stdio..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 10 npm run start:stdio > /dev/null && echo "✅ Stdio OK" || echo "❌ Stdio Failed"

echo "🎉 Protocol testing completed!"
```

---

## 📞 Support

For integration support:
- **Documentation**: [Complete MCP Guide](./MULTI-PROTOCOL-MCP-SERVER-GUIDE.md)
- **Health Dashboard**: https://mcp.lanonasis.com/health
- **GitHub Issues**: https://github.com/lanonasis/onasis-mcp-server/issues

**🚀 Choose the connection method that best fits your use case - all protocols provide access to the same 17+ powerful tools!**