<!-- Draft PR: Remove legacy unified-router duplicates -->

Files to remove (after production verification):

- apps/onasis-core/unified-router.cjs
- apps/onasis-core/scripts/unified-router.js
- scripts/router/unified-router.cjs

Suggested steps:

```bash
# Create branch
git checkout -b cleanup/unified-router-remove-duplicates

# Remove files
git rm apps/onasis-core/unified-router.cjs
git rm apps/onasis-core/scripts/unified-router.js
git rm scripts/router/unified-router.cjs

# Update REORGANIZE_MONOREPO.sh and docs referencing these files
git add REORGANIZE_MONOREPO.sh docs/DOMAIN_MIGRATION_AUDIT.md apps/onasis-core/docs/cleanup/ACTIVE-COMPONENT-INVENTORY.md

git commit -m "chore(router): remove legacy unified-router duplicates, canonicalize to apps/onasis-core/services/unified-router"
git push -u origin HEAD

# Open PR with description:
# - Summary of changes
# - Smoke-test checklist
# - Rollback steps (revert branch)
```

Notes:
- Do NOT delete these files until the new service is healthy in production and Netlify/load-balancer rules have stabilized.

