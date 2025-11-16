#!/bin/bash

# Onasis-Core Systematic Reorganization Script
# Based on: docs/cleanup/DOC-REORG-PLAN.md
# Date: November 16, 2025

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Onasis-Core Systematic Reorganization                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the right directory and navigate if needed
if [ ! -f "docs/cleanup/DOC-REORG-PLAN.md" ]; then
    if [ -f "apps/onasis-core/docs/cleanup/DOC-REORG-PLAN.md" ]; then
        echo -e "${CYAN}Navigating to apps/onasis-core...${NC}"
        cd apps/onasis-core
    else
        echo -e "${RED}Error: Cannot find onasis-core directory${NC}"
        exit 1
    fi
fi

echo -e "${CYAN}This script will reorganize the onasis-core codebase according to:${NC}"
echo "  - docs/cleanup/DOC-REORG-PLAN.md"
echo ""
echo -e "${YELLOW}What will be done:${NC}"
echo "  1. Create new folder structure"
echo "  2. Move documentation files to appropriate locations"
echo "  3. Archive historical/completed fix summaries"
echo "  4. Clean up root directory"
echo "  5. Update cross-references"
echo ""

read -p "Do you want to proceed? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${GREEN}Starting reorganization...${NC}"
echo ""

# ============================================================================
# PHASE 1: Create new folder structure
# ============================================================================
echo -e "${BLUE}Phase 1: Creating new folder structure...${NC}"

mkdir -p docs/auth/legacy
mkdir -p docs/auth/analysis
mkdir -p docs/deployment/netlify
mkdir -p docs/deployment/databases
mkdir -p docs/deployment/databases/legacy
mkdir -p docs/deployment/pm2
mkdir -p docs/frontend/legacy
mkdir -p docs/api-gateway
mkdir -p docs/mcp
mkdir -p docs/history
mkdir -p .archive/2024-fixes
mkdir -p .archive/incidents

echo -e "${GREEN}✓ Folder structure created${NC}"
echo ""

# ============================================================================
# PHASE 2: Move authentication documentation
# ============================================================================
echo -e "${BLUE}Phase 2: Moving authentication documentation...${NC}"

# Auth legacy fixes
if [ -f "AUTH-FIX-SUMMARY.md" ]; then
    git mv AUTH-FIX-SUMMARY.md docs/auth/legacy/
    echo "  ✓ Moved AUTH-FIX-SUMMARY.md"
fi

if [ -f "AUTH-SERVER-FIX-SUMMARY.md" ]; then
    git mv AUTH-SERVER-FIX-SUMMARY.md docs/auth/legacy/
    echo "  ✓ Moved AUTH-SERVER-FIX-SUMMARY.md"
fi

if [ -f "DASHBOARD-AUTH-FIX-COMPLETE.md" ]; then
    git mv DASHBOARD-AUTH-FIX-COMPLETE.md docs/auth/legacy/
    echo "  ✓ Moved DASHBOARD-AUTH-FIX-COMPLETE.md"
fi

# Active auth docs
if [ -f "AUTHENTICATION-ARCHITECTURE.md" ]; then
    git mv AUTHENTICATION-ARCHITECTURE.md docs/auth/
    echo "  ✓ Moved AUTHENTICATION-ARCHITECTURE.md"
fi

if [ -f "UNIFIED-AUTH-COMPLETE.md" ]; then
    git mv UNIFIED-AUTH-COMPLETE.md docs/auth/
    echo "  ✓ Moved UNIFIED-AUTH-COMPLETE.md"
fi

if [ -f "UNIFIED-AUTH-MIGRATION-PLAN.md" ]; then
    git mv UNIFIED-AUTH-MIGRATION-PLAN.md docs/auth/
    echo "  ✓ Moved UNIFIED-AUTH-MIGRATION-PLAN.md"
fi

# Auth analysis
if [ -f "DUAL-AUTH-ANALYSIS.md" ]; then
    git mv DUAL-AUTH-ANALYSIS.md docs/auth/analysis/
    echo "  ✓ Moved DUAL-AUTH-ANALYSIS.md"
fi

if [ -f "auth-routing-analysis.md" ]; then
    git mv auth-routing-analysis.md docs/auth/analysis/
    echo "  ✓ Moved auth-routing-analysis.md"
fi

echo -e "${GREEN}✓ Authentication docs moved${NC}"
echo ""

# ============================================================================
# PHASE 3: Move deployment documentation
# ============================================================================
echo -e "${BLUE}Phase 3: Moving deployment documentation...${NC}"

# Netlify
if [ -f "NETLIFY-AUTH-FIX.md" ]; then
    git mv NETLIFY-AUTH-FIX.md docs/deployment/netlify/
    echo "  ✓ Moved NETLIFY-AUTH-FIX.md"
