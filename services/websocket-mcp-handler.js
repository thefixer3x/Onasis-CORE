#!/usr/bin/env node

/**
 * Enhanced WebSocket MCP Handler for Onasis-Core
 * Leverages existing AI orchestration and privacy protection
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import winston from 'winston';
import dotenv from 'dotenv';

// Import existing onasis-core components
import { createClient } from '@supabase/supabase-js';

dotenv.config();

class EnhancedMCPWebSocketHandler {
  constructor(server, options = {}) {
    this.server = server;
    this.port = options.port || 3001;
    this.logger = this.setupLogger();
    
    // Initialize WebSocket server with MCP path
    this.wss = new WebSocket.Server({
      server: this.server,
      path: '/mcp/ws',
      verifyClient: this.verifyClient.bind(this)
    });
    
    // Initialize Supabase client for API key validation
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    // Connection tracking for privacy protection
    this.connections = new Map();
    this.anonymousSessionCounter = 0;
    
    this.setupEventHandlers();
    this.logger.info('Enhanced MCP WebSocket Handler initialized');
  }
  
  setupLogger() {
    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'onasis-mcp-websocket' },
      transports: [
        new winston.transports.File({ filename: 'logs/mcp-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/mcp-combined.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }
  
  verifyClient(info) {
    try {
      // Extract API key from headers or query parameters
      const apiKey = this.extractApiKey(info.req);
      
      if (!apiKey) {
        this.logger.warn('WebSocket connection attempt without API key');
        return false;
      }
      
      // Store API key for validation during connection
      info.req.apiKey = apiKey;
      return true;
      
    } catch (error) {
      this.logger.error('Error verifying WebSocket client:', error);
      return false;
    }
  }
  
  extractApiKey(request) {
    // Check headers first
    const headerKey = request.headers['x-api-key'] || 
                     request.headers['authorization']?.replace('Bearer ', '');
    
    if (headerKey) return headerKey;
    
    // Check query parameters
    const url = new URL(request.url, `http://${request.headers.host}`);
    return url.searchParams.get('api_key');
  }
  
  async validateApiKey(apiKey) {
    try {
      // Query Supabase for API key validation
      const { data, error } = await this.supabase
        .from('api_keys')
        .select('id, user_id, is_active, plan_type')
        .eq('key_hash', crypto.createHash('sha256').update(apiKey).digest('hex'))
        .eq('is_active', true)
        .single();
      
      if (error || !data) {
        this.logger.warn('Invalid API key attempt');
        return null;
      }
      
      return {
        keyId: data.id,
        userId: data.user_id,
        planType: data.plan_type,
        isActive: data.is_active
      };
      
    } catch (error) {
      this.logger.error('Error validating API key:', error);
      return null;
    }
  }
  
  setupEventHandlers() {
    this.wss.on('connection', this.handleConnection.bind(this));
    
    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error:', error);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }
  
  async handleConnection(ws, request) {
    try {
      // Validate API key
      const apiKey = request.apiKey;
      const keyInfo = await this.validateApiKey(apiKey);
      
      if (!keyInfo) {
        ws.close(1008, 'Invalid or inactive API key');
        return;
      }
      
      // Generate anonymous session ID for privacy protection
      const sessionId = this.generateAnonymousSessionId();
      
      // Store connection info
      this.connections.set(ws, {
        sessionId,
        userId: keyInfo.userId,
        planType: keyInfo.planType,
        connectedAt: Date.now(),
        lastActivity: Date.now()
      });
      
      this.logger.info(`MCP WebSocket connection established: ${sessionId}`);
      
      // Send connection acknowledgment
      ws.send(JSON.stringify({
        type: 'connection_ack',
        session_id: sessionId,
        server_info: {
          name: 'Onasis-Core MCP Server',
          version: '1.0.0',
          capabilities: [
            'memory_management',
            'workflow_orchestration',
            'ai_assistance',
            'parallel_execution'
          ]
        }
      }));
      
      // Set up message handling
      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnection(ws));
      ws.on('error', (error) => this.handleError(ws, error));
      
      // Set up heartbeat
      this.setupHeartbeat(ws);
      
    } catch (error) {
      this.logger.error('Error handling WebSocket connection:', error);
      ws.close(1011, 'Internal server error');
    }
  }
  
  generateAnonymousSessionId() {
    this.anonymousSessionCounter++;
    return `mcp_${this.anonymousSessionCounter}_${crypto.randomBytes(8).toString('hex')}`;
  }
  
  async handleMessage(ws, data) {
    try {
      const connection = this.connections.get(ws);
      if (!connection) {
        ws.close(1008, 'Connection not found');
        return;
      }
      
      // Update last activity
      connection.lastActivity = Date.now();
      
      // Parse MCP message
      const message = JSON.parse(data);
      
      this.logger.info(`MCP message received from ${connection.sessionId}: ${message.method || message.type}`);
      
      // Route message based on MCP protocol
      let response;
      
      switch (message.method || message.type) {
        case 'initialize':
          response = await this.handleInitialize(message, connection);
          break;
          
        case 'tools/list':
          response = await this.handleListTools(message, connection);
          break;
          
        case 'tools/call':
          response = await this.handleToolCall(message, connection);
          break;
          
        case 'resources/list':
          response = await this.handleListResources(message, connection);
          break;
          
        case 'resources/read':
          response = await this.handleReadResource(message, connection);
          break;
          
        case 'ping':
          response = { type: 'pong', id: message.id };
          break;
          
        default:
          response = {
            type: 'error',
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method || message.type}`
            }
          };
      }
      
      // Send response
      ws.send(JSON.stringify(response));
      
    } catch (error) {
      this.logger.error('Error handling WebSocket message:', error);
      
      const errorResponse = {
        type: 'error',
        id: (message && message.id) ? message.id : null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      };
      
      ws.send(JSON.stringify(errorResponse));
    }
  }
  
  async handleInitialize(message, _connection) {
    return {
      type: 'result',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: true
          },
          resources: {
            subscribe: true,
            listChanged: true
          }
        },
        serverInfo: {
          name: 'Onasis-Core MCP Server',
          version: '1.0.0',
          description: 'Enterprise-grade MCP server with AI orchestration'
        }
      }
    };
  }
  
  async handleListTools(message, _connection) {
    const tools = [
      {
        name: 'create_memory',
        description: 'Create a new memory entry with vector embedding',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Memory title' },
            content: { type: 'string', description: 'Memory content' },
            type: { type: 'string', enum: ['context', 'project', 'knowledge', 'reference', 'personal', 'workflow'] },
            tags: { type: 'array', items: { type: 'string' } }
          },
          required: ['title', 'content', 'type']
        }
      },
      {
        name: 'search_memories',
        description: 'Search memories using semantic similarity',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            type: { type: 'string', description: 'Memory type filter' },
            limit: { type: 'number', default: 10, description: 'Maximum results' },
            threshold: { type: 'number', default: 0.7, description: 'Similarity threshold' }
          },
          required: ['query']
        }
      },
      {
        name: 'orchestrate_workflow',
        description: 'Execute complex multi-step AI workflows',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_description: { type: 'string', description: 'Natural language workflow description' },
            steps: { type: 'array', items: { type: 'object' } },
            execution_mode: { type: 'string', enum: ['sequential', 'parallel', 'intelligent'], default: 'intelligent' }
          },
          required: ['workflow_description']
        }
      }
    ];
    
    return {
      type: 'result',
      id: message.id,
      result: { tools }
    };
  }
  
  async handleToolCall(message, connection) {
    const { name, arguments: args } = message.params;
    
    this.logger.info(`Tool call: ${name} from session ${connection.sessionId}`);
    
    try {
      let result;
      
      switch (name) {
        case 'create_memory':
          result = await this.createMemory(args, connection);
          break;
          
        case 'search_memories':
          result = await this.searchMemories(args, connection);
          break;
          
        case 'orchestrate_workflow':
          result = await this.orchestrateWorkflow(args, connection);
          break;
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      return {
        type: 'result',
        id: message.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
      
    } catch (error) {
      this.logger.error(`Tool call error for ${name}:`, error);
      
      return {
        type: 'error',
        id: message.id,
        error: {
          code: -32603,
          message: `Tool execution failed: ${error.message}`
        }
      };
    }
  }
  
  async createMemory(args, _connection) {
    // Implementation would integrate with existing memory service
    // For now, return a mock response
    return {
      id: crypto.randomUUID(),
      title: args.title,
      content: args.content,
      type: args.type,
      tags: args.tags || [],
      created_at: new Date().toISOString(),
      user_id: _connection.userId
    };
  }
  
  async searchMemories(args, _connection) {
    // Implementation would integrate with existing vector search
    // For now, return a mock response
    return {
      query: args.query,
      results: [
        {
          id: crypto.randomUUID(),
          title: `Sample memory for: ${args.query}`,
          content: `This is a sample memory result for the query: ${args.query}`,
          similarity_score: 0.85,
          type: 'knowledge'
        }
      ],
      total_results: 1,
      execution_time_ms: 45
    };
  }
  
  async orchestrateWorkflow(args, _connection) {
    // This would integrate with your existing AI orchestration
    // For now, return a mock workflow execution
    return {
      workflow_id: crypto.randomUUID(),
      description: args.workflow_description,
      status: 'completed',
      steps_executed: 3,
      execution_time_ms: 1250,
      results: {
        summary: `Successfully orchestrated workflow: ${args.workflow_description}`,
        steps: [
          { step: 1, action: 'analyze_request', status: 'completed', duration_ms: 200 },
          { step: 2, action: 'execute_actions', status: 'completed', duration_ms: 800 },
          { step: 3, action: 'synthesize_results', status: 'completed', duration_ms: 250 }
        ]
      }
    };
  }
  
  async handleListResources(message, _connection) {
    return {
      type: 'result',
      id: message.id,
      result: {
        resources: [
          {
            uri: 'memory://user/memories',
            name: 'User Memories',
            description: 'Access to user memory database',
            mimeType: 'application/json'
          }
        ]
      }
    };
  }
  
  async handleReadResource(message, _connection) {
    const { uri } = message.params;
    
    return {
      type: 'result',
      id: message.id,
      result: {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ message: 'Resource content would be here' }, null, 2)
          }
        ]
      }
    };
  }
  
  setupHeartbeat(ws) {
    const connection = this.connections.get(ws);
    if (!connection) return;
    
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
      }
    }, 30000); // 30 second heartbeat
    
    connection.heartbeat = heartbeat;
    
    ws.on('pong', () => {
      connection.lastActivity = Date.now();
    });
  }
  
  handleDisconnection(ws) {
    const connection = this.connections.get(ws);
    if (connection) {
      this.logger.info(`MCP WebSocket disconnected: ${connection.sessionId}`);
      
      // Clear heartbeat
      if (connection.heartbeat) {
        clearInterval(connection.heartbeat);
      }
      
      // Remove connection
      this.connections.delete(ws);
    }
  }
  
  handleError(ws, error) {
    const connection = this.connections.get(ws);
    const sessionId = connection?.sessionId || 'unknown';
    
    this.logger.error(`WebSocket error for session ${sessionId}:`, error);
  }
  
  gracefulShutdown(signal) {
    this.logger.info(`Received ${signal}, shutting down gracefully...`);
    
    // Close all connections
    this.connections.forEach((connection, ws) => {
      ws.close(1001, 'Server shutting down');
    });
    
    // Close WebSocket server
    this.wss.close(() => {
      this.logger.info('WebSocket server closed');
      process.exit(0);
    });
  }
  
  getStats() {
    return {
      active_connections: this.connections.size,
      total_sessions: this.anonymousSessionCounter,
      server_uptime: process.uptime()
    };
  }
}

export { EnhancedMCPWebSocketHandler };
