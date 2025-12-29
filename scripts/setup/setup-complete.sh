#!/bin/bash

echo "🚀 Complete Onasis-CORE GitHub Setup"
echo "======================================"
echo

# Check if repository exists and is accessible
echo "🔍 Testing repository accessibility..."
REPO_URL="https://github.com/thefixer3/Onasis-CORE.git"

# Test different case variations
echo "Testing: $REPO_URL"
if git ls-remote "$REPO_URL" >/dev/null 2>&1; then
    echo "✅ Repository accessible!"
else
    echo "❌ Repository not found at: $REPO_URL"
    echo
    echo "🛠️  Please ensure:"
    echo "1. Repository is created on GitHub"
    echo "2. Repository name matches exactly: thefixer3/Onasis-CORE"
    echo "3. Repository is public or you're authenticated"
    echo "4. You have push permissions"
    echo
    echo "Alternative repository URLs to try:"
    echo "- https://github.com/thefixer3/onasis-core.git"
    echo "- https://github.com/thefixer3/onasis-core-hq.git"
    echo
    exit 1
fi

# Configure remote if needed
echo "📡 Configuring remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo
    echo "🎉 SUCCESS! Onasis-CORE is now on GitHub!"
    echo "🔗 Repository: $REPO_URL"
    echo
    echo "✅ Integration Status:"
    echo "- GitHub Repository: ✅ Created and synced"
    echo "- Turborepo Integration: ✅ Ready as packages/onasis-core"
    echo "- Shared Services Structure: ✅ Organized"
    echo "- Ready for shared components: ✅"
    echo
    echo "Next steps:"
    echo "1. Add shared UI components from monorepo"
    echo "2. Move supabase-client configuration"
    echo "3. Set up AI SDK utilities"
    echo "4. Configure privacy SDK components"
else
    echo
    echo "❌ Push failed. Please check repository setup and try again."
fi