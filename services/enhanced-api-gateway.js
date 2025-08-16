#!/usr/bin/env node

/**
 * Enhanced Onasis-Core API Gateway with WebSocket MCP Integration
 * Extends existing privacy-protecting API gateway with MCP capabilities
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import crypto from 'crypto';
import http from 'http';
import fs from 'fs';

// Import existing onasis-core components
// Commented out until needed
// import { createClient } from '@supabase/supabase-js';
import { EnhancedMCPWebSocketHandler } from './websocket-mcp-handler.js';
class EnhancedAPIGateway {
  constructor(options = {}) {
    // Store the options object for later use
    this.options = options;
    this.port = options.port || process.env.GATEWAY_PORT || 3001;
    this.app = express();
    this.server = http.createServer(this.app);
    
    this.logger = this.setupLogger();
    this.setupMiddleware();
    this.setupRoutes();
    
    // Initialize WebSocket MCP handler
    try {
      this.mcpHandler = new EnhancedMCPWebSocketHandler(this.server, options);
    } catch (error) {
      this.logger.error('Failed to initialize MCP WebSocket handler:', error);
      throw error;
    }
    this.logger.info('Enhanced API Gateway with MCP WebSocket initialized');
  }
  
  setupLogger() {
    // Ensure logs directory exists before creating file transports
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
    }
    
    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'onasis-enhanced-gateway' },
      transports: [
        new winston.transports.File({ filename: 'logs/gateway-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/gateway-combined.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }
  
  setupMiddleware() {
    // Enhanced security with privacy protection
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));
    
    // CORS with secure origin whitelist
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://api.lanonasis.com',
      'https://lanonasis.com',
      'https://mcp.lanonasis.com'
    ];
    
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
          const hashedOrigin = crypto.createHash('sha256').update(origin).digest('hex').substring(0, 12);
          this.logger.info(`Request from allowed hashed origin: ${hashedOrigin}`);
          callback(null, true);
        } else {
          const hashedOrigin = crypto.createHash('sha256').update(origin).digest('hex').substring(0, 12);
          this.logger.warn(`Request from blocked hashed origin: ${hashedOrigin}`);
          callback(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-MCP-Version']
    }));
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Rate limiting with anonymous tracking
    const createRateLimit = (windowMs, max, _message) => rateLimit({
      windowMs,
      max,
      keyGenerator: (req) => {
        // Generate anonymous session key
        const sessionId = req.headers['x-session-id'] ||
                         req.headers['authorization'] ||
                         req.headers['x-api-key']?.substring(0, 20) ||
                         req.ip ||
                         'anonymous';
        return crypto
          .createHash('sha256')
          .update(sessionId)
          .digest('hex')
          .substring(0, 16);
      }
    });
    
    // Different rate limits for different endpoints
    this.mcpRateLimit = createRateLimit(60 * 1000, 500, 'MCP API rate limit exceeded');
    this.generalRateLimit = createRateLimit(60 * 1000, 200, 'General API rate limit exceeded');
    this.healthRateLimit = createRateLimit(60 * 1000, 1000, 'Health check rate limit exceeded');
    
    // Privacy protection middleware
    this.app.use(this.privacyProtection.bind(this));
  }
  
  privacyProtection(req, res, next) {
    // Generate anonymous request ID
    req.anonymousId = crypto.randomBytes(16).toString('hex');
    req.timestamp = Date.now();
    
    // Strip identifying headers
    delete req.headers['x-real-ip'];
    delete req.headers['x-forwarded-for'];
    delete req.headers['x-forwarded-host'];
    delete req.headers['cf-connecting-ip'];
    
    // Log request anonymously
    this.logger.info(`Anonymous request: ${req.anonymousId} ${req.method} ${req.path}`);
    
    next();
  }
  
  setupRoutes() {
    // Health check
    this.app.get('/health', this.healthRateLimit, (req, res) => {
      res.json({
        status: 'healthy',
        service: 'onasis-enhanced-gateway',
        version: '1.0.0',
        uptime: process.uptime(),
        mcp_websocket: 'enabled',
        active_connections: this.mcpHandler?.getStats()?.active_connections || 0
      });
    });
    
    // MCP WebSocket info endpoint
    this.app.get('/mcp/info', this.mcpRateLimit, (req, res) => {
      res.json({
        websocket_endpoint: '/mcp/ws',
        protocol_version: '2024-11-05',
        capabilities: [
          'memory_management',
          'workflow_orchestration', 
          'ai_assistance',
          'parallel_execution'
        ],
        connection_stats: this.mcpHandler?.getStats() || {}
      });
    });
    
    // MCP HTTP fallback endpoints (for clients that don't support WebSocket)
    this.app.post('/mcp/tools/list', this.mcpRateLimit, async (req, res) => {
      try {
        const tools = await this.getMCPTools();
        res.json({ tools });
      } catch (error) {
        this.logger.error('Error listing MCP tools:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    this.app.post('/mcp/tools/call', this.mcpRateLimit, async (req, res) => {
      try {
        const { name, arguments: args } = req.body;
        const result = await this.callMCPTool(name, args, req);
        res.json({ result });
      } catch (error) {
        this.logger.error('Error calling MCP tool:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    // Proxy endpoints for existing services (maintain backward compatibility)
    this.app.use('/api/v1/proxy/:vendor/*', this.generalRateLimit, this.proxyToVendor.bind(this));
    
    // Catch-all for undefined routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        available_endpoints: [
          '/health',
          '/mcp/info',
          '/mcp/ws (WebSocket)',
          '/mcp/tools/list',
          '/mcp/tools/call',
          '/api/v1/proxy/:vendor/*'
        ]
      });
    });
  }
  
  async getMCPTools() {
    // Return available MCP tools
    return [
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
  }
  
  async executeTool(name, args) {
    switch (name) {
      case 'create_memory':
        if (!args.title || !args.content || !args.type) {
          throw new Error('Missing required fields: title, content, type');
        }
        return {
          id: crypto.randomUUID(),
          title: args.title,
          content: args.content,
          type: args.type,
          created_at: new Date().toISOString()
        };
        
      case 'search_memories':
        if (!args.query) {
          throw new Error('Missing required field: query');
        }
        return {
          query: args.query,
          results: [
            {
              id: crypto.randomUUID(),
              title: `Sample memory for: ${args.query}`,
              similarity_score: 0.85,
              type: 'knowledge'
            }
          ]
        };
        
      case 'orchestrate_workflow':
        return {
          workflow_id: crypto.randomUUID(),
          description: args.workflow_description,
          status: 'completed',
          execution_time_ms: 1250
        };
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  
  async proxyToVendor(req, res) {
    // Existing proxy functionality - maintain backward compatibility
    const vendor = req.params.vendor;
    const endpoint = '/' + req.params[0];
    
    this.logger.info(`Proxying to vendor: ${vendor}, endpoint: ${endpoint}`);
    
    // Mock response for now
    res.json({
      message: 'Vendor proxy functionality',
      vendor,
      endpoint,
      status: 'would_proxy_here'
    });
  }
  
  start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error) => {
        if (error) {
          this.logger.error('Failed to start Enhanced API Gateway:', error);
          reject(error);
        } else {
          this.logger.info(`🚀 Enhanced API Gateway with MCP WebSocket running on port ${this.port}`);
          this.logger.info(`📡 WebSocket MCP endpoint: ws://${this.options?.host || process.env.GATEWAY_HOST || '0.0.0.0'}:${this.port}/mcp/ws`);
          this.logger.info(`🔧 HTTP MCP endpoints: http://${this.options?.host || process.env.GATEWAY_HOST || '0.0.0.0'}:${this.port}/mcp/info`);
          resolve();
        }
      });
    });
  }
  
  stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('Enhanced API Gateway stopped');
        resolve();
      });
    });
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const gateway = new EnhancedAPIGateway();
  
  gateway.start().catch((error) => {
    console.error('Failed to start gateway:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await gateway.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await gateway.stop();
    process.exit(0);
  });
}

export { EnhancedAPIGateway };
