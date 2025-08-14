#!/bin/bash

# Enhance IDE Extensions with MCP Capabilities
# This script adds MCP integration to the VSCode/Cursor/Windsurf extensions

set -e

echo "🤖 Enhancing IDE Extensions with MCP capabilities..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

MEMORY_SERVICE_DIR="services/memory-service"

# Function to add MCP to extension
add_mcp_to_extension() {
    local ext_dir=$1
    local ext_name=$2
    
    echo -e "\n${BLUE}Enhancing $ext_name with MCP...${NC}"
    
    if [ ! -d "$ext_dir" ]; then
        echo -e "${RED}❌ $ext_name directory not found${NC}"
        return
    fi
    
    cd "$ext_dir"
    
    # Add MCP dependencies to package.json
    echo -e "${YELLOW}Adding MCP dependencies...${NC}"
    npm install --save @modelcontextprotocol/sdk eventsource ws
    
    # Create MCP integration file
    cat > src/mcp-integration.ts << 'EOL'
// MCP Integration for VSCode Extension
import * as vscode from 'vscode';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/transport.js';
import { WebSocketTransport } from '@modelcontextprotocol/sdk/websocket.js';

export class MCPIntegration {
    private mcpClient: MCPClient | null = null;
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Lanonasis MCP');
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.updateStatusBar('disconnected');
    }

    async initialize(): Promise<void> {
        const config = vscode.workspace.getConfiguration('lanonasis');
        const useMCP = config.get<boolean>('enableMCP', false);
        
        if (!useMCP) {
            this.outputChannel.appendLine('MCP disabled in settings');
            return;
        }

        try {
            await this.connectMCP();
        } catch (error) {
            this.outputChannel.appendLine(`MCP connection failed: ${error}`);
            vscode.window.showWarningMessage(
                'Failed to connect to MCP server. Using direct API mode.'
            );
        }
    }

    private async connectMCP(): Promise<void> {
        const config = vscode.workspace.getConfiguration('lanonasis');
        const mcpMode = config.get<string>('mcpMode', 'websocket');
        const mcpUrl = config.get<string>('mcpServerUrl', 'ws://localhost:3002');

        this.outputChannel.appendLine(`Connecting to MCP server (${mcpMode}): ${mcpUrl}`);
        this.updateStatusBar('connecting');

        try {
            if (mcpMode === 'websocket') {
                const transport = new WebSocketTransport(mcpUrl);
                this.mcpClient = new MCPClient({
                    transport,
                    info: {
                        name: 'vscode-memory-extension',
                        version: '1.0.0'
                    }
                });
            } else {
                // stdio mode for local CLI
                const transport = new StdioClientTransport({
                    command: 'npx',
                    args: ['-y', '@lanonasis/cli', 'mcp', 'start']
                });
                this.mcpClient = new MCPClient({ transport });
            }

            await this.mcpClient.connect();
            
            // List available tools
            const tools = await this.mcpClient.listTools();
            this.outputChannel.appendLine(`Available MCP tools: ${tools.tools.map(t => t.name).join(', ')}`);
            
            this.updateStatusBar('connected');
            vscode.window.showInformationMessage('Connected to MCP server');
        } catch (error) {
            this.updateStatusBar('error');
            throw error;
        }
    }

    async callTool(toolName: string, args: any): Promise<any> {
        if (!this.mcpClient) {
            throw new Error('MCP client not connected');
        }

        this.outputChannel.appendLine(`Calling MCP tool: ${toolName}`);
        
        try {
            const result = await this.mcpClient.callTool({
                name: toolName,
                arguments: args
            });
            
            if (result.isError) {
                throw new Error(result.error || 'Unknown MCP error');
            }
            
            return result.content;
        } catch (error) {
            this.outputChannel.appendLine(`MCP tool error: ${error}`);
            throw error;
        }
    }

    async searchMemories(query: string, options?: any): Promise<any> {
        return this.callTool('memory_search_memories', {
            query,
            ...options
        });
    }

    async createMemory(data: any): Promise<any> {
        return this.callTool('memory_create_memory', data);
    }

    async listMemories(options?: any): Promise<any> {
        return this.callTool('memory_list_memories', options || {});
    }

    private updateStatusBar(status: 'connected' | 'connecting' | 'disconnected' | 'error'): void {
        const icons = {
            connected: '🟢',
            connecting: '🟡',
            disconnected: '⚪',
            error: '🔴'
        };
        
        this.statusBarItem.text = `${icons[status]} MCP`;
        this.statusBarItem.tooltip = `Lanonasis MCP: ${status}`;
        this.statusBarItem.command = 'lanonasis.mcpStatus';
        this.statusBarItem.show();
    }

    isConnected(): boolean {
        return this.mcpClient !== null;
    }

    async disconnect(): Promise<void> {
        if (this.mcpClient) {
            await this.mcpClient.close();
            this.mcpClient = null;
            this.updateStatusBar('disconnected');
        }
    }

    dispose(): void {
        this.disconnect();
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }
}
EOL

    # Update extension configuration
    echo -e "${YELLOW}Updating extension configuration...${NC}"
    
    # Add MCP settings to package.json using Node.js
    node -e "
    const fs = require('fs');
    const packagePath = './package.json';
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Add MCP commands
    if (!pkg.contributes.commands.find(c => c.command === 'lanonasis.mcpConnect')) {
        pkg.contributes.commands.push(
            {
                command: 'lanonasis.mcpConnect',
                title: 'Connect to MCP Server',
                category: 'Lanonasis',
                icon: '$(plug)'
            },
            {
                command: 'lanonasis.mcpDisconnect',
                title: 'Disconnect from MCP Server',
                category: 'Lanonasis',
                icon: '$(debug-disconnect)'
            },
            {
                command: 'lanonasis.mcpStatus',
                title: 'Show MCP Status',
                category: 'Lanonasis',
                icon: '$(info)'
            }
        );
    }
    
    // Add MCP configuration
    if (!pkg.contributes.configuration.properties['lanonasis.enableMCP']) {
        Object.assign(pkg.contributes.configuration.properties, {
            'lanonasis.enableMCP': {
                type: 'boolean',
                default: true,
                description: 'Enable Model Context Protocol (MCP) integration'
            },
            'lanonasis.mcpMode': {
                type: 'string',
                enum: ['websocket', 'stdio'],
                default: 'websocket',
                description: 'MCP connection mode'
            },
            'lanonasis.mcpServerUrl': {
                type: 'string',
                default: 'ws://localhost:3002',
                description: 'MCP WebSocket server URL'
            }
        });
    }
    
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
    console.log('Updated package.json with MCP configuration');
    "
    
    # Create MCP wrapper for existing client
    cat > src/memory-client-mcp.ts << 'EOL'
