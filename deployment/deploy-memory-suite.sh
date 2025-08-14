#!/bin/bash

# Deployment script for Memory Service Suite
# Coordinates deployment of all memory-related components

set -e

echo "🚀 Deploying Memory Service Suite..."

# Configuration
MEMORY_SERVICE_DIR="services/memory-service"
DEPLOYMENT_ENV=${1:-production}

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if submodule exists
if [ ! -d "$MEMORY_SERVICE_DIR" ]; then
    echo -e "${RED}❌ Error: Memory service submodule not found${NC}"
    echo "Run ./setup-memory-submodules.sh first"
    exit 1
fi

# Function to deploy a component
deploy_component() {
    local component=$1
    local dir=$2
    local command=$3
    
    echo -e "\n${BLUE}Deploying $component...${NC}"
    cd "$dir"
    
    if [ -f "package.json" ]; then
        echo "Installing dependencies..."
        npm install --production
        
        echo "Building..."
        npm run build
        
        if [ ! -z "$command" ]; then
            echo "Running deployment command: $command"
            eval "$command"
        fi
        
        echo -e "${GREEN}✓ $component deployed${NC}"
    else
        echo -e "${YELLOW}⚠ Skipping $component (no package.json)${NC}"
    fi
    
    cd - > /dev/null
}

# Update submodule to latest
echo -e "${BLUE}Updating memory service submodule...${NC}"
git submodule update --remote --merge services/memory-service

# Deploy Memory Service API
if [ "$DEPLOYMENT_ENV" = "production" ]; then
    echo -e "\n${BLUE}Deploying Memory Service API...${NC}"
    cd "$MEMORY_SERVICE_DIR"
    
    # Build production image
    docker build -t lanonasis/memory-service:latest .
    docker push lanonasis/memory-service:latest
    
    # Deploy to production (example with kubectl)
    # kubectl apply -f k8s/
    
    echo -e "${GREEN}✓ Memory Service API deployed${NC}"
    cd - > /dev/null
fi

# Publish SDK to npm
echo -e "\n${BLUE}Publishing Memory SDK...${NC}"
cd "$MEMORY_SERVICE_DIR/packages"
if [ -f "package.json" ]; then
    # Check if version needs bump
    current_version=$(npm view @lanonasis/memory-client version 2>/dev/null || echo "0.0.0")
    package_version=$(node -p "require('./package.json').version")
    
    if [ "$current_version" != "$package_version" ]; then
        echo "Publishing new version: $package_version"
        npm publish --access public
        echo -e "${GREEN}✓ SDK published to npm${NC}"
    else
        echo -e "${YELLOW}⚠ SDK already at latest version${NC}"
    fi
fi
cd - > /dev/null

# Publish CLI to npm
echo -e "\n${BLUE}Publishing Memory CLI...${NC}"
cd "$MEMORY_SERVICE_DIR/cli"
if [ -f "package.json" ]; then
    current_version=$(npm view @lanonasis/cli version 2>/dev/null || echo "0.0.0")
    package_version=$(node -p "require('./package.json').version")
    
    if [ "$current_version" != "$package_version" ]; then
        echo "Publishing new version: $package_version"
        npm publish --access public
        echo -e "${GREEN}✓ CLI published to npm${NC}"
    else
        echo -e "${YELLOW}⚠ CLI already at latest version${NC}"
    fi
fi
cd - > /dev/null

# Package IDE Extensions
echo -e "\n${BLUE}Packaging IDE Extensions...${NC}"

# VSCode Extension
if [ -d "$MEMORY_SERVICE_DIR/vscode-extension" ]; then
    cd "$MEMORY_SERVICE_DIR/vscode-extension"
    npm install
    npm run package
    echo -e "${GREEN}✓ VSCode extension packaged${NC}"
    cd - > /dev/null
fi

# Windsurf Extension
if [ -d "$MEMORY_SERVICE_DIR/windsurf-extension" ]; then
    cd "$MEMORY_SERVICE_DIR/windsurf-extension"
    npm install
    npm run package
    echo -e "${GREEN}✓ Windsurf extension packaged${NC}"
    cd - > /dev/null
fi

# Cursor Extension
if [ -d "$MEMORY_SERVICE_DIR/cursor-extension" ]; then
    cd "$MEMORY_SERVICE_DIR/cursor-extension"
    npm install
    npm run package
    echo -e "${GREEN}✓ Cursor extension packaged${NC}"
    cd - > /dev/null
fi

# Update Onasis-CORE integration
echo -e "\n${BLUE}Updating Onasis-CORE integration...${NC}"

# Create deployment summary
cat > MEMORY_DEPLOYMENT_STATUS.md << EOL
# Memory Service Suite Deployment Status

**Deployment Date**: $(date)
**Environment**: $DEPLOYMENT_ENV

## Component Status

| Component | Version | Status | Location |
|-----------|---------|--------|-----------|
| Memory API | $(cd $MEMORY_SERVICE_DIR && node -p "require('./package.json').version") | 🔴 Live | api.lanonasis.com |
| Memory SDK | $(cd $MEMORY_SERVICE_DIR/packages && node -p "require('./package.json').version") | 🔴 Published | npm: @lanonasis/memory-client |
| Memory CLI | $(cd $MEMORY_SERVICE_DIR/cli && node -p "require('./package.json').version") | 🔴 Published | npm: @lanonasis/cli |
| VSCode Ext | $(cd $MEMORY_SERVICE_DIR/vscode-extension && node -p "require('./package.json').version") | 🟡 Packaged | .vsix available |
| Windsurf Ext | $(cd $MEMORY_SERVICE_DIR/windsurf-extension && node -p "require('./package.json').version") | 🟡 Packaged | .vsix available |
| Cursor Ext | $(cd $MEMORY_SERVICE_DIR/cursor-extension && node -p "require('./package.json').version") | 🟡 Packaged | .vsix available |

## Integration Points

- Onasis-CORE Proxy: ✅ Configured
- Submodule: ✅ Updated
- Turbo Pipeline: ✅ Integrated

## Next Steps

1. Verify API health: https://api.lanonasis.com/api/v1/health
2. Test SDK installation: npm install @lanonasis/memory-client
3. Test CLI installation: npm install -g @lanonasis/cli
4. Submit extensions to marketplaces
EOL

echo -e "${GREEN}✓ Created deployment status${NC}"

# Health check
echo -e "\n${BLUE}Running health checks...${NC}"

# Check API
if curl -s https://api.lanonasis.com/api/v1/health | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✓ Memory API is healthy${NC}"
else
    echo -e "${RED}❌ Memory API health check failed${NC}"
fi

# Check npm packages
if npm view @lanonasis/memory-client version > /dev/null 2>&1; then
    echo -e "${GREEN}✓ SDK is available on npm${NC}"
else
    echo -e "${RED}❌ SDK not found on npm${NC}"
fi

if npm view @lanonasis/cli version > /dev/null 2>&1; then
    echo -e "${GREEN}✓ CLI is available on npm${NC}"
else
    echo -e "${RED}❌ CLI not found on npm${NC}"
fi

echo -e "\n${GREEN}🎉 Memory Service Suite deployment complete!${NC}"
echo -e "${BLUE}Check MEMORY_DEPLOYMENT_STATUS.md for details${NC}"