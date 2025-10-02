#!/bin/bash

# Setup script for installing security pre-commit hooks
# This prevents accidental commits of sensitive data

echo "🔒 Setting up security pre-commit hooks..."
echo ""

HOOK_SOURCE="./scripts/pre-commit-hook.sh"
HOOK_TARGET=".git/hooks/pre-commit"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository root directory"
    exit 1
fi

# Check if source hook exists
if [ ! -f "$HOOK_SOURCE" ]; then
    echo "❌ Error: Hook source not found at $HOOK_SOURCE"
    exit 1
fi

# Backup existing hook if it exists
if [ -f "$HOOK_TARGET" ]; then
    echo "⚠️  Existing pre-commit hook found. Creating backup..."
    cp "$HOOK_TARGET" "${HOOK_TARGET}.backup-$(date +%Y%m%d-%H%M%S)"
    echo "✅ Backup created: ${HOOK_TARGET}.backup"
fi

# Install the hook
echo "📦 Installing pre-commit hook..."
cp "$HOOK_SOURCE" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"

# Verify installation
if [ -x "$HOOK_TARGET" ]; then
    echo "✅ Pre-commit hook installed successfully!"
    echo ""
    echo "🛡️  Your repository is now protected against accidental credential commits."
    echo ""
    echo "The hook will check for:"
    echo "  - JWT tokens"
    echo "  - API keys and secrets"
    echo "  - AWS credentials"
    echo "  - Common credential patterns"
    echo "  - Previously leaked credentials"
    echo ""
    echo "📝 Note: You can bypass the hook with 'git commit --no-verify'"
    echo "         (but this is NOT recommended for security reasons)"
    echo ""
else
    echo "❌ Failed to install pre-commit hook"
    exit 1
fi

# Optional: Install git-secrets for additional protection
echo "🔍 Checking for git-secrets..."
if command -v git-secrets &> /dev/null; then
    echo "✅ git-secrets is already installed"
    
    read -p "Configure git-secrets for this repository? (y/n): " configure
    if [ "$configure" = "y" ]; then
        echo "⚙️  Configuring git-secrets..."
        git secrets --install -f
        git secrets --register-aws
        
        # Add custom patterns
        git secrets --add 'eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*'
        git secrets --add 'SUPABASE_SERVICE_KEY=.{20,}'
        git secrets --add 'API_KEY=.{20,}'
        
        echo "✅ git-secrets configured!"
    fi
else
    echo "⚠️  git-secrets is not installed (optional but recommended)"
    echo ""
    echo "To install git-secrets:"
    echo "  macOS:   brew install git-secrets"
    echo "  Linux:   git clone https://github.com/awslabs/git-secrets.git && cd git-secrets && make install"
    echo ""
fi

# Check .gitignore
echo ""
echo "🔍 Checking .gitignore for security patterns..."
if [ -f ".gitignore" ]; then
    MISSING_PATTERNS=()
    
    [ -z "$(grep -F ".env" .gitignore)" ] && MISSING_PATTERNS+=(".env")
    [ -z "$(grep -F ".env.local" .gitignore)" ] && MISSING_PATTERNS+=(".env.local")
    [ -z "$(grep -F "*.key" .gitignore)" ] && MISSING_PATTERNS+=("*.key")
    [ -z "$(grep -F "*.pem" .gitignore)" ] && MISSING_PATTERNS+=("*.pem")
    
    if [ ${#MISSING_PATTERNS[@]} -gt 0 ]; then
        echo "⚠️  Missing .gitignore patterns:"
        for pattern in "${MISSING_PATTERNS[@]}"; do
            echo "    - $pattern"
        done
        echo ""
        read -p "Add these patterns to .gitignore? (y/n): " add_patterns
        if [ "$add_patterns" = "y" ]; then
            echo "" >> .gitignore
            echo "# Security - Prevent credential leaks" >> .gitignore
            for pattern in "${MISSING_PATTERNS[@]}"; do
                echo "$pattern" >> .gitignore
            done
            echo "✅ Patterns added to .gitignore"
        fi
    else
        echo "✅ .gitignore has appropriate security patterns"
    fi
else
    echo "⚠️  No .gitignore file found"
fi

echo ""
echo "🎉 Security setup complete!"
echo ""
echo "📚 Additional resources:"
echo "  - Security incident report: .devops/SECURITY-INCIDENT-CREDENTIAL-LEAK.md"
echo "  - Cleanup script: scripts/cleanup-credential-leak.sh"
echo "  - GitHub security guide: https://docs.github.com/en/code-security"
echo ""
