#!/bin/bash
#
# Onasis-Core Reorganization Script 2025
# 
# This script executes the reorganization plan defined in:
# docs/REORGANIZATION_PLAN_2025.md
#
# IMPORTANT: Review the plan before executing!
# This script uses 'git mv' to preserve file history.
#
# Usage:
#   ./scripts/REORGANIZE_2025.sh [--dry-run] [--phase=N]
#
# Options:
#   --dry-run    Show what would be done without executing
#   --phase=N    Execute only phase N (1-4)
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Options
DRY_RUN=false
PHASE=0

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --phase=*)
      PHASE="${arg#*=}"
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $arg${NC}"
      exit 1
      ;;
  esac
done

# Functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

git_mv_safe() {
  local src="$1"
  local dst="$2"
  
  if [ ! -f "$src" ] && [ ! -d "$src" ]; then
    log_warning "Source not found: $src (skipping)"
    return 0
  fi
  
  if [ "$DRY_RUN" = true ]; then
    log_info "Would move: $src -> $dst"
    return 0
  fi
  
  # Create destination directory if needed
  local dst_dir=$(dirname "$dst")
  if [ ! -d "$dst_dir" ]; then
    mkdir -p "$dst_dir"
    log_info "Created directory: $dst_dir"
  fi
  
  # Move file
  if git mv "$src" "$dst" 2>/dev/null; then
    log_success "Moved: $src -> $dst"
  else
    log_error "Failed to move: $src -> $dst"
    return 1
  fi
}

create_directories() {
  log_info "Creating directory structure..."
  
  local dirs=(
    # Documentation
    "docs/migration/routing"
    "docs/migration/guides"
    "docs/migration/summaries"
    "docs/guides/implementation"
    "docs/testing/reports"
    "docs/testing/results"
    "docs/security/vulnerabilities"
    "docs/security/services/pkce"
    "docs/performance"
    "docs/status/legacy"
    "docs/status/infrastructure"
    "docs/development/typescript"
    "docs/auth-gateway/implementation"
    "docs/auth-gateway/deployment"
    "docs/auth-gateway/fixes"
    "docs/auth-gateway/diagnostics"
    "docs/auth-gateway/guides"
    "docs/auth-gateway/status"
    "docs/auth-gateway/pkce"
    "docs/history/reorganizations"
    
    # Scripts
    "scripts/test/integration"
    "scripts/test/unit"
    "scripts/test/smoke"
    "scripts/setup/security"
    "scripts/migration/security"
    "scripts/deployment/auth-gateway"
    "scripts/security"
    "scripts/utilities/auth-gateway"
    
    # Source
    "src/routers"
  )
  
  for dir in "${dirs[@]}"; do
    if [ "$DRY_RUN" = true ]; then
      log_info "Would create: $dir"
    else
      mkdir -p "$REPO_ROOT/$dir"
      log_success "Created: $dir"
    fi
  done
}

phase1_documentation() {
  log_info "=== Phase 1: Documentation Consolidation ==="
  
  cd "$REPO_ROOT"
  
  # Migration docs
  git_mv_safe "MIGRATION_ROUTING_PLAN.md" "docs/migration/routing/MIGRATION_ROUTING_PLAN.md"
  git_mv_safe "MIGRATION_QUICK_START.md" "docs/migration/guides/MIGRATION_QUICK_START.md"
  git_mv_safe "MIGRATION_SUCCESS_SUMMARY.md" "docs/migration/summaries/MIGRATION_SUCCESS_SUMMARY.md"
  
  # Implementation guides
  git_mv_safe "IMPLEMENTATION_GUIDE.md" "docs/guides/implementation/IMPLEMENTATION_GUIDE.md"
  git_mv_safe "IMPLEMENTATION_GUIDE12202025.md" "docs/guides/implementation/IMPLEMENTATION_GUIDE12202025.md"
  
  # Testing docs
  git_mv_safe "SECURITY_TEST_REPORT.md" "docs/testing/reports/SECURITY_TEST_REPORT.md"
  git_mv_safe "SMOKE_TEST_RESULTS.md" "docs/testing/results/SMOKE_TEST_RESULTS.md"
  git_mv_safe "test-mcp-gateway-integration-results-2025-09-02.md" "docs/testing/results/test-mcp-gateway-integration-results-2025-09-02.md"
  
  # Security docs
  git_mv_safe "SECURITY_VULNERABILITIES_REVIEW.md" "docs/security/vulnerabilities/SECURITY_VULNERABILITIES_REVIEW.md"
  
  # Performance
  git_mv_safe "PAGESPEED-OPTIMIZATION.md" "docs/performance/PAGESPEED-OPTIMIZATION.md"
  
  # Status docs
  git_mv_safe "FINAL-STATUS.md" "docs/status/legacy/FINAL-STATUS.md"
  git_mv_safe "INFRASTRUCTURE-CHECK.md" "docs/status/infrastructure/INFRASTRUCTURE-CHECK.md"
  
  # TypeScript
  git_mv_safe "TYPESCRIPT_ERRORS_EXPLAINED.md" "docs/development/typescript/TYPESCRIPT_ERRORS_EXPLAINED.md"
  
  # Reorganization docs
  git_mv_safe "REORGANIZATION_COMPLETE.md" "docs/history/reorganizations/REORGANIZATION_COMPLETE.md"
  git_mv_safe "REORGANIZATION_GUIDE.md" "docs/history/reorganizations/REORGANIZATION_GUIDE.md"
  git_mv_safe "REORGANIZE_ONASIS_CORE.sh" "docs/history/reorganizations/REORGANIZE_ONASIS_CORE.sh"
  
  log_success "Phase 1 complete"
}

