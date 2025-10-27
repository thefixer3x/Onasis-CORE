#!/bin/bash

# Test Auth Gateway with PM2 locally before VPS deployment
# This replicates the VPS environment on your local machine

set -e

echo "🧪 Testing Auth Gateway with PM2 (Local VPS Simulation)"
echo "========================================================"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 PM2 not installed. Installing globally..."
    npm install -g pm2
    echo "✅ PM2 installed"
fi

echo "📋 Current directory: $(pwd)"
echo ""

# Step 1: Build
echo "🔨 Step 1: Building TypeScript..."
npm run build

if [ ! -f "dist/src/index.js" ]; then
    echo "❌ Build failed - dist/src/index.js not found"
    exit 1
fi

echo "✅ Build complete - dist/src/index.js exists"
echo ""

# Step 2: Stop existing PM2 process if running
echo "🛑 Step 2: Stopping existing PM2 process (if any)..."
pm2 stop auth-gateway 2>/dev/null || echo "   No existing process to stop"
pm2 delete auth-gateway 2>/dev/null || echo "   No existing process to delete"
echo ""

# Step 3: Start with PM2
echo "🚀 Step 3: Starting with PM2..."
pm2 start ecosystem.config.cjs --env production

echo ""
echo "⏳ Waiting 3 seconds for server to start..."
sleep 3
echo ""

# Step 4: Check status
echo "📊 Step 4: Checking PM2 status..."
pm2 status
echo ""

# Step 5: Test endpoints
echo "🧪 Step 5: Testing endpoints..."
echo ""

echo "1. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:4000/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo "   ✅ Health endpoint OK"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo "   ❌ Health endpoint failed"
    echo "   Response: $HEALTH_RESPONSE"
fi
echo ""

echo "2. Testing CLI token verification..."
TEST_TOKEN="cli_$(date +%s)000_testtoken123"
VERIFY_RESPONSE=$(curl -s -X POST http://localhost:4000/v1/auth/verify-token \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TEST_TOKEN\"}")

if echo "$VERIFY_RESPONSE" | grep -q '"valid":true'; then
    echo "   ✅ Token verification OK"
    echo "   Response: $VERIFY_RESPONSE"
else
    echo "   ❌ Token verification failed"
    echo "   Response: $VERIFY_RESPONSE"
fi
echo ""

# Step 6: Show logs
echo "📋 Step 6: Recent logs (last 20 lines)..."
pm2 logs auth-gateway --lines 20 --nostream
echo ""

# Step 7: Summary
echo "========================================================"
echo "✅ PM2 Test Complete!"
echo ""
echo "📊 Quick Commands:"
echo "   pm2 status              - Check process status"
echo "   pm2 logs auth-gateway   - View live logs"
echo "   pm2 monit               - Real-time monitoring"
echo "   pm2 restart auth-gateway - Restart process"
echo "   pm2 stop auth-gateway    - Stop process"
echo "   pm2 delete auth-gateway  - Remove process"
echo ""
echo "🧪 Test CLI Integration:"
echo "   cd ../../lanonasis-maas/cli"
echo "   ./dist/index-simple.js auth login"
echo ""
echo "🔄 When done testing:"
echo "   pm2 stop auth-gateway && pm2 delete auth-gateway"
echo ""
echo "🚀 Ready for VPS deployment!"
echo "   Review: ./DEPLOYMENT-ANALYSIS.md"
echo "========================================================"
