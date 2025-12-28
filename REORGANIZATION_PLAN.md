# onasis-core Reorganization Plan

**Date**: December 28, 2025  
**Status**: Ready to Execute  
**Based on**: `MONOREPO_REORGANIZATION_PLAN.md`

---

## Overview

This plan provides a systematic approach to reorganizing the `apps/onasis-core` codebase. The reorganization will:

1. ✅ Clean up the root directory (currently 53 files)
2. ✅ Group documentation by domain
3. ✅ Archive historical fix summaries
4. ✅ Organize scripts by purpose
5. ✅ Maintain canonical references for active development
6. ✅ Improve discoverability and maintainability
7. ✅ Preserve 100% functionality with easy referencing

---

## Current State Analysis

### Root Directory Issues

- **53 files** in the root directory
- Mix of active docs, historical fixes, and scripts
- Difficult to find relevant documentation
- No clear organization

### File Inventory

**Documentation** (17 MD files):
- test-mcp-gateway-integration-results-2025-09-02.md
- FINAL-STATUS.md
- REORGANIZATION_PLAN.md
- MIGRATION_ROUTING_PLAN.md
- SMOKE_TEST_RESULTS.md
- REORGANIZATION_COMPLETE.md
- MIGRATION_SUCCESS_SUMMARY.md
- IMPLEMENTATION_GUIDE12202025.md
- REORGANIZATION_OVERVIEW.md
- README.md
- REORGANIZATION_GUIDE.md
- IMPLEMENTATION_GUIDE.md
- INFRASTRUCTURE-CHECK.md
- MIGRATION_QUICK_START.md
- SECURITY_VULNERABILITIES_REVIEW.md
- TYPESCRIPT_ERRORS_EXPLAINED.md
- PAGESPEED-OPTIMIZATION.md
- SECURITY_TEST_REPORT.md

**Scripts** (36 files):
- test-mcp-auth.sh
- verify-vps-services.sh
- tailwind.config.js
- external-mcp-client.js
- vps-backup-solution.sh
- test-remote-mcp-via-ssh.js
- apply-migrations-simple.sh
- test-end-to-end.sh
- multi-platform-router.js
- unified-router.js
- REORGANIZE_ONASIS_CORE.sh
- verify-config.sh
- setup-memory-submodules.sh
- test-mcp-connection.js
- test-remote-mcp-gateway.js
- test-mcp-onasis-core-integration.js
- EMERGENCY-CREDENTIAL-SCRUB.sh
- ai-service-router.js
- SMOKE_TEST.sh
- setup-complete.sh

---

## Reorganization Plan

### Phase 0: Canonical References (DO NOT MOVE)

These locations are the **source of truth** and must remain in root:

| Area | Location | Contents |
|------|----------|----------|
| App Config | Root | `package.json`, `tsconfig.json`, etc. |
| Build Config | Root | `vite.config.ts`, `netlify.toml`, etc. |
| Main Docs | Root | `README.md` |

### Phase 1: New Folder Structure

```
apps/onasis-core/
├── docs/                          # All documentation organized by domain
│   ├── architecture/              # Architecture documentation
│   ├── deployment/                # Deployment guides
│   ├── fixes/                     # Historical fixes
│   ├── guides/                    # User/developer guides
│   └── [domain-specific]/         # App-specific domains
│
├── scripts/                       # All scripts organized by purpose
│   ├── test/                      # Test scripts
│   ├── setup/                     # Setup scripts
│   ├── migration/                 # Migration scripts
│   ├── deployment/                # Deployment scripts
│   └── fix/                       # Fix scripts
│
├── config/                        # Non-essential configuration files
│   └── [config-type]/             # Config categories
│
├── .archive/                      # Historical archives
│   ├── fixes/                     # Completed fixes
│   └── status/                    # Status reports
│
└── [Root files]                   # Only essential files remain
    ├── README.md
    ├── package.json
    └── [essential-configs]
```

---

## File Movement Mapping

### Documentation

**Move to `docs/architecture/`**:


**Move to `docs/deployment/`**:


**Move to `docs/fixes/`**:


**Move to `docs/guides/`**:
- IMPLEMENTATION_GUIDE12202025.md
- README.md
- REORGANIZATION_GUIDE.md
- IMPLEMENTATION_GUIDE.md

**Move to `docs/`** (other documentation):
- test-mcp-gateway-integration-results-2025-09-02.md
- FINAL-STATUS.md
- REORGANIZATION_PLAN.md
- MIGRATION_ROUTING_PLAN.md
- SMOKE_TEST_RESULTS.md
- REORGANIZATION_COMPLETE.md
- MIGRATION_SUCCESS_SUMMARY.md
- REORGANIZATION_OVERVIEW.md
- INFRASTRUCTURE-CHECK.md
- MIGRATION_QUICK_START.md

### Scripts

**Move to `scripts/test/`**:
- test-mcp-auth.sh
- test-remote-mcp-via-ssh.js
- test-end-to-end.sh
- test-mcp-connection.js
- test-remote-mcp-gateway.js
- test-mcp-onasis-core-integration.js
- test-memory-operations.js
- test-retrieve-memory.js
- test-api.sh
- test-all-tools.js

**Move to `scripts/setup/`**:
- setup-memory-submodules.sh
- setup-complete.sh
- setup-github-remote.sh

**Move to `scripts/migration/`**:


**Move to `scripts/deployment/`**:


**Move to `scripts/fix/`**:


**Move to `scripts/`** (other scripts):
- verify-vps-services.sh
- tailwind.config.js
- external-mcp-client.js
- vps-backup-solution.sh
- apply-migrations-simple.sh
- multi-platform-router.js
- unified-router.js
- REORGANIZE_ONASIS_CORE.sh
- verify-config.sh
- EMERGENCY-CREDENTIAL-SCRUB.sh

---

## Execution Strategy

### Option 1: Automated Script (Recommended)

Create `apps/onasis-core/REORGANIZE_onasis-core.sh` based on this plan.

### Option 2: Manual Execution

Execute in phases following the same pattern as monorepo root.

---

## Post-Reorganization Tasks

1. Update cross-references in documentation
2. Update external references (CI/CD, READMEs)
3. Create README files in each new folder
4. Test all links
5. Verify all tests pass

---

## Success Criteria

The reorganization is successful when:

1. ✅ Root directory has ≤10 essential files
2. ✅ All documentation is in appropriate folders
3. ✅ All scripts are organized by purpose
4. ✅ README files exist in each new folder
5. ✅ No broken links in documentation
6. ✅ Git history is preserved (using `git mv`)
7. ✅ All tests pass
8. ✅ Functionality remains at 100%

---

## Timeline

**Estimated Time**: 30-45 minutes

---

## Related Documents

- `MONOREPO_REORGANIZATION_PLAN.md` - Monorepo root reorganization
- `apps/onasis-core/REORGANIZATION_GUIDE.md` - Onasis-core specific guide

---

**Ready to reorganize?** Review this plan and execute when ready! 🚀
