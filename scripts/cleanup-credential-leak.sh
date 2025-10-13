#!/bin/bash

# Git History Cleanup Script for Leaked Credentials
# This script removes accidentally committed Supabase credentials from Git history
# 
# WARNING: This will rewrite Git history and requires force push
# Make sure to coordinate with all team members before running

set -e

echo "============================================"
echo "Git History Cleanup - Credential Removal"
echo "============================================"
echo ""
echo "⚠️  WARNING: This will rewrite Git history!"
echo ""
echo "Before proceeding, ensure:"
echo "1. ✅ You have ALREADY rotated the Supabase credentials"
echo "2. ✅ All team members have been notified"
echo "3. ✅ You have backed up the repository"
echo "4. ✅ You have admin access to force push"
echo ""
read -p "Have you completed all the above steps? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Aborting. Please complete the prerequisites first."
    exit 1
fi

# Define the sensitive string to remove
LEAKED_KEY="[REDACTED_SUPABASE_SERVICE_KEY]"
REPLACEMENT="[REDACTED_CREDENTIAL_REMOVED_FROM_HISTORY]"

echo ""
echo "📋 Cleanup Method Selection:"
echo "1) git-filter-repo (Recommended - Fast and safe)"
echo "2) BFG Repo-Cleaner (Alternative - Very fast)"
echo "3) git filter-branch (Built-in - Slower)"
echo ""
read -p "Select method (1/2/3): " method

case $method in
    1)
        echo ""
        echo "🔧 Using git-filter-repo method..."
        
        # Check if git-filter-repo is installed
        if ! command -v git-filter-repo &> /dev/null; then
            echo "📦 Installing git-filter-repo..."
            pip3 install git-filter-repo || {
                echo "❌ Failed to install git-filter-repo"
                echo "Please install manually: pip3 install git-filter-repo"
                exit 1
            }
        fi
        
        echo "🔍 Creating backup..."
        git clone --mirror . ../Onasis-CORE-backup-$(date +%Y%m%d-%H%M%S)
        
        echo "🧹 Cleaning history..."
        # Create a temporary Python script for the replacement
        cat > /tmp/filter-script.py << 'EOF'
import sys
import re

leaked_key = b"[REDACTED_SUPABASE_SERVICE_KEY]"
replacement = b"[REDACTED_CREDENTIAL_REMOVED_FROM_HISTORY]"

blob = sys.stdin.buffer.read()
blob = blob.replace(leaked_key, replacement)
sys.stdout.buffer.write(blob)
EOF
        
        git filter-repo --blob-callback "$(cat /tmp/filter-script.py)" --force
        rm /tmp/filter-script.py
        ;;
        
    2)
        echo ""
        echo "🔧 Using BFG Repo-Cleaner method..."
        
        # Check if BFG is available
        if [ ! -f "bfg.jar" ]; then
            echo "📦 Downloading BFG Repo-Cleaner..."
            wget -O bfg.jar https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar || {
                echo "❌ Failed to download BFG"
                echo "Please download manually from: https://rtyley.github.io/bfg-repo-cleaner/"
                exit 1
            }
        fi
        
        echo "🔍 Creating backup..."
        git clone --mirror . ../Onasis-CORE-backup-$(date +%Y%m%d-%H%M%S)
        
        echo "🧹 Cleaning history..."
        # Create file with the sensitive string
        echo "$LEAKED_KEY" > /tmp/passwords.txt
        java -jar bfg.jar --replace-text /tmp/passwords.txt .
        rm /tmp/passwords.txt
        
        # Cleanup
        git reflog expire --expire=now --all
        git gc --prune=now --aggressive
        ;;
        
    3)
        echo ""
        echo "🔧 Using git filter-branch method..."
        echo "⚠️  This may take a while..."
        
        echo "🔍 Creating backup..."
        git clone --mirror . ../Onasis-CORE-backup-$(date +%Y%m%d-%H%M%S)
        
        echo "🧹 Cleaning history..."
        git filter-branch --tree-filter "
            if [ -f MCP_SERVER_CHECKPOINT.md ]; then
                sed -i 's/$LEAKED_KEY/$REPLACEMENT/g' MCP_SERVER_CHECKPOINT.md
            fi
        " --tag-name-filter cat -- --all
        
        # Cleanup
        git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d
        git reflog expire --expire=now --all
        git gc --prune=now --aggressive
        ;;
        
    *)
        echo "❌ Invalid selection"
        exit 1
        ;;
esac

echo ""
echo "✅ History cleaned successfully!"
echo ""
echo "📤 Next steps:"
echo "1. Review the changes: git log --oneline"
echo "2. Force push to remote: git push origin --force --all"
echo "3. Force push tags: git push origin --force --tags"
echo "4. Notify all team members to re-clone or reset their repositories"
echo ""
read -p "Do you want to force push now? (yes/no): " push_confirm

if [ "$push_confirm" = "yes" ]; then
    echo "📤 Force pushing to origin..."
    git push origin --force --all
    git push origin --force --tags
    echo "✅ Push complete!"
    echo ""
    echo "🔔 IMPORTANT: Notify all team members with these instructions:"
    echo ""
    echo "   git fetch origin"
    echo "   git reset --hard origin/main  # or their branch name"
    echo "   git reflog expire --expire=now --all"
    echo "   git gc --prune=now --aggressive"
    echo ""
else
    echo "⏸️  Push skipped. When ready, run:"
    echo "   git push origin --force --all"
    echo "   git push origin --force --tags"
fi

echo ""
echo "📝 Don't forget to:"
echo "1. ✅ Verify credentials are removed: git log -S '$LEAKED_KEY'"
echo "2. ✅ Update your security incident report"
echo "3. ✅ Enable GitHub secret scanning"
echo "4. ✅ Install pre-commit hooks to prevent future leaks"
echo ""
echo "✨ Cleanup complete!"
