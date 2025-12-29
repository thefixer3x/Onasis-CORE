#!/bin/bash

# Setup GitHub Remote for Onasis-CORE
# Usage: ./setup-github-remote.sh [your-github-username]

if [ -z "$1" ]; then
    echo "❌ Please provide your GitHub username"
    echo "Usage: ./setup-github-remote.sh [your-github-username]"
    exit 1
fi

USERNAME="$1"
REPO_URL="https://github.com/$USERNAME/onasis-core-hq.git"

echo "🚀 Setting up GitHub remote for Onasis-CORE"
echo "Repository: $REPO_URL"
echo

# Configure git remote
echo "📡 Adding remote origin..."
git remote add origin "$REPO_URL" 2>/dev/null || {
    echo "Remote already exists, updating..."
    git remote set-url origin "$REPO_URL"
}

# Update package.json with correct username
echo "📝 Updating package.json with correct username..."
sed -i.bak "s/\[username\]/$USERNAME/g" package.json && rm package.json.bak

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub!"
    echo "🔗 Repository URL: $REPO_URL"
    echo
    echo "Next steps:"
    echo "1. ✅ Onasis-CORE is now on GitHub"
    echo "2. ✅ Integrated into Turborepo as packages/onasis-core"
    echo "3. 🔄 Ready to add shared components as additional commits"
else
    echo "❌ Push failed. Please check:"
    echo "1. Repository exists on GitHub"
    echo "2. You have push permissions"
    echo "3. Repository name is 'onasis-core-hq'"
fi