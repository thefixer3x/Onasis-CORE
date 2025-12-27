# Onasis-Core Reorganization Plan 2025

**Date**: December 27, 2025  
**Status**: Planning Phase  
**Previous Reorganization**: November 16, 2025 (see `REORGANIZATION_COMPLETE.md`)

---

## Executive Summary

This plan addresses the current state where documentation and scripts have become scattered again after the initial November 2025 reorganization. The goal is to:

1. **Consolidate all documentation** into `docs/` with proper categorization
2. **Organize all scripts** into `scripts/` with clear subdirectories
3. **Clean root directory** to only essential files
4. **Preserve git history** using `git mv` for all moves
5. **Maintain functionality** by updating references and ensuring no broken links

---

## Current State Analysis

### Root Directory Issues

**Documentation Files (13 files)**:
- `IMPLEMENTATION_GUIDE.md` - Implementation guide
- `IMPLEMENTATION_GUIDE12202025.md` - Updated implementation guide
- `MIGRATION_ROUTING_PLAN.md` - Database migration routing
- `MIGRATION_QUICK_START.md` - Quick start for migrations
- `MIGRATION_SUCCESS_SUMMARY.md` - Migration completion summary
- `SECURITY_TEST_REPORT.md` - Security testing results
- `SECURITY_VULNERABILITIES_REVIEW.md` - Security vulnerabilities
- `SMOKE_TEST_RESULTS.md` - Test results
- `test-mcp-gateway-integration-results-2025-09-02.md` - Integration test results
- `PAGESPEED-OPTIMIZATION.md` - Performance optimization
- `FINAL-STATUS.md` - Project status (legacy)
- `INFRASTRUCTURE-CHECK.md` - Infrastructure verification
- `TYPESCRIPT_ERRORS_EXPLAINED.md` - TypeScript error documentation

**Script Files (20+ files)**:
- Test scripts: `test-*.js`, `test-*.sh` (10+ files)
- Setup scripts: `setup-*.sh`, `verify-*.sh` (5+ files)
- Migration scripts: `apply-*.sh` (3+ files)
- Utility scripts: `create-oauth-issues.sh`, `enhance-extensions-mcp.sh`, etc.

**Router Files (5 files)**:
- `unified-router.js`, `unified-router.cjs`
- `vendor-auth-middleware.js`
- `multi-platform-router.js`
- `ai-service-router.js`

**Other Files**:
- `REORGANIZATION_COMPLETE.md` - Previous reorganization summary
- `REORGANIZATION_GUIDE.md` - Previous reorganization guide
- `REORGANIZE_ONASIS_CORE.sh` - Previous reorganization script

### Services Directory Documentation