fi

# Database
if [ -f "NEON-DATABASE-UPDATE.md" ]; then
    git mv NEON-DATABASE-UPDATE.md docs/deployment/databases/
    echo "  ✓ Moved NEON-DATABASE-UPDATE.md"
fi

if [ -f "DATABASE-FIX-SUMMARY.md" ]; then
    git mv DATABASE-FIX-SUMMARY.md docs/deployment/databases/legacy/
    echo "  ✓ Moved DATABASE-FIX-SUMMARY.md"
fi

# PM2
if [ -f "PM2-STABILITY-FIX.md" ]; then
    git mv PM2-STABILITY-FIX.md docs/deployment/pm2/
    echo "  ✓ Moved PM2-STABILITY-FIX.md"
fi

echo -e "${GREEN}✓ Deployment docs moved${NC}"
echo ""

# ============================================================================
# PHASE 4: Move service-specific documentation
# ============================================================================
echo -e "${BLUE}Phase 4: Moving service-specific documentation...${NC}"

# API Gateway
if [ -f "API-GATEWAY-AUTH-FIX.md" ]; then
    git mv API-GATEWAY-AUTH-FIX.md docs/api-gateway/
    echo "  ✓ Moved API-GATEWAY-AUTH-FIX.md"
fi

# MCP
if [ -f "WEBSOCKET-STABILITY-FIXES.md" ]; then
    git mv WEBSOCKET-STABILITY-FIXES.md docs/mcp/
    echo "  ✓ Moved WEBSOCKET-STABILITY-FIXES.md"
fi

# Frontend
if [ -f "FRONTEND-FIX-REQUIRED.md" ]; then
    git mv FRONTEND-FIX-REQUIRED.md docs/frontend/legacy/
    echo "  ✓ Moved FRONTEND-FIX-REQUIRED.md"
fi

# Security
if [ -f "SERVICE-AUDIT-SUMMARY.md" ]; then
    git mv SERVICE-AUDIT-SUMMARY.md docs/security/
    echo "  ✓ Moved SERVICE-AUDIT-SUMMARY.md"
fi

if [ -f "OAUTH2-SYSTEM-SAFETY-REPORT.md" ]; then
    git mv OAUTH2-SYSTEM-SAFETY-REPORT.md docs/security/
    echo "  ✓ Moved OAUTH2-SYSTEM-SAFETY-REPORT.md"
fi

echo -e "${GREEN}✓ Service docs moved${NC}"
echo ""

# ============================================================================
# PHASE 5: Archive historical fix summaries
# ============================================================================
echo -e "${BLUE}Phase 5: Archiving historical fix summaries...${NC}"

if [ -f "COMPLETE-FIX-SUMMARY.md" ]; then
    git mv COMPLETE-FIX-SUMMARY.md .archive/2024-fixes/
    echo "  ✓ Archived COMPLETE-FIX-SUMMARY.md"
fi

if [ -f "ACTUAL-FIX-SUMMARY.md" ]; then
    git mv ACTUAL-FIX-SUMMARY.md .archive/2024-fixes/
    echo "  ✓ Archived ACTUAL-FIX-SUMMARY.md"
fi

if [ -f "ACTUAL-PROBLEM-IDENTIFIED.md" ]; then
    git mv ACTUAL-PROBLEM-IDENTIFIED.md .archive/2024-fixes/
    echo "  ✓ Archived ACTUAL-PROBLEM-IDENTIFIED.md"
fi

if [ -f "CRITICAL-SYNC-SUMMARY.md" ]; then
    git mv CRITICAL-SYNC-SUMMARY.md .archive/2024-fixes/
    echo "  ✓ Archived CRITICAL-SYNC-SUMMARY.md"
fi

if [ -f "FINAL-SOLUTION-SUMMARY.md" ]; then
    git mv FINAL-SOLUTION-SUMMARY.md .archive/2024-fixes/
    echo "  ✓ Archived FINAL-SOLUTION-SUMMARY.md"
fi

# Incidents
if [ -f "URGENT-CREDENTIAL-LEAK-ACTION-REQUIRED.md" ]; then
    git mv URGENT-CREDENTIAL-LEAK-ACTION-REQUIRED.md .archive/incidents/
    echo "  ✓ Archived URGENT-CREDENTIAL-LEAK-ACTION-REQUIRED.md"
fi

echo -e "${GREEN}✓ Historical docs archived${NC}"
echo ""

# ============================================================================
# PHASE 6: Create README files for new folders
# ============================================================================
echo -e "${BLUE}Phase 6: Creating README files for new folders...${NC}"

# Auth README
cat > docs/auth/README.md << 'EOF'
# Authentication Documentation

This folder contains all authentication-related documentation for Onasis-Core.

