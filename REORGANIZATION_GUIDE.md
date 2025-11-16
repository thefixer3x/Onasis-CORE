# Onasis-Core Reorganization Guide

**Date**: November 16, 2025  
**Status**: Ready to Execute  
**Based on**: `docs/cleanup/DOC-REORG-PLAN.md`

---

## Overview

This guide provides a systematic approach to reorganizing the onasis-core codebase. The reorganization will:

1. ✅ Clean up the root directory (currently 80+ files)
2. ✅ Group documentation by domain (auth, deployment, security, etc.)
3. ✅ Archive historical fix summaries
4. ✅ Maintain canonical references for active development
5. ✅ Improve discoverability and maintainability

---

## Current State

### Root Directory Issues

- **80+ files** in the root directory
- Mix of active docs, historical fixes, and test scripts
- Difficult to find relevant documentation
- Multiple versions of similar documents
- No clear organization

### What Needs Organizing

**Documentation** (30+ MD files):

- Authentication fixes and architecture
- Database migration summaries
- Deployment guides
- Service-specific docs
- Historical fix summaries

**Scripts** (20+ files):

- Test scripts
- Setup scripts
- Migration scripts
- Router configurations

**Configuration** (10+ files):

- Environment templates
- Build configs
- Service configs

---

## Reorganization Plan

### Phase 0: Canonical References (Current)

These locations are the **source of truth** and should NOT be moved:

| Area              | Location                                          | Contents              |
| ----------------- | ------------------------------------------------- | --------------------- |
| Auth Gateway PKCE | `services/auth-gateway/auth-gateway-oauth2-pkce/` | OAuth2 implementation |
| Memory Service    | `docs/memory/` + `netlify/functions/maas-api.js`  | MaaS documentation    |
| Netlify Routing   | `_redirects`, `netlify/functions/*.js`            | Production endpoints  |

### Phase 1: New Folder Structure

```
apps/onasis-core/
├── docs/
│   ├── auth/                    # Authentication documentation
│   │   ├── legacy/              # Historical auth fixes
│   │   ├── analysis/            # Deep-dive analysis
│   │   ├── AUTHENTICATION-ARCHITECTURE.md
│   │   ├── UNIFIED-AUTH-COMPLETE.md
│   │   └── UNIFIED-AUTH-MIGRATION-PLAN.md
│   │
│   ├── deployment/              # Deployment guides
│   │   ├── netlify/             # Netlify-specific
│   │   ├── databases/           # Database migrations
│   │   │   └── legacy/          # Historical DB fixes
│   │   └── pm2/                 # PM2 process management
│   │
│   ├── api-gateway/             # API Gateway docs
│   ├── mcp/                     # MCP documentation
│   ├── frontend/                # Frontend docs
│   │   └── legacy/              # Historical frontend fixes
│   ├── security/                # Security documentation
│   └── history/                 # Changelog and history
│       └── CHANGELOG-2024.md
│
├── .archive/                    # Historical archives
│   ├── 2024-fixes/              # Completed fix summaries
│   └── incidents/               # Security incidents
│
├── scripts/                     # All scripts organized
│   ├── test/                    # Test scripts
│   ├── setup/                   # Setup scripts
│   └── migration/               # Migration scripts
│
└── [Root files]                 # Only essential files
    ├── README.md
    ├── FINAL-STATUS.md
    ├── INFRASTRUCTURE-CHECK.md
    └── TYPESCRIPT_ERRORS_EXPLAINED.md
```

### Phase 2: File Movements

#### Authentication Documentation

**Move to `docs/auth/`**:

- `AUTHENTICATION-ARCHITECTURE.md`
- `UNIFIED-AUTH-COMPLETE.md`
- `UNIFIED-AUTH-MIGRATION-PLAN.md`

**Move to `docs/auth/legacy/`**:

- `AUTH-FIX-SUMMARY.md`
- `AUTH-SERVER-FIX-SUMMARY.md`
- `DASHBOARD-AUTH-FIX-COMPLETE.md`

**Move to `docs/auth/analysis/`**:

- `DUAL-AUTH-ANALYSIS.md`
- `auth-routing-analysis.md`

#### Deployment Documentation

**Move to `docs/deployment/netlify/`**:

- `NETLIFY-AUTH-FIX.md`

**Move to `docs/deployment/databases/`**:

- `NEON-DATABASE-UPDATE.md`

**Move to `docs/deployment/databases/legacy/`**:

- `DATABASE-FIX-SUMMARY.md`

**Move to `docs/deployment/pm2/`**:

- `PM2-STABILITY-FIX.md`

#### Service Documentation

**Move to `docs/api-gateway/`**:

- `API-GATEWAY-AUTH-FIX.md`

**Move to `docs/mcp/`**:

- `WEBSOCKET-STABILITY-FIXES.md`

**Move to `docs/frontend/legacy/`**:

- `FRONTEND-FIX-REQUIRED.md`

**Move to `docs/security/`**:

- `SERVICE-AUDIT-SUMMARY.md`
- `OAUTH2-SYSTEM-SAFETY-REPORT.md`

#### Historical Archives

**Move to `.archive/2024-fixes/`**:

- `COMPLETE-FIX-SUMMARY.md`
- `ACTUAL-FIX-SUMMARY.md`
- `ACTUAL-PROBLEM-IDENTIFIED.md`
- `CRITICAL-SYNC-SUMMARY.md`
- `FINAL-SOLUTION-SUMMARY.md`

**Move to `.archive/incidents/`**:

- `URGENT-CREDENTIAL-LEAK-ACTION-REQUIRED.md`

---

## Execution

### Option 1: Automated Script (Recommended)

```bash
cd apps/onasis-core
./REORGANIZE_ONASIS_CORE.sh
```

The script will:

1. Create new folder structure
2. Move files using `git mv` (preserves history)
3. Create README files for each new folder
4. Generate a changelog
5. Show summary of changes

### Option 2: Manual Execution

If you prefer to do it manually or in stages:

```bash
cd apps/onasis-core

# Create folders
mkdir -p docs/auth/{legacy,analysis}
mkdir -p docs/deployment/{netlify,databases/legacy,pm2}
mkdir -p docs/{api-gateway,mcp,frontend/legacy,security,history}
mkdir -p .archive/{2024-fixes,incidents}

# Move files (example)
git mv AUTHENTICATION-ARCHITECTURE.md docs/auth/
git mv AUTH-FIX-SUMMARY.md docs/auth/legacy/
# ... continue for all files

# Commit
git commit -m "docs: reorganize onasis-core structure"
```

---

## Post-Reorganization Tasks

### 1. Update Cross-References

Some documents may reference other documents by relative path. Update these references:

```bash
# Find all markdown files with relative links
grep -r "\.\./.*\.md" docs/

# Update paths as needed
```

### 2. Update External References

Check if any external tools or documentation reference the old paths:

- CI/CD workflows
- Onboarding documentation
- README files in other repos
- Wiki pages

### 3. Update .gitignore

Ensure the new `.archive/` folder is tracked:

```bash
# Check .gitignore doesn't exclude .archive/
cat .gitignore | grep archive
```

### 4. Test Links

```bash
# Install markdown link checker
npm install -g markdown-link-check

# Check all markdown files
find docs -name "*.md" -exec markdown-link-check {} \;
```

---

## Benefits

### Before Reorganization

- ❌ 80+ files in root directory
- ❌ Hard to find relevant documentation
- ❌ Mix of active and historical docs
- ❌ No clear organization
- ❌ Difficult for new contributors

### After Reorganization

- ✅ Clean root directory (4-5 essential files)
- ✅ Documentation grouped by domain
- ✅ Clear separation of active vs. archived
- ✅ Easy to navigate and discover
- ✅ Better for onboarding

---

## Rollback Plan

If something goes wrong:

```bash
# The script uses git mv, so you can revert
git reset --hard HEAD

# Or revert the commit
git revert <commit-hash>
```

---

## Coordination Checklist

Before executing:

- [ ] Notify team members about the reorganization
- [ ] Check for any active PRs that might conflict
- [ ] Backup the current state (script does this automatically)
- [ ] Review the DOC-REORG-PLAN.md for any updates
- [ ] Ensure no critical deployments are in progress

After executing:

- [ ] Update onboarding documentation
- [ ] Update any CI/CD references
- [ ] Notify team to pull latest changes
- [ ] Update wiki/external documentation
- [ ] Close any related issues

---

## Timeline

**Estimated Time**: 30-45 minutes

1. **Preparation** (5 min): Review plan, notify team
2. **Execution** (10 min): Run script or manual moves
3. **Verification** (10 min): Check links, test builds
4. **Documentation** (10 min): Update external references
5. **Commit & Push** (5 min): Commit changes

---

## Success Criteria

The reorganization is successful when:

1. ✅ Root directory has ≤10 files
2. ✅ All documentation is in appropriate folders
3. ✅ README files exist in each new folder
4. ✅ No broken links in documentation
5. ✅ Git history is preserved (using `git mv`)
6. ✅ All tests pass
7. ✅ Team is notified and updated

---

## Questions & Answers

### Q: Will this break any deployments?

**A**: No. The reorganization only affects documentation and scripts. Production code (`netlify/functions/`, `services/`, `src/`) is not touched.

### Q: What about the test scripts in root?

**A**: They can be moved to `scripts/test/` in a follow-up phase. The initial reorganization focuses on documentation.

### Q: Can I do this in stages?

**A**: Yes! You can move files in batches:

1. First: Auth documentation
2. Second: Deployment documentation
3. Third: Archive historical files

### Q: What if I find a file not in the plan?

**A**: Add it to the plan following the same pattern:

- Active docs → `docs/<domain>/`
- Historical fixes → `docs/<domain>/legacy/`
- Completed work → `.archive/`

---

## Related Documents

- `docs/cleanup/DOC-REORG-PLAN.md` - Original reorganization plan
- `REORGANIZE_ONASIS_CORE.sh` - Automated execution script
- `FINAL-STATUS.md` - Current project status

---

## Support

If you encounter issues:

1. Check the script output for errors
2. Review `git status` to see what changed
3. Use `git diff` to see file content changes
4. Rollback if needed: `git reset --hard HEAD`
5. Ask for help in the team channel

---

**Ready to reorganize?** Run `./REORGANIZE_ONASIS_CORE.sh` to get started! 🚀