**auth-gateway/** (30+ files):
- Implementation guides, fix summaries, deployment guides
- Should be consolidated into `docs/auth-gateway/`

**security/** (10+ files):
- Architecture docs, deployment guides, standards
- Should be consolidated into `docs/security/`

---

## Proposed Structure

```
onasis-core/
├── docs/
│   ├── auth/                      # ✅ Already organized
│   ├── auth-gateway/              # 🆕 NEW - Auth gateway docs from services/
│   │   ├── implementation/        # Implementation guides
│   │   ├── deployment/            # Deployment guides
│   │   ├── fixes/                 # Fix summaries
│   │   └── diagnostics/          # Diagnostic reports
│   ├── security/                  # ✅ Partially organized
│   │   └── services/              # 🆕 Security service docs from services/security/
│   ├── deployment/                # ✅ Already organized
│   ├── migration/                 # 🆕 NEW - Migration documentation
│   │   ├── routing/               # Migration routing plans
│   │   ├── guides/                # Migration guides
│   │   └── summaries/              # Migration summaries
│   ├── testing/                   # 🆕 NEW - Test documentation
│   │   ├── reports/               # Test reports
│   │   └── results/               # Test results
│   ├── architecture/              # ✅ Already exists
│   ├── guides/                    # ✅ Already exists
│   ├── reports/                   # ✅ Already exists
│   ├── memory/                    # ✅ Already exists
│   ├── supabase-api/              # ✅ Already exists
│   ├── api-gateway/               # ✅ Already exists
│   ├── mcp/                       # ✅ Already exists
│   ├── frontend/                  # ✅ Already exists
│   ├── history/                   # ✅ Already exists
│   ├── cleanup/                   # ✅ Already exists
│   └── onboarding/                # ✅ Already exists (in root, should move)
│
├── scripts/
│   ├── test/                      # 🆕 Test scripts
│   │   ├── integration/           # Integration tests
│   │   ├── unit/                  # Unit tests
│   │   └── smoke/                 # Smoke tests
│   ├── setup/                     # 🆕 Setup scripts
│   ├── migration/                 # 🆕 Migration scripts
│   ├── deployment/                # 🆕 Deployment scripts
│   ├── security/                 # 🆕 Security scripts
│   └── utilities/                 # 🆕 Utility scripts
│
├── src/                           # ✅ Source code (no changes)
│   └── routers/                   # 🆕 Router files from root
│
└── [Root - Essential files only]
    ├── README.md
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── ecosystem.config.js
    └── netlify.toml
```

---

## Detailed File Movements

### Phase 1: Documentation Consolidation

#### 1.1 Migration Documentation → `docs/migration/`

**From Root:**
```bash
git mv MIGRATION_ROUTING_PLAN.md docs/migration/routing/
git mv MIGRATION_QUICK_START.md docs/migration/guides/
git mv MIGRATION_SUCCESS_SUMMARY.md docs/migration/summaries/
```

#### 1.2 Implementation Guides → `docs/guides/`

**From Root:**
```bash
git mv IMPLEMENTATION_GUIDE.md docs/guides/implementation/
git mv IMPLEMENTATION_GUIDE12202025.md docs/guides/implementation/
```

#### 1.3 Testing Documentation → `docs/testing/`

**From Root:**
```bash
git mv SECURITY_TEST_REPORT.md docs/testing/reports/
git mv SMOKE_TEST_RESULTS.md docs/testing/results/
git mv test-mcp-gateway-integration-results-2025-09-02.md docs/testing/results/
```

#### 1.4 Security Documentation → `docs/security/`

**From Root:**
```bash
git mv SECURITY_VULNERABILITIES_REVIEW.md docs/security/vulnerabilities/
```

#### 1.5 Performance Documentation → `docs/performance/`

**From Root:**
```bash
git mv PAGESPEED-OPTIMIZATION.md docs/performance/
```

#### 1.6 Status/Infrastructure Docs → `docs/status/`

**From Root:**
```bash
git mv FINAL-STATUS.md docs/status/legacy/
git mv INFRASTRUCTURE-CHECK.md docs/status/infrastructure/
```

#### 1.7 TypeScript Documentation → `docs/development/`

**From Root:**
```bash
git mv TYPESCRIPT_ERRORS_EXPLAINED.md docs/development/typescript/
```

#### 1.8 Auth Gateway Documentation → `docs/auth-gateway/`

**From `services/auth-gateway/`:**

**Implementation Guides:**
```bash
git mv services/auth-gateway/AUTH_GATEWAY_CQRS_IMPLEMENTATION.md docs/auth-gateway/implementation/
git mv services/auth-gateway/CLI-OAUTH2-IMPLEMENTATION-SUMMARY.md docs/auth-gateway/implementation/
git mv services/auth-gateway/OAUTH2_PKCE_IMPLEMENTATION_PLAN.md docs/auth-gateway/implementation/
git mv services/auth-gateway/EVENT_SOURCING_DEPLOYMENT_GUIDE.md docs/auth-gateway/implementation/
git mv services/auth-gateway/CQRS_IMPLEMENTATION_SUMMARY.md docs/auth-gateway/implementation/
```

**Deployment Guides:**
```bash
git mv services/auth-gateway/MANUAL-DEPLOYMENT-GUIDE.md docs/auth-gateway/deployment/
git mv services/auth-gateway/LOCAL-DEPLOYMENT-GUIDE.md docs/auth-gateway/deployment/
git mv services/auth-gateway/API-KEY-DEPLOYMENT-GUIDE.md docs/auth-gateway/deployment/
git mv services/auth-gateway/BOOTSTRAP_README.md docs/auth-gateway/deployment/
```

**Fix Summaries:**
```bash
git mv services/auth-gateway/ISSUES-RESOLVED-SUMMARY.md docs/auth-gateway/fixes/
git mv services/auth-gateway/OAUTH_LOGIN_FIX.md docs/auth-gateway/fixes/
git mv services/auth-gateway/OAUTH-ROUTE-FIX.md docs/auth-gateway/fixes/
git mv services/auth-gateway/ENV-FILE-FIX.md docs/auth-gateway/fixes/
git mv services/auth-gateway/FIX-CLI-AUTH-ISSUES.md docs/auth-gateway/fixes/
git mv services/auth-gateway/CRITICAL-CONFIGURATION-FIX.md docs/auth-gateway/fixes/
git mv services/auth-gateway/EMERGENCY-ADMIN-ACCESS.md docs/auth-gateway/fixes/
```

**Diagnostics:**
```bash
git mv services/auth-gateway/TOKEN-INTROSPECTION-DIAGNOSIS.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/DATABASE-SYNC-ANALYSIS.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/302-REDIRECT-ANALYSIS.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/IDE-AUTH-FAILURE-ANALYSIS.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/OAUTH_LOGIN_ISSUE_ANALYSIS.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/OAUTH-INVESTIGATION-SUMMARY.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/AUTH-GATEWAY-FLOW-TRACE.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/DIAGNOSE-OAUTH-FLOW.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/OAUTH_PROVIDER_ANALYSIS.md docs/auth-gateway/diagnostics/
git mv services/auth-gateway/NEON-SCHEMA-VERIFICATION-REPORT.md docs/auth-gateway/diagnostics/
```

**Guides:**
```bash
git mv services/auth-gateway/DUAL-AUTH-GUIDE.md docs/auth-gateway/guides/
git mv services/auth-gateway/OAUTH-DUAL-PATH-GUIDE.md docs/auth-gateway/guides/
git mv services/auth-gateway/OAUTH-DUAL-PATH-QUICKREF.md docs/auth-gateway/guides/
git mv services/auth-gateway/CLI-OAUTH2-MIGRATION.md docs/auth-gateway/guides/
git mv services/auth-gateway/APP-ONBOARDING-GUIDE.md docs/auth-gateway/guides/
git mv services/auth-gateway/LOGIN_FORM_UPDATE_PLAN.md docs/auth-gateway/guides/
```

**Status:**
```bash
git mv services/auth-gateway/CURRENT-STATUS.md docs/auth-gateway/status/
git mv services/auth-gateway/QUICK-REFERENCE.md docs/auth-gateway/status/
git mv services/auth-gateway/README.md docs/auth-gateway/
git mv services/auth-gateway/README-UPDATED.md docs/auth-gateway/status/
git mv services/auth-gateway/CONFIG-APPLIED.md docs/auth-gateway/status/
git mv services/auth-gateway/SECURITY_VERIFICATION.md docs/auth-gateway/status/
git mv services/auth-gateway/SESSION_COOKIE_IMPLEMENTATION_SUMMARY.md docs/auth-gateway/status/
```

**PKCE Implementation:**
```bash
git mv services/auth-gateway/auth-gateway-oauth2-pkce/README.md docs/auth-gateway/pkce/
git mv services/auth-gateway/auth-gateway-oauth2-pkce/OAUTH2_PKCE_IMPLEMENTATION_GUIDE.md docs/auth-gateway/pkce/
git mv services/auth-gateway/auth-gateway-oauth2-pkce/CLIENT_INTEGRATION_GUIDE.md docs/auth-gateway/pkce/
git mv services/auth-gateway/auth-gateway-oauth2-pkce/IMPLEMENTATION_CHECKLIST.md docs/auth-gateway/pkce/
git mv services/auth-gateway/auth-gateway-oauth2-pkce/PKCE_STATUS.md docs/auth-gateway/pkce/
git mv services/auth-gateway/auth-gateway-oauth2-pkce/PORT_MAPPING_COMPLETE.md docs/auth-gateway/pkce/
```

#### 1.9 Security Service Documentation → `docs/security/services/`

**From `services/security/`:**
```bash
git mv services/security/README.md docs/security/services/
git mv services/security/ARCHITECTURE.md docs/security/services/
git mv services/security/SECURITY_STANDARDS.md docs/security/services/
git mv services/security/QUICK_START.md docs/security/services/
git mv services/security/DEPLOYMENT_GUIDE.md docs/security/services/
git mv services/security/MIGRATION_SUMMARY.md docs/security/services/
git mv services/security/docs/PHASED_EXECUTION_PLAN.md docs/security/services/
git mv services/security/docs/DEPLOYMENT_SYNCHRONIZATION_PLAN.md docs/security/services/
```

**From `services/security/auth-gateway-oauth2-pkce/`:**
```bash
git mv services/security/auth-gateway-oauth2-pkce/README.md docs/security/services/pkce/
git mv services/security/auth-gateway-oauth2-pkce/OAUTH2_PKCE_IMPLEMENTATION_GUIDE.md docs/security/services/pkce/
git mv services/security/auth-gateway-oauth2-pkce/CLIENT_INTEGRATION_GUIDE.md docs/security/services/pkce/
git mv services/security/auth-gateway-oauth2-pkce/IMPLEMENTATION_CHECKLIST.md docs/security/services/pkce/
git mv services/security/auth-gateway-oauth2-pkce/PKCE_STATUS.md docs/security/services/pkce/
git mv services/security/auth-gateway-oauth2-pkce/PORT_MAPPING_COMPLETE.md docs/security/services/pkce/
```

#### 1.10 Onboarding Documentation → `docs/onboarding/`

**From Root:**
```bash
git mv onboarding/ docs/onboarding/
```

#### 1.11 Reorganization Documentation → `docs/history/`

**From Root:**
```bash
git mv REORGANIZATION_COMPLETE.md docs/history/reorganizations/
git mv REORGANIZATION_GUIDE.md docs/history/reorganizations/
```

### Phase 2: Scripts Organization

#### 2.1 Test Scripts → `scripts/test/`

**From Root:**
```bash
# Integration tests
git mv test-mcp-onasis-core-integration.js scripts/test/integration/
git mv test-remote-mcp-gateway.js scripts/test/integration/
git mv test-remote-mcp-via-ssh.js scripts/test/integration/
git mv test-mcp-gateway-integration-results-2025-09-02.md scripts/test/integration/

# Unit tests
git mv test-all-tools.js scripts/test/unit/
git mv test-mcp-connection.js scripts/test/unit/
git mv test-memory-operations.js scripts/test/unit/
git mv test-retrieve-memory.js scripts/test/unit/
git mv test-auth-flow.html scripts/test/unit/

# Smoke tests
git mv SMOKE_TEST.sh scripts/test/smoke/
git mv test-end-to-end.sh scripts/test/smoke/
git mv test-mcp-auth.sh scripts/test/smoke/
git mv test-api.sh scripts/test/smoke/
```

**From `services/auth-gateway/`:**
```bash
git mv services/auth-gateway/test-token-introspection.sh scripts/test/integration/
git mv services/auth-gateway/test-cli-oauth-flow.sh scripts/test/integration/
git mv services/auth-gateway/test-oauth-endpoints.sh scripts/test/integration/
git mv services/auth-gateway/test-app-registration.sh scripts/test/integration/
git mv services/auth-gateway/test-admin-login.sh scripts/test/integration/
git mv services/auth-gateway/TEST-PM2-LOCALLY.sh scripts/test/integration/
```

#### 2.2 Setup Scripts → `scripts/setup/`

**From Root:**
```bash
git mv setup-github-remote.sh scripts/setup/
git mv setup-complete.sh scripts/setup/
git mv setup-memory-submodules.sh scripts/setup/
git mv verify-config.sh scripts/setup/
git mv verify-vps-services.sh scripts/setup/
```

**From `services/security/scripts/`:**
```bash
git mv services/security/scripts/setup.sh scripts/setup/security/
```

#### 2.3 Migration Scripts → `scripts/migration/`

**From Root:**
```bash
git mv apply-neon-migrations.sh scripts/migration/
git mv apply-migrations-simple.sh scripts/migration/
```

**From `services/auth-gateway/`:**
```bash
git mv services/auth-gateway/run-supabase-migration.js scripts/migration/
git mv services/auth-gateway/run-oauth-migration-pg.js scripts/migration/
git mv services/auth-gateway/run-oauth-migration-neon.js scripts/migration/
git mv services/auth-gateway/run-migration.js scripts/migration/
```

**From `services/security/scripts/`:**
```bash
git mv services/security/scripts/migrate.sh scripts/migration/security/
git mv services/security/scripts/migrate-files.sh scripts/migration/security/
```

#### 2.4 Deployment Scripts → `scripts/deployment/`

**From Root:**
```bash
git mv vps-backup-solution.sh scripts/deployment/
```

**From `services/auth-gateway/`:**
```bash
git mv services/auth-gateway/deploy.sh scripts/deployment/auth-gateway/
git mv services/auth-gateway/deploy-to-vps.sh scripts/deployment/auth-gateway/
git mv services/auth-gateway/deploy-to-neon.sh scripts/deployment/auth-gateway/
git mv services/auth-gateway/safe-start.sh scripts/deployment/auth-gateway/
git mv services/auth-gateway/diagnose-deployment.sh scripts/deployment/auth-gateway/
```

**From `deploy/`:**
```bash
git mv deploy/*.sh scripts/deployment/  # Review each file individually
```

#### 2.5 Security Scripts → `scripts/security/`

**From Root:**
```bash
git mv EMERGENCY-CREDENTIAL-SCRUB.sh scripts/security/
git mv create-oauth-issues.sh scripts/security/
```

**From `scripts/`:**
```bash
git mv scripts/cleanup-credential-leak.sh scripts/security/
git mv scripts/verify-cleanup.sh scripts/security/
```

#### 2.6 Utility Scripts → `scripts/utilities/`

**From Root:**
```bash
git mv enhance-extensions-mcp.sh scripts/utilities/
git mv store-mcp-gateway-feedback.js scripts/utilities/
```

**From `services/auth-gateway/`:**
```bash
git mv services/auth-gateway/fix-env.sh scripts/utilities/auth-gateway/
git mv services/auth-gateway/fix-build-errors.sh scripts/utilities/auth-gateway/
git mv services/auth-gateway/fix-rls.sh scripts/utilities/auth-gateway/
git mv services/auth-gateway/create-admin-bypass.sh scripts/utilities/auth-gateway/
git mv services/auth-gateway/preflight-check.js scripts/utilities/auth-gateway/
git mv services/auth-gateway/test-env.js scripts/utilities/auth-gateway/
git mv services/auth-gateway/check-oauth-schema.js scripts/utilities/auth-gateway/
git mv services/auth-gateway/check-supabase-oauth.js scripts/utilities/auth-gateway/
git mv services/auth-gateway/check-neon-oauth.js scripts/utilities/auth-gateway/
```

**From `services/auth-gateway/scripts/`:**
```bash
git mv services/auth-gateway/scripts/check-duplicate-events.sh scripts/utilities/auth-gateway/
```

### Phase 3: Router Files Organization

#### 3.1 Router Files → `src/routers/`

**From Root:**
```bash
git mv unified-router.js src/routers/
git mv unified-router.cjs src/routers/
git mv vendor-auth-middleware.js src/routers/
git mv multi-platform-router.js src/routers/
git mv ai-service-router.js src/routers/
```

### Phase 4: Cleanup Previous Reorganization Files

#### 4.1 Archive Previous Reorganization Script

**From Root:**
```bash
git mv REORGANIZE_ONASIS_CORE.sh docs/history/reorganizations/
```

---

## Directory Creation Commands

Before executing moves, create all necessary directories:

```bash
# Documentation directories
mkdir -p docs/migration/{routing,guides,summaries}
mkdir -p docs/guides/implementation
mkdir -p docs/testing/{reports,results}
mkdir -p docs/security/{vulnerabilities,services/pkce}
mkdir -p docs/performance
mkdir -p docs/status/{legacy,infrastructure}
mkdir -p docs/development/typescript
mkdir -p docs/auth-gateway/{implementation,deployment,fixes,diagnostics,guides,status,pkce}
mkdir -p docs/history/reorganizations

# Script directories
mkdir -p scripts/test/{integration,unit,smoke}
mkdir -p scripts/setup/security
mkdir -p scripts/migration/security
mkdir -p scripts/deployment/auth-gateway
mkdir -p scripts/security
mkdir -p scripts/utilities/auth-gateway

# Source directories
mkdir -p src/routers
```

---

## Reference Updates Required

After moving files, update references in:

1. **README.md** - Update documentation links
2. **package.json** - Update script paths if any
3. **CI/CD workflows** - Update script paths in `.github/workflows/`
4. **Documentation cross-references** - Update relative links in markdown files
5. **Service configurations** - Update any hardcoded paths

### Finding References

```bash
# Find markdown files with relative links
find docs -name "*.md" -exec grep -l "\.\./.*\.md" {} \;

# Find scripts referencing moved files
grep -r "test-.*\.js\|test-.*\.sh" scripts/ services/ netlify/

# Find package.json scripts
grep -A 20 '"scripts"' package.json
```

---

## Verification Checklist

Before committing:

- [ ] All directories created
- [ ] All files moved using `git mv`
- [ ] No broken file references
- [ ] README files created in new directories
- [ ] Cross-references updated
- [ ] CI/CD workflows updated
- [ ] Package.json scripts updated (if needed)
- [ ] Git status shows only renames (no deletions)
- [ ] Test suite still passes
- [ ] Documentation links verified

---

## Execution Strategy

### Step 1: Preparation (Day 1)

1. Review this plan
2. Create backup branch: `git checkout -b backup-before-reorg-2025`
3. Create all directories
4. Verify no active PRs will conflict

### Step 2: Documentation Moves (Day 1-2)

1. Execute Phase 1 moves in batches
2. After each batch, verify git status
3. Update cross-references as you go

### Step 3: Script Moves (Day 2)

1. Execute Phase 2 moves
2. Update any script references
3. Test critical scripts still work

### Step 4: Router Moves (Day 2)

1. Execute Phase 3 moves
2. Update imports in source files
3. Verify build still works

### Step 5: Cleanup (Day 2-3)

1. Execute Phase 4 moves
2. Create README files for new directories
3. Update main README.md

### Step 6: Verification (Day 3)

1. Run full test suite
2. Check all documentation links
3. Verify CI/CD still works
4. Review git log to confirm history preserved

### Step 7: Commit (Day 3)

```bash
git add -A
git commit -m "docs: comprehensive reorganization 2025

- Consolidate all documentation into docs/ with proper categorization
- Organize all scripts into scripts/ with clear subdirectories
- Move router files to src/routers/
- Update all cross-references and links
- Preserve git history using git mv for all moves
- Create README files for new directory structure

Files moved:
- 13 documentation files from root → docs/
- 30+ auth-gateway docs from services/ → docs/auth-gateway/
- 10+ security docs from services/ → docs/security/services/
- 20+ test scripts → scripts/test/
- 10+ setup/migration/deployment scripts → scripts/
- 5 router files → src/routers/

See docs/REORGANIZATION_PLAN_2025.md for complete details."
```

---

## Rollback Plan

If issues arise:

```bash
# Option 1: Reset to before reorganization
git reset --hard backup-before-reorg-2025

# Option 2: Revert the commit
git revert HEAD

# Option 3: Manual rollback (if needed)
# Use git log to find commit hash before reorganization
git reset --hard <commit-hash>
```

---

## Success Metrics

After reorganization:

- ✅ Root directory has ≤10 files (down from 40+)
- ✅ All documentation in `docs/` with clear structure
- ✅ All scripts in `scripts/` with clear categorization
- ✅ Router files in `src/routers/`
- ✅ No broken links or references
- ✅ Git history preserved (all moves show as renames)
- ✅ All tests pass
- ✅ CI/CD workflows functional

---

## Notes

1. **Service-specific docs**: Some documentation in `services/` directories may be intentionally co-located with code. Review each file to determine if it should move or stay.

2. **Legacy files**: Files like `FINAL-STATUS.md` are marked as legacy but kept for historical reference.

3. **Previous reorganization**: This builds on the November 2025 reorganization. Files already organized should remain in place.

4. **Git history**: All moves use `git mv` to preserve history. Verify with `git log --follow <file>`.

5. **Incremental approach**: This can be done in phases. Complete Phase 1, commit, then proceed to Phase 2, etc.

---

## Related Documents

- `REORGANIZATION_COMPLETE.md` - Previous reorganization summary (Nov 2025)
- `REORGANIZATION_GUIDE.md` - Previous reorganization guide (Nov 2025)
- `docs/cleanup/DOC-REORG-PLAN.md` - Original reorganization plan

---

**Status**: Ready for review and approval before implementation.

**Next Steps**: 
1. Review this plan
2. Get approval from team
3. Create backup branch
4. Begin execution following the strategy above
