#!/bin/bash

# EMERGENCY CREDENTIAL SCRUB SCRIPT
# Purpose: Remove all instances of leaked Supabase service key
# Date: October 13, 2025
# CRITICAL: Run this immediately!

set -e

echo "🚨 EMERGENCY: Scrubbing leaked credentials from repository"
echo "============================================================"

# The leaked credential pattern (using regex pattern, not actual key)
LEAKED_KEY_PATTERN="eyJhbGci[a-zA-Z0-9._-]{100,200}"
REPLACEMENT="[REDACTED_SUPABASE_SERVICE_KEY]"

# Backup directory
BACKUP_DIR=".credential-scrub-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📁 Creating backups in: $BACKUP_DIR"

# Files to scrub
FILES=(
  ".devops/SECURITY-INCIDENT-CREDENTIAL-LEAK.md"
  "URGENT-CREDENTIAL-LEAK-ACTION-REQUIRED.md"
  "scripts/pre-commit-hook.sh"
  "scripts/cleanup-credential-leak.sh"
  "scripts/README-CREDENTIAL-REMEDIATION.md"
  "scripts/verify-cleanup.sh"
)

# Scrub each file
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "🔧 Scrubbing: $file"
    
    # Create backup
    cp "$file" "$BACKUP_DIR/$(basename $file).backup"
    
    # Replace the leaked key with placeholder
    # Use perl for more reliable multi-line replacement
    perl -i -pe "s/${LEAKED_KEY_PATTERN}[^\"\\s]*/${REPLACEMENT}/g" "$file"
    
    echo "   ✅ Scrubbed: $file"
  else
    echo "   ⚠️  File not found: $file"
  fi
done

echo ""
echo "✅ Credential scrub complete!"
echo ""
echo "📊 Summary:"
echo "   - Files scrubbed: ${#FILES[@]}"
echo "   - Backups location: $BACKUP_DIR"
echo ""
echo "🔴 CRITICAL NEXT STEPS:"
echo "   1. ⚠️  ROTATE THE LEAKED KEY IMMEDIATELY in Supabase dashboard"
echo "   2. Review changes: git diff"
echo "   3. Commit changes: git add -A && git commit -m 'security: scrub leaked credentials'"
echo "   4. Force push: git push origin main --force"
echo "   5. Verify cleanup: ./scripts/verify-cleanup.sh"
echo ""
echo "🔗 Supabase Dashboard: https://app.supabase.com/project/mxtsdgkwzjzlttpotole/settings/api"
echo ""
