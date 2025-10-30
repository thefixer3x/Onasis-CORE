/**
 * MCP (Model Context Protocol) Integration
 * Main entry point for MCP server at mcp.lanonasis.com/sse
 */

import express from 'express';
import { createServer } from 'http';
import mcpServer, { createMCPRouter } from './server';
import { MCPClient, MCPRestAPI } from './api';

// Re-export API classes
export { MCPClient, MCPRestAPI, createMCPClient, createMCPRestAPI } from './api';
export { MCPServer } from './server';

/**
 * Initialize MCP server with Express app
 */
export function initializeMCPServer(app: express.Application) {
  // Create MCP router
  const mcpRouter = createMCPRouter(mcpServer);
  
  // Mount MCP routes
  app.use('/mcp', mcpRouter);
  
  // Return server instance for additional configuration
  return mcpServer;
}

/**
 * Standalone MCP server
 */
export function createStandaloneMCPServer(port: number = 3001) {
  const app = express();
  
  // CORS and body parser
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Health check at root
  app.get('/', (req, res) => {
    res.json({
      name: 'Onasis MCP Server',
      version: '1.0.0',
      endpoint: 'mcp.lanonasis.com/sse',
      status: 'healthy',
      documentation: 'https://docs.lanonasis.com/mcp'
    });
  });
  
  // Initialize MCP
  initializeMCPServer(app);
  
  // Create HTTP server
  const server = createServer(app);
  
  // Start server
  server.listen(port, () => {
    console.log(`MCP Server running at http://localhost:${port}`);
    console.log(`SSE endpoint: http://localhost:${port}/mcp/sse`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    mcpServer.shutdown();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  return server;
}

// Export default MCP server instance
export default mcpServer;