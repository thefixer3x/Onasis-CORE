#!/bin/bash

# Setup Memory Service Suite as Git Submodules in Onasis-CORE
# This maintains independent repos while integrating into the monorepo

set -e

echo "🚀 Setting up Memory Service Suite as submodules..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "turbo.json" ]; then
    echo "❌ Error: Must be run from Onasis-CORE root directory"
    exit 1
fi

# Create services directory if it doesn't exist
mkdir -p services
mkdir -p packages/external
mkdir -p tools

# 1. Add Memory Service as submodule
echo -e "\n${BLUE}Adding Memory Service...${NC}"
if [ ! -d "services/memory-service" ]; then
    git submodule add https://github.com/lanonasis/vibe-memory services/memory-service
    echo -e "${GREEN}✓ Memory Service added${NC}"
else
    echo -e "${YELLOW}⚠ Memory Service already exists${NC}"
fi

# 2. Add SDK as submodule (from the packages directory in vibe-memory)
echo -e "\n${BLUE}Linking Memory SDK...${NC}"
if [ ! -L "packages/external/memory-sdk" ]; then
    ln -s ../../services/memory-service/packages packages/external/memory-sdk
    echo -e "${GREEN}✓ Memory SDK linked${NC}"
else
    echo -e "${YELLOW}⚠ Memory SDK already linked${NC}"
fi

# 3. Add CLI as submodule
echo -e "\n${BLUE}Linking Memory CLI...${NC}"
if [ ! -L "tools/memory-cli" ]; then
    ln -s ../services/memory-service/cli tools/memory-cli
    echo -e "${GREEN}✓ Memory CLI linked${NC}"
else
    echo -e "${YELLOW}⚠ Memory CLI already linked${NC}"
fi

# 4. Add VSCode Extension
echo -e "\n${BLUE}Linking VSCode Extension...${NC}"
if [ ! -L "tools/vscode-memory-extension" ]; then
    ln -s ../services/memory-service/vscode-extension tools/vscode-memory-extension
    echo -e "${GREEN}✓ VSCode Extension linked${NC}"
else
    echo -e "${YELLOW}⚠ VSCode Extension already linked${NC}"
fi

# 5. Add Windsurf Extension
echo -e "\n${BLUE}Linking Windsurf Extension...${NC}"
if [ ! -L "tools/windsurf-memory-extension" ]; then
    ln -s ../services/memory-service/windsurf-extension tools/windsurf-memory-extension
    echo -e "${GREEN}✓ Windsurf Extension linked${NC}"
else
    echo -e "${YELLOW}⚠ Windsurf Extension already linked${NC}"
fi

# 6. Add Cursor Extension
echo -e "\n${BLUE}Linking Cursor Extension...${NC}"
if [ ! -L "tools/cursor-memory-extension" ]; then
    ln -s ../services/memory-service/cursor-extension tools/cursor-memory-extension
    echo -e "${GREEN}✓ Cursor Extension linked${NC}"
else
    echo -e "${YELLOW}⚠ Cursor Extension already linked${NC}"
fi

# Initialize and update submodules
echo -e "\n${BLUE}Initializing submodules...${NC}"
git submodule update --init --recursive

# Create .gitmodules entries for tracking
echo -e "\n${BLUE}Updating .gitmodules...${NC}"
if ! grep -q "memory-service" .gitmodules 2>/dev/null; then
    cat >> .gitmodules << EOL

[submodule "services/memory-service"]
    path = services/memory-service
    url = https://github.com/lanonasis/vibe-memory
    branch = main
EOL
    echo -e "${GREEN}✓ .gitmodules updated${NC}"
fi

# Create package.json workspace entry
echo -e "\n${BLUE}Updating workspace configuration...${NC}"
if [ -f "package.json" ]; then
    # This is a simple append, in production you'd use jq or similar
    echo -e "${YELLOW}⚠ Please manually add these to your package.json workspaces:${NC}"
    echo '  "services/memory-service"'
    echo '  "services/memory-service/cli"'
    echo '  "services/memory-service/packages/*"'
fi

# Update turbo.json
echo -e "\n${BLUE}Creating turbo.json additions...${NC}"
cat > turbo-memory-additions.json << 'EOL'
{
  "pipeline": {
    "memory-service:dev": {
      "cache": false,
      "dependsOn": ["^build"]
    },
    "memory-service:build": {
      "outputs": ["dist/**"],
      "dependsOn": ["^build"]
    },
    "memory-cli:build": {
      "outputs": ["dist/**"],
      "dependsOn": ["memory-service:build"]
    },
    "memory-sdk:build": {
      "outputs": ["dist/**", "lib/**"],
      "dependsOn": []
    },
    "memory-extensions:build": {
      "outputs": ["out/**", "*.vsix"],
      "dependsOn": ["memory-sdk:build"]
    }
  }
}
EOL
echo -e "${GREEN}✓ Created turbo-memory-additions.json${NC}"
echo -e "${YELLOW}⚠ Please merge this with your turbo.json${NC}"

# Create integration script
echo -e "\n${BLUE}Creating integration scripts...${NC}"
cat > services/memory-integration.js << 'EOL'
// Memory Service Integration for Onasis-CORE
const { createProxyMiddleware } = require('http-proxy-middleware');

