#!/bin/bash
# Create GitHub issues for OAuth2 PKCE enhancements
# Usage: ./create-oauth-issues.sh

REPO="thefixer3x/Onasis-CORE"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found. Install with: sudo apt install gh"
    echo "Then authenticate with: gh auth login"
    exit 1
fi

echo "Creating OAuth2 PKCE enhancement issues in $REPO..."
echo ""

# Issue 1: Token Hashing
gh issue create \
  --repo "$REPO" \
  --title "[Security] Upgrade Token Hashing from SHA-256 to bcrypt/Argon2" \
  --label "security,enhancement,oauth2-pkce" \
  --body "**Priority:** Critical (Security)
**Target Branch:** \`oauth2-pkce\`

## Description
Current implementation uses SHA-256 for token hashing which is vulnerable to brute-force attacks. Need to migrate to bcrypt or Argon2 for production-grade security.

## Tasks
- [ ] Replace SHA-256 with bcrypt in \`src/utils/pkce.ts\`
- [ ] Implement \`src/utils/enhanced-hashing.ts\` with bcrypt/Argon2
- [ ] Add migration utilities for existing SHA-256 hashes
- [ ] Update token generation in \`oauth.service.ts\`
- [ ] Add unit tests for new hashing functions
- [ ] Performance benchmarking (target: <100ms per hash)

## Dependencies
- bcryptjs (already in package.json)
- Migration strategy for existing tokens

## References
- OWASP Password Storage Cheat Sheet
- RFC 7636 (PKCE) security considerations

**⚠️ Work should be done in \`oauth2-pkce\` branch**"

# Issue 2: Redis Caching
gh issue create \
  --repo "$REPO" \
  --title "[Performance] Implement Redis Caching Layer for OAuth2" \
  --label "performance,enhancement,oauth2-pkce" \
  --body "**Priority:** High (Scalability)
**Target Branch:** \`oauth2-pkce\`

## Description
Current in-memory stores won't scale in production or across multiple instances. Implement Redis caching for OAuth clients, authorization codes, and tokens.

## Tasks
- [ ] Complete \`src/services/cache.service.ts\` implementation
- [ ] Replace in-memory stores in \`oauth.service.ts\`
- [ ] Implement TTL-based expiration for auth codes (10 min)
- [ ] Implement TTL-based expiration for tokens (configurable)
- [ ] Add Redis connection health checks
- [ ] Add cache invalidation on revocation
- [ ] Handle Redis connection failures gracefully (fallback)
- [ ] Integration tests with Redis

## Dependencies
- ioredis (already in package.json)
- Redis server instance
- Environment variables for Redis connection

## References
- OAuth2 Authorization Code lifetime best practices
- Redis caching patterns

**⚠️ Work should be done in \`oauth2-pkce\` branch**"

# Issue 3: Test Suite
gh issue create \
  --repo "$REPO" \
  --title "[Testing] Comprehensive Test Suite for OAuth2 PKCE" \
  --label "testing,enhancement,oauth2-pkce" \
  --body "**Priority:** High (Quality)
**Target Branch:** \`oauth2-pkce\`

## Description
No test coverage for OAuth2 PKCE implementation. Need unit, integration, security, and load tests.

## Tasks

### Unit Tests
- [ ] Complete \`tests/unit/pkce.test.ts\` (code challenge validation)
- [ ] Complete \`tests/unit/rate-limit.test.ts\`
- [ ] Add tests for token generation/validation
- [ ] Add tests for cache.service.ts

### Integration Tests
- [ ] Complete \`tests/integration/oauth-flow.test.ts\`
- [ ] Test full authorization code flow
- [ ] Test token refresh flow
- [ ] Test token revocation chain
- [ ] Test PKCE validation edge cases

### Security Tests
- [ ] Test rate limiting effectiveness
- [ ] Test CSRF protection
- [ ] Test timing attack resistance
- [ ] Test invalid code_verifier rejection
- [ ] Test replay attack prevention

### Load Tests
- [ ] Complete \`tests/load/oauth-flow.js\` (K6)
- [ ] Target: 100 req/s authorization endpoint
- [ ] Target: 500 req/s token endpoint
- [ ] Measure p95/p99 latency

## Dependencies
- vitest, playwright, k6, supertest (already in package.json)

## Target Coverage
- Minimum 80% code coverage
- 100% coverage for security-critical paths

**⚠️ Work should be done in \`oauth2-pkce\` branch**"

# Issue 4: Monitoring
gh issue create \
  --repo "$REPO" \
  --title "[Monitoring] Production Observability for OAuth2" \
  --label "monitoring,enhancement,oauth2-pkce" \
  --body "**Priority:** Medium (Operations)
**Target Branch:** \`oauth2-pkce\`

## Description
Add Prometheus metrics and alerting for OAuth2 operations to enable production monitoring.

## Tasks
- [ ] Implement Prometheus metrics endpoint
- [ ] Add metrics for authorization requests (total, success, failure)
- [ ] Add metrics for token issuance (by grant_type)
- [ ] Add metrics for token revocation
- [ ] Add metrics for rate limiting (requests blocked)
- [ ] Add histogram for response times
- [ ] Add gauge for active tokens/sessions
- [ ] Create Grafana dashboard template
- [ ] Define alerting rules (error rate > 5%, p95 latency > 500ms)

## Dependencies
- prom-client (already in package.json)
- Prometheus server
- Grafana (optional)

## Metrics to Track
\`\`\`
oauth_authorize_requests_total{status}
oauth_token_requests_total{grant_type,status}
oauth_revoke_requests_total{status}
oauth_introspect_requests_total{status}
oauth_rate_limit_blocked_total
oauth_request_duration_seconds{endpoint}
oauth_active_tokens
\`\`\`

**⚠️ Work should be done in \`oauth2-pkce\` branch**"

# Issue 5: Compression
gh issue create \
  --repo "$REPO" \
  --title "[Performance] Response Compression Middleware" \
  --label "performance,enhancement,oauth2-pkce" \
  --body "**Priority:** Low (Performance)
**Target Branch:** \`oauth2-pkce\`

## Description
Implement gzip/Brotli compression for OAuth responses to reduce bandwidth and improve performance for larger payloads.

## Tasks
- [ ] Fix syntax errors in \`src/middleware/compression.ts\`
- [ ] Implement compression for JSON responses > 1KB
- [ ] Add Brotli support for modern browsers
- [ ] Add compression ratio logging
- [ ] Configure compression levels (gzip: 6, Brotli: 4)
- [ ] Add performance benchmarks
- [ ] Test with large introspection responses

## Dependencies
- compression (already in package.json)
- @types/compression (already in devDependencies)

## Expected Impact
- 60-80% reduction in response size for JSON
- 5-10% improvement in response times

**⚠️ Work should be done in \`oauth2-pkce\` branch**"

# Issue 6: Feature Flags
gh issue create \
  --repo "$REPO" \
  --title "[Deployment] Feature Flags & Gradual Rollout" \
  --label "deployment,enhancement,oauth2-pkce" \
  --body "**Priority:** Low (Operations)
**Target Branch:** \`oauth2-pkce\`

## Description
Implement feature flags to enable gradual rollout of OAuth2 PKCE and easy rollback if issues arise.

## Tasks
- [ ] Add environment variable \`OAUTH2_ENABLED\` (default: true)
- [ ] Add per-client feature flags in database
- [ ] Implement feature flag middleware
- [ ] Add metrics for feature flag usage
- [ ] Document rollback procedures
- [ ] Create deployment runbook

## Use Cases
- Enable OAuth2 for specific clients first
- Quick disable if production issues detected
- A/B testing of OAuth vs legacy auth
- Gradual migration strategy

**⚠️ Work should be done in \`oauth2-pkce\` branch**"

echo ""
echo "✅ All issues created successfully!"
echo ""
echo "View issues at: https://github.com/$REPO/issues"
