#!/bin/bash
# Pre-commit hook to prevent committing sensitive data
# Install: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

# Patterns to check for sensitive data
PATTERNS=(
    # JWT tokens
    "eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*"
    
    # API keys and secrets
    "SUPABASE_SERVICE_KEY=.{20,}"
    "SUPABASE_ANON_KEY=.{20,}"
    "API_KEY=.{20,}"
    "SECRET_KEY=.{20,}"
    "PRIVATE_KEY=.{20,}"
    
    # AWS credentials
    "AKIA[0-9A-Z]{16}"
    "aws_access_key_id\s*=\s*.{20,}"
    "aws_secret_access_key\s*=\s*.{40,}"
    
    # Common credential patterns
    "password\s*=\s*['\"][^'\"]{8,}['\"]"
    "token\s*=\s*['\"][^'\"]{20,}['\"]"
    
    # Specific leaked key (for this incident)
    "[REDACTED_SUPABASE_SERVICE_KEY]"
)

# Files to exclude from checking
EXCLUDE_PATTERNS=(
    ".env.example"
    ".env.template"
    "*.md"  # Documentation files with examples
    "*.txt" # Text files with examples
)

# ANSI colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Checking for sensitive data in staged files..."

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

# If no staged files, exit
if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

FOUND_SENSITIVE=false

# Check each staged file
for FILE in $STAGED_FILES; do
    # Skip if file should be excluded
    SKIP=false
    for EXCLUDE in "${EXCLUDE_PATTERNS[@]}"; do
        if [[ $FILE == $EXCLUDE ]]; then
            SKIP=true
            break
        fi
    done
    
    if [ "$SKIP" = true ]; then
        continue
    fi
    
    # Check if file exists (might be deleted)
    if [ ! -f "$FILE" ]; then
        continue
    fi
    
    # Check for each pattern
    for PATTERN in "${PATTERNS[@]}"; do
        if grep -qE "$PATTERN" "$FILE"; then
            echo -e "${RED}❌ Potential sensitive data found in: $FILE${NC}"
            echo -e "${YELLOW}   Pattern matched: $PATTERN${NC}"
            FOUND_SENSITIVE=true
        fi
    done
done

if [ "$FOUND_SENSITIVE" = true ]; then
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}⚠️  COMMIT BLOCKED: Sensitive data detected!${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Please remove sensitive data before committing."
    echo ""
    echo "If this is a false positive, you can:"
    echo "1. Add the file to .gitignore"
    echo "2. Use placeholders like [your_key_here] in documentation"
    echo "3. Store credentials in .env files (ensure .env is in .gitignore)"
    echo "4. Override with: git commit --no-verify (NOT RECOMMENDED)"
    echo ""
    exit 1
fi

echo "✅ No sensitive data detected. Proceeding with commit."
exit 0