function integrateMemoryService(app) {
  // Development mode - use local submodule
  if (process.env.NODE_ENV === 'development' && process.env.USE_LOCAL_MEMORY === 'true') {
    console.log('Using local Memory Service from submodule');
    const memoryRouter = require('./memory-service/src/routes');
    app.use('/api/memory', memoryRouter);
  } else {
    // Production mode - proxy to deployed service
    console.log('Proxying to Memory Service at:', process.env.MEMORY_SERVICE_URL);
    const memoryProxy = createProxyMiddleware({
      target: process.env.MEMORY_SERVICE_URL || 'https://api.lanonasis.com',
      changeOrigin: true,
      pathRewrite: { '^/api/memory': '/api/v1' }
    });
    app.use('/api/memory', memoryProxy);
  }
}

module.exports = { integrateMemoryService };
EOL
echo -e "${GREEN}✓ Created memory-integration.js${NC}"

# Create development environment file
echo -e "\n${BLUE}Creating development environment template...${NC}"
cat > .env.memory.example << 'EOL'
# Memory Service Integration
MEMORY_SERVICE_URL=https://api.lanonasis.com
USE_LOCAL_MEMORY=true

# Memory Service Configuration (for local development)
https://<project-ref>.supabase.co
REDACTED_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
REDACTED_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY=your_openai_api_key
REDACTED_JWT_SECRET=REDACTED_JWT_SECRET

# MCP Configuration
ENABLE_MEMORY_MCP=true
MEMORY_MCP_PORT=3002
EOL
echo -e "${GREEN}✓ Created .env.memory.example${NC}"

# Create unified start script
echo -e "\n${BLUE}Creating unified start script...${NC}"
cat > start-with-memory.sh << 'EOL'
#!/bin/bash
# Start Onasis-CORE with Memory Service

echo "Starting Onasis-CORE with Memory Service Suite..."

# Start Memory Service in background
if [ "$USE_LOCAL_MEMORY" = "true" ]; then
    echo "Starting local Memory Service..."
    cd services/memory-service && npm run dev &
    MEMORY_PID=$!
    echo "Memory Service PID: $MEMORY_PID"
fi

# Start main services
npm run dev

# Cleanup on exit
if [ ! -z "$MEMORY_PID" ]; then
    kill $MEMORY_PID
fi
EOL
chmod +x start-with-memory.sh
echo -e "${GREEN}✓ Created start-with-memory.sh${NC}"

# Create README for the integration
echo -e "\n${BLUE}Creating integration README...${NC}"
cat > MEMORY_SERVICE_INTEGRATION.md << 'EOL'
# Memory Service Suite Integration

This directory now includes the complete Memory as a Service (MaaS) suite as git submodules.

## Components Included

1. **Memory Service** (`services/memory-service/`)
   - Main API service with vector search capabilities
   - MCP server integration
   - Published on npm as `@lanonasis/memory-service`

2. **Memory SDK** (`packages/external/memory-sdk/`)
   - TypeScript/JavaScript client library
   - Published on npm as `@lanonasis/memory-client`

3. **Memory CLI** (`tools/memory-cli/`)
   - Command-line interface for memory operations
   - Published on npm as `@lanonasis/cli`

4. **IDE Extensions** (`tools/`)
   - VSCode Extension
   - Windsurf Extension  
   - Cursor Extension

## Working with Submodules

### Initial Setup
```bash
./setup-memory-submodules.sh
```

### Update Submodules
```bash
git submodule update --remote --merge
```

### Development Mode
```bash
# Use local memory service
export USE_LOCAL_MEMORY=true
./start-with-memory.sh
```

### Production Mode
```bash
# Use deployed memory service
export USE_LOCAL_MEMORY=false
export MEMORY_SERVICE_URL=https://api.lanonasis.com
npm run dev
```

## Deployment

Each component maintains its own deployment:
- Memory Service: Deployed to api.lanonasis.com
- SDK/CLI: Published to npm
- Extensions: Published to respective marketplaces

The monorepo integration allows unified development while maintaining independent deployments.
EOL
echo -e "${GREEN}✓ Created MEMORY_SERVICE_INTEGRATION.md${NC}"

echo -e "\n${GREEN}✅ Memory Service Suite integration complete!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Review and commit the changes"
echo "2. Update package.json with workspace entries"
echo "3. Merge turbo-memory-additions.json with turbo.json"
echo "4. Copy .env.memory.example to .env and configure"
echo "5. Run './start-with-memory.sh' to test the integration"

echo -e "\n${YELLOW}Structure created:${NC}"
tree -L 2 services/memory-service tools/ packages/external/ 2>/dev/null || {
    echo "services/"
    echo "  └── memory-service/ (git submodule)"
    echo "tools/"
    echo "  ├── memory-cli/ (symlink)"
    echo "  ├── vscode-memory-extension/ (symlink)"
    echo "  ├── windsurf-memory-extension/ (symlink)"
    echo "  └── cursor-memory-extension/ (symlink)"
    echo "packages/external/"
    echo "  └── memory-sdk/ (symlink)"
}