# MCP Server Services

Model Context Protocol (MCP) server implementations for Onasis-CORE.

## Files

### **stdio-mcp-server.js**
Primary MCP stdio server that connects to the WebSocket backend.
- Provides MCP protocol-compliant stdio interface
- Connects to WebSocket MCP server
- Used by Claude Desktop and other MCP clients

### **claude-mcp-wrapper.js**
WebSocket-to-stdio wrapper for Claude MCP integration.
- Bridges WebSocket MCP server to stdio interface
- Handles message queuing and connection management

### **store-mcp-gateway-feedback.js**
Utility for storing MCP gateway test results into the memory system.

## Usage

These scripts are typically configured in:
- `claude-desktop-mcp-config.json` - Claude Desktop configuration
- `mcp-cli-config.json` - MCP CLI configuration

## Related

- Main MCP server implementation: `/services/mcp-server/`
- MCP documentation: `/docs/mcp/`