phase2_scripts() {
  log_info "=== Phase 2: Scripts Organization ==="
  
  cd "$REPO_ROOT"
  
  # Test scripts - Integration
  git_mv_safe "test-mcp-onasis-core-integration.js" "scripts/test/integration/test-mcp-onasis-core-integration.js"
  git_mv_safe "test-remote-mcp-gateway.js" "scripts/test/integration/test-remote-mcp-gateway.js"
  git_mv_safe "test-remote-mcp-via-ssh.js" "scripts/test/integration/test-remote-mcp-via-ssh.js"
  
  # Test scripts - Unit
  git_mv_safe "test-all-tools.js" "scripts/test/unit/test-all-tools.js"
  git_mv_safe "test-mcp-connection.js" "scripts/test/unit/test-mcp-connection.js"
  git_mv_safe "test-memory-operations.js" "scripts/test/unit/test-memory-operations.js"
  git_mv_safe "test-retrieve-memory.js" "scripts/test/unit/test-retrieve-memory.js"
  git_mv_safe "test-auth-flow.html" "scripts/test/unit/test-auth-flow.html"
  
  # Test scripts - Smoke
  git_mv_safe "SMOKE_TEST.sh" "scripts/test/smoke/SMOKE_TEST.sh"
  git_mv_safe "test-end-to-end.sh" "scripts/test/smoke/test-end-to-end.sh"
  git_mv_safe "test-mcp-auth.sh" "scripts/test/smoke/test-mcp-auth.sh"
  git_mv_safe "test-api.sh" "scripts/test/smoke/test-api.sh"
  
  # Setup scripts
  git_mv_safe "setup-github-remote.sh" "scripts/setup/setup-github-remote.sh"
  git_mv_safe "setup-complete.sh" "scripts/setup/setup-complete.sh"
  git_mv_safe "setup-memory-submodules.sh" "scripts/setup/setup-memory-submodules.sh"
  git_mv_safe "verify-config.sh" "scripts/setup/verify-config.sh"
  git_mv_safe "verify-vps-services.sh" "scripts/setup/verify-vps-services.sh"
  
  # Migration scripts
  git_mv_safe "apply-neon-migrations.sh" "scripts/migration/apply-neon-migrations.sh"
  git_mv_safe "apply-migrations-simple.sh" "scripts/migration/apply-migrations-simple.sh"
  
  # Deployment scripts
  git_mv_safe "vps-backup-solution.sh" "scripts/deployment/vps-backup-solution.sh"
  
  # Security scripts
  git_mv_safe "EMERGENCY-CREDENTIAL-SCRUB.sh" "scripts/security/EMERGENCY-CREDENTIAL-SCRUB.sh"
  git_mv_safe "create-oauth-issues.sh" "scripts/security/create-oauth-issues.sh"
  
  # Utility scripts
  git_mv_safe "enhance-extensions-mcp.sh" "scripts/utilities/enhance-extensions-mcp.sh"
  git_mv_safe "store-mcp-gateway-feedback.js" "scripts/utilities/store-mcp-gateway-feedback.js"
  
  log_success "Phase 2 complete"
}

phase3_routers() {
  log_info "=== Phase 3: Router Files ==="
  
  cd "$REPO_ROOT"
  
  git_mv_safe "unified-router.js" "src/routers/unified-router.js"
  git_mv_safe "unified-router.cjs" "src/routers/unified-router.cjs"
  git_mv_safe "vendor-auth-middleware.js" "src/routers/vendor-auth-middleware.js"
  git_mv_safe "multi-platform-router.js" "src/routers/multi-platform-router.js"
  git_mv_safe "ai-service-router.js" "src/routers/ai-service-router.js"
  
  log_success "Phase 3 complete"
}

phase4_services_docs() {
  log_info "=== Phase 4: Services Documentation ==="
  
  cd "$REPO_ROOT"
  
  log_warning "Phase 4 requires manual review of each file in services/"
  log_warning "Some files may be intentionally co-located with code"
  log_warning "See docs/REORGANIZATION_PLAN_2025.md for complete list"
  
  # This phase should be done manually after reviewing each file
  log_info "Skipping automated moves for services/ documentation"
  log_info "Please review and move files manually as needed"
}

main() {
  log_info "Onasis-Core Reorganization Script 2025"
  log_info "Repository: $REPO_ROOT"
  
  if [ "$DRY_RUN" = true ]; then
    log_warning "DRY RUN MODE - No changes will be made"
  fi
  
  # Check if we're in a git repository
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_error "Not in a git repository!"
    exit 1
  fi
  
  # Check for uncommitted changes
  if [ "$DRY_RUN" = false ] && ! git diff-index --quiet HEAD --; then
    log_error "You have uncommitted changes. Please commit or stash them first."
    exit 1
  fi
  
  # Create directories
  create_directories
  
  # Execute phases
  if [ "$PHASE" -eq 0 ] || [ "$PHASE" -eq 1 ]; then
    phase1_documentation
  fi
  
  if [ "$PHASE" -eq 0 ] || [ "$PHASE" -eq 2 ]; then
    phase2_scripts
  fi
  
  if [ "$PHASE" -eq 0 ] || [ "$PHASE" -eq 3 ]; then
    phase3_routers
  fi
  
  if [ "$PHASE" -eq 0 ] || [ "$PHASE" -eq 4 ]; then
    phase4_services_docs
  fi
  
  log_success "Reorganization script complete!"
  
  if [ "$DRY_RUN" = false ]; then
    log_info "Next steps:"
    log_info "1. Review changes: git status"
    log_info "2. Update cross-references in documentation"
    log_info "3. Update any hardcoded paths in code"
    log_info "4. Test the build and test suite"
    log_info "5. Commit changes when ready"
  else
    log_info "This was a dry run. Use without --dry-run to execute."
  fi
}

# Run main function
main
