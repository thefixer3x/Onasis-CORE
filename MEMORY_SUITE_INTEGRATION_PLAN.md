# Memory Service Suite Integration Plan

## 🎩 Executive Summary

Integrating the complete Memory as a Service (MaaS) suite into Onasis-CORE using git submodules, maintaining independence while leveraging centralized infrastructure.

## 🎯 Integration Objectives

1. **Preserve Independence** - Keep vibe-memory as separate repository
2. **Unified Development** - Single workspace for all memory components
3. **MCP Integration** - Ensure all extensions support Model Context Protocol
4. **Microservice Architecture** - Maintain service boundaries
5. **Commercial Readiness** - Keep npm packages and extensions deployable

## 📦 Components to Integrate

### 1. **Memory Service API** 
- Location: `services/memory-service/`
- npm: `@lanonasis/memory-service`
- Deployment: api.lanonasis.com
- MCP: Server mode on port 3002

### 2. **Memory SDK**
- Location: `packages/external/memory-sdk/`
- npm: `@lanonasis/memory-client`
- Version: 1.0.0+
- MCP: Client integration included

### 3. **Memory CLI**
- Location: `tools/memory-cli/`
- npm: `@lanonasis/cli`
- Version: 1.1.0 (with MCP)
- Commands: lanonasis, memory, maas

### 4. **IDE Extensions**
- VSCode: `tools/vscode-memory-extension/`
- Cursor: `tools/cursor-memory-extension/`
- Windsurf: `tools/windsurf-memory-extension/`
- MCP: Enhanced with WebSocket support

## 🔧 Integration Steps

### Phase 1: Submodule Setup
```bash
cd /Users/seyederick/DevOps/_project_folders/Onasis-CORE

# Add vibe-memory as submodule
git submodule add https://github.com/lanonasis/vibe-memory services/memory-service
git submodule update --init --recursive

# Run setup script
./setup-memory-submodules.sh
```

### Phase 2: MCP Enhancement
```bash
# Enhance extensions with MCP
./enhance-extensions-mcp.sh

# Test MCP integration
./test-mcp-extensions.sh
```

### Phase 3: Turbo Configuration
```json
// Add to turbo.json
{
  "pipeline": {
    "memory-service#build": {
      "outputs": ["dist/**"],
      "dependsOn": ["^build"]
    },
    "memory-service#dev": {
      "cache": false,
      "dependsOn": ["^build"]
    },
    "@lanonasis/cli#build": {
      "outputs": ["dist/**"],
      "dependsOn": ["memory-service#build"]
    },
    "@lanonasis/memory-client#build": {
      "outputs": ["dist/**", "lib/**"]
    },
    "memory-extensions#build": {
      "outputs": ["out/**", "*.vsix"],
      "dependsOn": ["@lanonasis/memory-client#build"]
    }
  }
}
```

### Phase 4: Workspace Configuration
```json
// Add to package.json workspaces
{
  "workspaces": [
    "packages/*",
    "services/*",
    "tools/*",
    "services/memory-service",
    "services/memory-service/cli",
    "services/memory-service/packages",
    "services/memory-service/vscode-extension",
    "services/memory-service/cursor-extension",
    "services/memory-service/windsurf-extension"
  ]
}
```

## 🔄 Unified Workflow

### Development
```bash
# Start all services with memory
./start-with-memory.sh

# Or start individually
turbo run dev --filter=memory-service
turbo run dev --filter=@lanonasis/cli
```

### Building
```bash
# Build everything
turbo run build

# Build memory components only
turbo run build --filter=...memory-service
```

### Testing
```bash
# Test all
turbo run test

# Test with MCP
npm run test:mcp --workspace=services/memory-service
```

### Deployment
```bash
# Deploy complete suite
./deployment/deploy-memory-suite.sh production

# Deploy individually
turbo run deploy --filter=memory-service
```

## 🌐 Service Integration Points

### 1. **Onasis Gateway Integration**
```javascript
// In unified-router.js
const { integrateMemoryService } = require('./services/memory-integration');
integrateMemoryService(app);
```

### 2. **Privacy Layer**
```javascript
// Wrap memory service with privacy
app.use('/api/memory', [
  privacyMiddleware({
    service: 'memory',
    anonymize: ['user_email', 'ip_address']
  }),
  memoryServiceProxy
]);
```

### 3. **MCP Server Registration**
```javascript
// Register with MCP orchestrator
mcpRegistry.register({
  name: 'memory-service',
  url: 'ws://localhost:3002',
  tools: [
    'memory_create_memory',
    'memory_search_memories',
    'memory_list_memories',
    // ... other tools
  ]
});
```

## 🛠️ Maintenance Strategy

### Submodule Updates
```bash
# Update to latest
git submodule update --remote --merge

# Update specific version
cd services/memory-service
git checkout v1.2.0
cd ../..
git add services/memory-service
git commit -m "Update memory-service to v1.2.0"
```

### Release Process
1. Update memory-service in its own repo
2. Tag release (e.g., v1.2.0)
3. Update submodule reference in Onasis-CORE
4. Publish npm packages
5. Build and release extensions

### Version Synchronization
```bash
# Script to sync versions
#!/bin/bash
VERSION=$(cd services/memory-service && node -p "require('./package.json').version")
echo "Memory Service Version: $VERSION"

# Update all references
for pkg in cli packages vscode-extension cursor-extension windsurf-extension; do
  echo "Updating $pkg to $VERSION"
  cd services/memory-service/$pkg
  npm version $VERSION
  cd -
done
```

## 📊 Success Metrics

- [ ] All components accessible through Onasis-CORE
- [ ] MCP working in all IDE extensions
- [ ] Turbo pipeline builds successfully
- [ ] Independent deployment still functional
- [ ] npm packages continue to publish
- [ ] No breaking changes to existing APIs

## 🔮 Future Enhancements

1. **Unified MCP Gateway** - Single MCP endpoint for all services
2. **Service Mesh** - Advanced routing and load balancing
3. **Federated Search** - Search across all Onasis services
4. **Unified Billing** - Integrated usage tracking
5. **Cross-Service Auth** - Single sign-on across services

## 📝 Notes

- Submodule approach allows independent versioning
- MCP enhancement critical for AI assistant integration
- Extensions must support both REST and MCP modes
- Commercial packages remain independently deployable
- Privacy layer applies at gateway level