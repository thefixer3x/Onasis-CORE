#!/usr/bin/env node

/**
 * Enhanced MCP Server Deployment Script
 * Deploys WebSocket MCP server for enterprise users
 * Regular users continue using Supabase endpoint
 */

import { EnhancedMCPWebSocketHandler } from '../services/websocket-mcp-handler.js';
import { EnhancedAPIGateway } from '../services/enhanced-api-gateway.js';
import dotenv from 'dotenv';
import winston from 'winston';

dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/mcp-server.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

class MCPServerDeployment {
  constructor() {
    this.config = {
      port: process.env.MCP_SERVER_PORT || 8080,
      wsPort: process.env.MCP_WS_PORT || 8081,
      host: process.env.MCP_HOST || '0.0.0.0',
      environment: process.env.NODE_ENV || 'development',
      maxConnections: process.env.MCP_MAX_CONNECTIONS ? parseInt(process.env.MCP_MAX_CONNECTIONS, 10) : 1000,
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: process.env.MCP_RATE_LIMIT || 100 // requests per window
      }
    };
    
    this.apiGateway = null;
    this.mcpHandler = null;
  }

  async validateEnvironment() {
    const required = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.info('Environment validation passed');
  }

  async initializeServices() {
    try {
      // Initialize Enhanced API Gateway
      this.apiGateway = new EnhancedAPIGateway({
        port: this.config.port,
        host: this.config.host,
        rateLimit: this.config.rateLimit,
        cors: {
          origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
          credentials: true
        }
      });

      // Initialize MCP WebSocket Handler
      this.mcpHandler = new EnhancedMCPWebSocketHandler(null, {
        port: this.config.wsPort,
        maxConnections: this.config.maxConnections,
        heartbeatInterval: 30000,
        connectionTimeout: 60000
      });

      logger.info('Services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  async startServices() {
    try {
      // Start API Gateway
      await this.apiGateway.start();
      logger.info(`API Gateway started on ${this.config.host}:${this.config.port}`);

      // Start WebSocket MCP Handler
      await this.mcpHandler.start();
      logger.info(`MCP WebSocket server started on ${this.config.host}:${this.config.wsPort}`);

      // Health check endpoint
      this.apiGateway.app.get('/health', (req, res) => {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            apiGateway: 'running',
            mcpWebSocket: 'running'
          },
          connections: this.mcpHandler.getConnectionCount(),
          uptime: process.uptime()
        });
      });

      logger.info('Enhanced MCP Server deployment completed successfully');
      logger.info(`Health check available at: http://${this.config.host}:${this.config.port}/health`);
      logger.info(`WebSocket MCP endpoint: ws://${this.config.host}:${this.config.wsPort}/mcp`);
      
    } catch (error) {
      logger.error('Failed to start services:', error);
      throw error;
    }
  }

  async gracefulShutdown() {
    logger.info('Initiating graceful shutdown...');
    
    try {
      if (this.mcpHandler) {
        await this.mcpHandler.shutdown();
        logger.info('MCP WebSocket handler shut down');
      }
      
      if (this.apiGateway) {
        await this.apiGateway.shutdown();
        logger.info('API Gateway shut down');
      }
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  async deploy() {
    try {
      logger.info('Starting Enhanced MCP Server deployment...');
      logger.info(`Environment: ${this.config.environment}`);
      logger.info(`Configuration:`, this.config);

      await this.validateEnvironment();
      await this.initializeServices();
      await this.startServices();

      // Setup graceful shutdown handlers
      process.on('SIGTERM', () => this.gracefulShutdown());
      process.on('SIGINT', () => this.gracefulShutdown());
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
        this.gracefulShutdown();
      });
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection at:', promise, 'reason:', reason);
        this.gracefulShutdown();
      });

      logger.info('Enhanced MCP Server is running and ready for enterprise connections');
      
    } catch (error) {
      logger.error('Deployment failed:', error);
      process.exit(1);
    }
  }
}

// Deploy if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const deployment = new MCPServerDeployment();
  deployment.deploy();
}

export { MCPServerDeployment };