// Memory Client with MCP fallback
import { createMemoryClient, MemoryClient } from '@lanonasis/memory-client';
import { MCPIntegration } from './mcp-integration';
import * as vscode from 'vscode';

export class HybridMemoryClient {
    private directClient: MemoryClient;
    private mcpClient: MCPIntegration;
    private useMCP: boolean = false;

    constructor() {
        this.mcpClient = new MCPIntegration();
        const config = vscode.workspace.getConfiguration('lanonasis');
        
        this.directClient = createMemoryClient({
            baseURL: config.get('useGateway') 
                ? config.get('gatewayUrl') 
                : config.get('apiUrl'),
            apiKey: config.get('apiKey')
        });
    }

    async initialize(): Promise<void> {
        const config = vscode.workspace.getConfiguration('lanonasis');
        const enableMCP = config.get<boolean>('enableMCP', false);
        
        if (enableMCP) {
            try {
                await this.mcpClient.initialize();
                this.useMCP = this.mcpClient.isConnected();
                if (this.useMCP) {
                    vscode.window.showInformationMessage('Using MCP for memory operations');
                }
            } catch (error) {
                console.error('MCP initialization failed:', error);
                this.useMCP = false;
            }
        }
    }

    async searchMemories(query: string, options?: any): Promise<any> {
        if (this.useMCP) {
            try {
                return await this.mcpClient.searchMemories(query, options);
            } catch (error) {
                console.warn('MCP call failed, falling back to direct API:', error);
            }
        }
        
        return this.directClient.searchMemories({ query, ...options });
    }

    async createMemory(data: any): Promise<any> {
        if (this.useMCP) {
            try {
                return await this.mcpClient.createMemory(data);
            } catch (error) {
                console.warn('MCP call failed, falling back to direct API:', error);
            }
        }
        
        return this.directClient.createMemory(data);
    }

    async listMemories(options?: any): Promise<any> {
        if (this.useMCP) {
            try {
                return await this.mcpClient.listMemories(options);
            } catch (error) {
                console.warn('MCP call failed, falling back to direct API:', error);
            }
        }
        
        return this.directClient.listMemories(options);
    }