## Structure

- **`/`** - Active authentication architecture and migration plans
- **`legacy/`** - Historical auth fixes and patches (archived)
- **`analysis/`** - Deep-dive analysis documents

## Key Documents

- `AUTHENTICATION-ARCHITECTURE.md` - Current auth architecture
- `UNIFIED-AUTH-COMPLETE.md` - Unified auth implementation status
- `UNIFIED-AUTH-MIGRATION-PLAN.md` - Migration roadmap

## Canonical Reference

For OAuth2 PKCE implementation, see:
`services/auth-gateway/auth-gateway-oauth2-pkce/`
EOF

# Deployment README
cat > docs/deployment/README.md << 'EOF'
# Deployment Documentation

Deployment guides and configuration for Onasis-Core services.

## Structure

- **`netlify/`** - Netlify-specific deployment docs
- **`databases/`** - Database migration and setup guides
- **`pm2/`** - PM2 process management docs

## Services

- API: Netlify Functions (api.lanonasis.com)
- Auth: VPS with PM2 (auth.lanonasis.com)
- MCP: VPS with PM2 (mcp.lanonasis.com)
EOF

# Archive README
cat > .archive/README.md << 'EOF'
# Archived Documentation

This folder contains historical documentation that is no longer actively maintained but kept for reference.

## Structure

- **`2024-fixes/`** - Fix summaries from 2024 development
- **`incidents/`** - Security incident reports and remediation

## Note

These documents are kept for audit purposes. For current documentation, see the `docs/` folder.
EOF

echo -e "${GREEN}✓ README files created${NC}"
echo ""

# ============================================================================
# PHASE 7: Create history changelog
# ============================================================================
echo -e "${BLUE}Phase 7: Creating history changelog...${NC}"

cat > docs/history/CHANGELOG-2024.md << 'EOF'
# Changelog 2024 - Onasis-Core

This document links to archived fix summaries and major changes from 2024.

## Major Fixes

### Authentication System
- [Complete Fix Summary](.archive/2024-fixes/COMPLETE-FIX-SUMMARY.md)
- [Actual Fix Summary](.archive/2024-fixes/ACTUAL-FIX-SUMMARY.md)
- [Auth Server Fix](../auth/legacy/AUTH-SERVER-FIX-SUMMARY.md)
- [Dashboard Auth Fix](../auth/legacy/DASHBOARD-AUTH-FIX-COMPLETE.md)

### Database
- [Database Fix Summary](../deployment/databases/legacy/DATABASE-FIX-SUMMARY.md)
- [Neon Database Update](../deployment/databases/NEON-DATABASE-UPDATE.md)

### Infrastructure
- [Critical Sync Summary](.archive/2024-fixes/CRITICAL-SYNC-SUMMARY.md)
- [PM2 Stability Fix](../deployment/pm2/PM2-STABILITY-FIX.md)

## Security Incidents

- [Credential Leak Incident](.archive/incidents/URGENT-CREDENTIAL-LEAK-ACTION-REQUIRED.md)

## Current Status

See [FINAL-STATUS.md](../../FINAL-STATUS.md) for current project status.
EOF

echo -e "${GREEN}✓ History changelog created${NC}"
echo ""

# ============================================================================
# PHASE 8: Summary
# ============================================================================
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Reorganization Complete!                                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}✓ All files moved successfully${NC}"
echo ""

echo -e "${CYAN}New structure:${NC}"
echo "  docs/"
echo "    ├── auth/              (Authentication docs)"
echo "    │   ├── legacy/        (Historical fixes)"
echo "    │   └── analysis/      (Deep dives)"
echo "    ├── deployment/        (Deployment guides)"
echo "    │   ├── netlify/"
echo "    │   ├── databases/"
echo "    │   └── pm2/"
echo "    ├── api-gateway/       (API Gateway docs)"
echo "    ├── mcp/               (MCP docs)"
echo "    ├── frontend/          (Frontend docs)"
echo "    ├── security/          (Security docs)"
echo "    └── history/           (Changelog)"
echo ""
echo "  .archive/              (Historical archives)"
echo "    ├── 2024-fixes/      (Completed fixes)"
echo "    └── incidents/       (Security incidents)"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review the changes: git status"
echo "  2. Test that no links are broken"
echo "  3. Commit the reorganization: git commit -m 'docs: reorganize onasis-core structure'"
echo "  4. Update any external references to moved files"
echo ""

echo -e "${CYAN}Files kept in root (as per plan):${NC}"
echo "  - README.md"
echo "  - FINAL-STATUS.md"
echo "  - INFRASTRUCTURE-CHECK.md"
echo "  - TYPESCRIPT_ERRORS_EXPLAINED.md"
echo ""

echo "Done! 🎉"
