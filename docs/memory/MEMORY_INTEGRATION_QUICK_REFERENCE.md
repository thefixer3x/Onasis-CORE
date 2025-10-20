# 📢 Memory Service Integration - Quick Reference

## 🚀 Quick Start

```bash
# 1. Setup submodule
./setup-memory-submodules.sh

# 2. Enhance extensions with MCP
./enhance-extensions-mcp.sh

# 3. Configure environment
cp .env.memory.example .env
# Edit .env with your credentials

# 4. Install dependencies
npm install

# 5. Start development
./start-with-memory.sh
```

## 📂 Directory Structure

```
services/memory-service/       # Git submodule
packages/external/memory-sdk/  # Symlink to SDK
tools/memory-cli/             # Symlink to CLI
tools/*-memory-extension/     # Symlinks to extensions
```

## 🔑 Key Commands

### Development
```bash
turbo run dev --filter=memory-service    # Start memory service
turbo run dev                            # Start everything
npx -y @lanonasis/cli mcp start         # Start MCP server
```

### Building
```bash
turbo run build                          # Build all
turbo run build --filter=...memory-service  # Build memory suite
```

### Testing
```bash
turbo run test --filter=memory-service   # Test service
./test-mcp-extensions.sh                 # Test MCP integration
```

### Deployment
```bash
./deployment/deploy-memory-suite.sh production
```

## 🌐 Service URLs

| Environment | API URL | MCP URL |
|------------|---------|----------|
| Local Dev | http://localhost:3000/api/v1 | ws://localhost:3002 |
| Production | https://api.lanonasis.com/api/v1 | wss://api.lanonasis.com/mcp |

## 📦 npm Packages

| Package | Version | Install |
|---------|---------|----------|
| SDK | 1.0.0+ | `npm install @lanonasis/memory-client` |
| CLI | 1.1.0+ | `npm install -g @lanonasis/cli` |

## 🤖 MCP Configuration

### Claude Desktop
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@lanonasis/cli", "mcp", "start"]
    }
  }
}
```

### VSCode Settings
```json
{
  "lanonasis.enableMCP": true,
  "lanonasis.mcpServerUrl": "ws://localhost:3002"
}
```

## 🆘 Environment Variables

```env
# Required
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
OPENAI_API_KEY=sk-xxx
JWT_SECRET=xxx

# Development
USE_LOCAL_MEMORY=true
ENABLE_MEMORY_MCP=true

# Optional
REDIS_URL=redis://localhost:6379
```

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Submodule not found | `git submodule update --init --recursive` |
| MCP connection failed | Check port 3002, restart MCP server |
| Build errors | `rm -rf node_modules && npm install` |
| Extension not loading | Reinstall from .vsix file |

## 📞 Support

- Docs: https://docs.lanonasis.com
- Issues: https://github.com/lanonasis/vibe-memory/issues
- Discord: https://discord.gg/lanonasis