    dispose(): void {
        this.mcpClient.dispose();
    }
}
EOL

    echo -e "${GREEN}✓ Enhanced $ext_name with MCP capabilities${NC}"
    cd - > /dev/null
}

# Enhance each extension
add_mcp_to_extension "$MEMORY_SERVICE_DIR/vscode-extension" "VSCode Extension"
add_mcp_to_extension "$MEMORY_SERVICE_DIR/cursor-extension" "Cursor Extension"
add_mcp_to_extension "$MEMORY_SERVICE_DIR/windsurf-extension" "Windsurf Extension"

# Create MCP configuration for AI assistants
echo -e "\n${BLUE}Creating MCP configuration files...${NC}"

cat > MCP_IDE_CONFIGURATION.md << 'EOL'
# MCP Configuration for IDE Extensions

## VSCode Extension with MCP

The enhanced VSCode extension now supports MCP (Model Context Protocol) for:
- Direct integration with AI assistants (Claude, Cursor, Windsurf)
- Hybrid mode: MCP with fallback to REST API
- WebSocket and stdio transport modes
- Real-time memory synchronization

### Configuration Options

```json
{
  "lanonasis.enableMCP": true,
  "lanonasis.mcpMode": "websocket",  // or "stdio"
  "lanonasis.mcpServerUrl": "ws://localhost:3002"
}
```

### MCP Tools Available

1. **memory_create_memory** - Create new memories
2. **memory_search_memories** - Semantic search
3. **memory_list_memories** - List memories
4. **memory_get_memory** - Get specific memory
5. **memory_update_memory** - Update memories
6. **memory_delete_memory** - Delete memories
7. **memory_bulk_create** - Batch operations
8. **memory_get_stats** - Usage statistics

### Usage in AI Assistants

#### Claude Desktop
```json
{
  "mcpServers": {
    "vscode-memory": {
      "command": "code",
      "args": ["--extensionDevelopmentPath=/path/to/extension"],
      "env": {
        "LANONASIS_API_KEY": "your-key"
      }
    }
  }
}
```

#### Cursor Settings
```json
{
  "cursor.mcp.servers": {
    "lanonasis-memory": {
      "command": "npx",
      "args": ["-y", "@lanonasis/cli", "mcp", "start"],
      "env": {
        "LANONASIS_API_KEY": "your-key"
      }
    }
  }
}
```

### Building Extensions with MCP

```bash
# VSCode Extension
cd services/memory-service/vscode-extension
npm install
npm run compile
npm run package  # Creates .vsix with MCP support

# Test MCP integration
npm run test:mcp
```

### Deployment Notes

1. Extensions now require MCP SDK as dependency
2. Larger bundle size (~200KB additional)
3. WebSocket support for real-time updates
4. Automatic fallback to REST API if MCP fails
5. Status bar indicator for MCP connection state

EOL

echo -e "${GREEN}✓ Created MCP configuration guide${NC}"

# Create test script
cat > test-mcp-extensions.sh << 'EOL'
#!/bin/bash
# Test MCP functionality in extensions

echo "Testing MCP integration in extensions..."

# Start MCP server
echo "Starting MCP server..."
npx -y @lanonasis/cli mcp start --port 3002 &
MCP_PID=$!
sleep 5

# Test WebSocket connection
echo "Testing WebSocket connection..."
if curl -s http://localhost:3002/health | grep -q "healthy"; then
    echo "✓ MCP server is running"
else
    echo "❌ MCP server failed to start"
    kill $MCP_PID
    exit 1
fi

# Test MCP tools
echo "Testing MCP tool listing..."
npx -y @lanonasis/cli mcp tools

# Cleanup
kill $MCP_PID
echo "MCP extension test complete"
EOL
chmod +x test-mcp-extensions.sh

echo -e "\n${GREEN}🎉 IDE Extensions enhanced with MCP capabilities!${NC}"
echo -e "\n${BLUE}Summary:${NC}"
echo "1. Added @modelcontextprotocol/sdk to all extensions"
echo "2. Created MCP integration layer with WebSocket support"
echo "3. Implemented hybrid client (MCP + REST fallback)"
echo "4. Added MCP configuration options to extensions"
echo "5. Created test scripts for validation"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Rebuild all extensions with: npm run compile && npm run package"
echo "2. Test MCP integration with: ./test-mcp-extensions.sh"
echo "3. Update extension documentation"
echo "4. Submit enhanced extensions to marketplaces"