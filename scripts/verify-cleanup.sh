#!/bin/bash

# Verification script to check if credentials have been successfully removed from Git history
# Run this after cleaning the repository

echo "🔍 Verifying credential removal from Git history..."
echo ""

LEAKED_KEY="[REDACTED_SUPABASE_SERVICE_KEY]"

# Check if credentials exist in Git history
echo "Checking all Git history for leaked credentials..."
FOUND=$(git log --all --full-history -S"$LEAKED_KEY" --oneline)

if [ -z "$FOUND" ]; then
    echo "✅ SUCCESS: No credentials found in Git history!"
    echo ""
    echo "The repository has been successfully cleaned."
else
    echo "❌ FAILED: Credentials still found in Git history!"
    echo ""
    echo "Found in these commits:"
    echo "$FOUND"
    echo ""
    echo "Please run the cleanup script again: ./scripts/cleanup-credential-leak.sh"
    exit 1
fi

# Check current working directory
echo ""
echo "Checking current files for credentials..."
CURRENT_FOUND=$(git grep -l "$LEAKED_KEY" 2>/dev/null || true)

if [ -z "$CURRENT_FOUND" ]; then
    echo "✅ No credentials in current working directory"
else
    echo "❌ WARNING: Credentials found in current files:"
    echo "$CURRENT_FOUND"
    echo ""
    echo "Please remove these before committing!"
    exit 1
fi

# Check if placeholders are being used
echo ""
echo "Verifying placeholders in documentation..."
PLACEHOLDER_COUNT=$(git grep -c "\[your_service_key_here\]" 2>/dev/null || echo "0")

if [ "$PLACEHOLDER_COUNT" != "0" ]; then
    echo "✅ Found $PLACEHOLDER_COUNT instances of placeholder '[your_service_key_here]'"
else
    echo "⚠️  No placeholders found. Make sure documentation uses placeholders."
fi

# Check .gitignore
echo ""
echo "Checking .gitignore for security patterns..."
GITIGNORE_OK=true

if [ ! -f ".gitignore" ]; then
    echo "❌ No .gitignore file found!"
    GITIGNORE_OK=false
else
    grep -q "\.env" .gitignore || { echo "⚠️  .env not in .gitignore"; GITIGNORE_OK=false; }
    grep -q "\.key" .gitignore || { echo "⚠️  *.key not in .gitignore"; GITIGNORE_OK=false; }
    grep -q "\.pem" .gitignore || { echo "⚠️  *.pem not in .gitignore"; GITIGNORE_OK=false; }
    
    if [ "$GITIGNORE_OK" = true ]; then
        echo "✅ .gitignore has appropriate security patterns"
    fi
fi

# Check pre-commit hook
echo ""
echo "Checking for pre-commit hook..."
if [ -x ".git/hooks/pre-commit" ]; then
    echo "✅ Pre-commit hook is installed and executable"
else
    echo "⚠️  Pre-commit hook not installed"
    echo "   Run: ./scripts/setup-security-hooks.sh"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 VERIFICATION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -z "$FOUND" ] && [ -z "$CURRENT_FOUND" ]; then
    echo "✅ Repository is clean and secure!"
    echo ""
    echo "Next steps:"
    echo "1. ✅ Ensure Supabase credentials have been rotated"
    echo "2. ✅ Confirm all team members have updated their repositories"
    echo "3. ✅ Enable GitHub secret scanning if not already enabled"
    echo "4. ✅ Install pre-commit hooks (if not installed)"
    echo ""
    exit 0
else
    echo "❌ Security issues detected!"
    echo ""
    echo "Please address the issues above before considering"
    echo "the repository secure."
    echo ""
    exit 1
fi
