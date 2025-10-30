/**
 * MCP (Model Context Protocol) Server
 * Endpoint: https://mcp.lanonasis.com/sse
 * 
 * Provides real-time SSE streaming for AI agent integration
 * Compatible with CLI v1.5.1 and VSCode extensions
 */

import express from 'express';
import cors from 'cors';
import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// MCP Protocol Types
interface MCPMessage {
  id: string;
  type: 'request' | 'response' | 'notification' | 'error';
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
  timestamp: string;
}

interface MCPError {
  code: number;
  message: string;
  data?: any;
}

interface MCPConnection {
  id: string;
  clientId: string;
  apiKey: string;
  organizationId: string;
  response: Response;
  isAlive: boolean;
  lastHeartbeat: Date;
  capabilities: string[];
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (params: any, connection: MCPConnection) => Promise<any>;
}

// MCP Server Class
export class MCPServer extends EventEmitter {
  private connections: Map<string, MCPConnection> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.registerBuiltInTools();
    this.startHeartbeat();
  }

  /**
   * Register built-in MCP tools
   */
  private registerBuiltInTools() {
    // Memory Service Tools
    this.registerTool({
      name: 'memory_create',
      description: 'Create a new memory entry with vector embedding',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['context', 'project', 'knowledge', 'reference', 'personal', 'workflow']
          },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'content']
      },
      handler: async (params, connection) => {
        // Forward to memory service
        return this.handleMemoryCreate(params, connection);
      }
    });

    this.registerTool({
      name: 'memory_search',
      description: 'Search memories using semantic vector search',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 },
          threshold: { type: 'number', default: 0.7 },
          type: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['query']
      },
      handler: async (params, connection) => {
        return this.handleMemorySearch(params, connection);
      }
    });

    this.registerTool({
      name: 'memory_list',
      description: 'List memories with pagination and filters',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
          offset: { type: 'number', default: 0 },
          type: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      },
      handler: async (params, connection) => {
        return this.handleMemoryList(params, connection);
      }
    });

    // API Key Management Tools
    this.registerTool({
      name: 'api_key_create',
      description: 'Create a new API key',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['test', 'live', 'restricted', 'admin'] },
          environment: { type: 'string', enum: ['development', 'staging', 'production'] }
        },
        required: ['name']
      },
      handler: async (params, connection) => {
        return this.handleApiKeyCreate(params, connection);
      }
    });

    // System Tools
    this.registerTool({
      name: 'list_tools',
      description: 'List all available MCP tools',
      inputSchema: {},
      handler: async () => {
        return Array.from(this.tools.values()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }));
      }
    });

    this.registerTool({
      name: 'get_status',
      description: 'Get MCP server status',
      inputSchema: {},
      handler: async (params, connection) => {
        return {
          status: 'online',
          connections: this.connections.size,
          organizationId: connection.organizationId,
          capabilities: connection.capabilities,
          timestamp: new Date().toISOString()
        };
      }
    });
  }

  /**
   * Register a custom tool
   */
  public registerTool(tool: MCPTool) {
    this.tools.set(tool.name, tool);
    this.emit('tool:registered', tool.name);
  }

  /**
   * Handle SSE connection
   */
  public async handleSSEConnection(req: Request, res: Response) {
    // Validate API key
    const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string;
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Validate API key and get organization
    const validation = await this.validateApiKey(apiKey);
    if (!validation.isValid) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
    });

    // Create connection
    const connectionId = uuidv4();
    const connection: MCPConnection = {
      id: connectionId,
      clientId: req.headers['x-client-id'] as string || uuidv4(),
      apiKey,
      organizationId: validation.organizationId,
      response: res,
      isAlive: true,
      lastHeartbeat: new Date(),
      capabilities: this.parseCapabilities(req.headers['x-mcp-capabilities'] as string)
    };

    this.connections.set(connectionId, connection);

    // Send initial connection message
    this.sendMessage(connection, {
      id: uuidv4(),
      type: 'notification',
      method: 'connection.established',
      params: {
        connectionId,
        capabilities: Array.from(this.tools.keys()),
        version: '1.0.0',
        endpoint: 'mcp.lanonasis.com/sse'
      },
      timestamp: new Date().toISOString()
    });

    // Handle client disconnect
    req.on('close', () => {
      this.handleDisconnect(connectionId);
    });

    // Handle incoming messages (via POST to companion endpoint)
    this.setupMessageHandler(connection);
  }

  /**
   * Handle incoming MCP messages
   */
  public async handleMessage(connectionId: string, message: MCPMessage) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    try {
      // Update heartbeat
      connection.lastHeartbeat = new Date();

      // Process based on message type
      if (message.type === 'request' && message.method) {
        const tool = this.tools.get(message.method);
        if (!tool) {
          throw new Error(`Unknown method: ${message.method}`);
        }

        // Execute tool handler
        const result = await tool.handler(message.params || {}, connection);

        // Send response
        this.sendMessage(connection, {
          id: message.id,
          type: 'response',
          result,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      // Send error response
      this.sendMessage(connection, {
        id: message.id,
        type: 'error',
        error: {
          code: -32603,
          message: error.message,
          data: error.stack
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send SSE message to client
   */
  private sendMessage(connection: MCPConnection, message: MCPMessage) {
    if (!connection.isAlive) return;

    try {
      const data = JSON.stringify(message);
      connection.response.write(`id: ${message.id}\n`);
      connection.response.write(`event: ${message.type}\n`);
      connection.response.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('Error sending SSE message:', error);
      this.handleDisconnect(connection.id);
    }
  }

  /**
   * Handle connection disconnect
   */
  private handleDisconnect(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isAlive = false;
      this.connections.delete(connectionId);
      this.emit('connection:closed', connectionId);
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = 30000; // 30 seconds

      this.connections.forEach((connection, id) => {
        const timeSinceLastHeartbeat = now.getTime() - connection.lastHeartbeat.getTime();
        
        if (timeSinceLastHeartbeat > timeout) {
          console.log(`Connection ${id} timed out`);
          this.handleDisconnect(id);
        } else if (connection.isAlive) {
          // Send ping
          this.sendMessage(connection, {
            id: uuidv4(),
            type: 'notification',
            method: 'ping',
            timestamp: new Date().toISOString()
          });
        }
      });
    }, 15000); // Check every 15 seconds
  }

  /**
   * Validate API key
   */
  private async validateApiKey(apiKey: string): Promise<{ isValid: boolean; organizationId: string }> {
    // TODO: Implement actual API key validation against vendor_api_keys table
    // For now, return mock validation
    if (apiKey.startsWith('pk_') || apiKey.startsWith('sk_')) {
      return {
        isValid: true,
        organizationId: 'ADMIN_ORG'
      };
    }
    return { isValid: false, organizationId: '' };
  }

  /**
   * Parse MCP capabilities header
   */
  private parseCapabilities(header: string | undefined): string[] {
    if (!header) return ['memory', 'api_keys'];
    return header.split(',').map(c => c.trim());
  }

  /**
   * Setup message handler for connection
   */
  private setupMessageHandler(connection: MCPConnection) {
    // Messages come via POST to /mcp/message endpoint
    // This is handled in the Express router
  }

  // Memory service handlers
  private async handleMemoryCreate(params: any, connection: MCPConnection) {
    // TODO: Implement actual memory creation via memory service
    return {
      id: uuidv4(),
      title: params.title,
      content: params.content,
      type: params.type || 'context',
      tags: params.tags || [],
      created_at: new Date().toISOString()
    };
  }

  private async handleMemorySearch(params: any, connection: MCPConnection) {
    // TODO: Implement actual memory search via memory service
    return {
      results: [],
      total: 0,
      query: params.query
    };
  }

  private async handleMemoryList(params: any, connection: MCPConnection) {
    // TODO: Implement actual memory listing via memory service
    return {
      memories: [],
      total: 0,
      limit: params.limit,
      offset: params.offset
    };
  }

  private async handleApiKeyCreate(params: any, connection: MCPConnection) {
    // TODO: Implement actual API key creation
    return {
      key_id: `pk_${params.type || 'live'}_${Date.now()}`,
      key_secret: `sk_${params.type || 'live'}_${createHash('sha256').update(uuidv4()).digest('hex')}`,
      name: params.name,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Cleanup on shutdown
   */
  public shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.connections.forEach((connection) => {
      connection.response.end();
    });
    this.connections.clear();
  }
}

// Express Router Setup
export function createMCPRouter(mcpServer: MCPServer) {
  const router = express.Router();

  // CORS middleware
  router.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Client-Id', 'X-MCP-Capabilities'],
    credentials: true
  }));

  // SSE endpoint
  router.get('/sse', async (req, res) => {
    await mcpServer.handleSSEConnection(req, res);
  });

  // Message endpoint (for sending messages to SSE connection)
  router.post('/message', express.json(), async (req, res) => {
    const connectionId = req.body.connectionId;
    const message = req.body.message;

    if (!connectionId || !message) {
      return res.status(400).json({ error: 'Missing connectionId or message' });
    }

    try {
      await mcpServer.handleMessage(connectionId, message);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      endpoint: 'mcp.lanonasis.com/sse',
      timestamp: new Date().toISOString()
    });
  });

  // List available tools
  router.get('/tools', (req, res) => {
    const tools = Array.from(mcpServer['tools'].values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
    res.json({ tools });
  });

  return router;
}

// Export default instance
const mcpServer = new MCPServer();
export default mcpServer;