# API Migration Risk Register

**Document Type:** Risk Register  
**Revision:** 2.0  
**Date:** 2026-05-11  
**Scope:** api.lanonasis.com Netlify → VPS Migration  
**Status:** REVISED — Pre-Execution Hardening

---

## Risk Register

### RISK-001: No SSL Certificate for api.lanonasis.com

| Field | Value |
|-------|-------|
| Risk ID | RISK-001 |
| Title | SSL Certificate Not Issued |
| Affected Dependencies | All routes |
| Severity | 🔴 CRITICAL |
| Likelihood | KNOWN |
| Detection Method | `certbot certificates` returns none |
| Mitigation | Run certbot DNS challenge before cutover |
| Rollback Path | N/A — blocks initial deployment |
| Owner/Action | Infrastructure team to run certbot |
| Bridge Phase | **A** |

### RISK-002: MCP Long-Lived Connections Break on DNS Change

| Field | Value |
|-------|-------|
| Risk ID | RISK-002 |
| Title | SSE/WebSocket Clients Not Ready for DNS Migration |
| Affected Dependencies | DEP-MCP-WS, DEP-MCP-SSE |
| Severity | 🔴 HIGH |
| Likelihood | MEDIUM |
| Detection Method | Test with `--resolve` or DNS override |
| Mitigation | Test reconnection logic before bridge; warn users |
| Rollback Path | Revert DNS A record; clients auto-reconnect to Netlify |
| Owner/Action | MCP client owners to verify reconnection |
| Bridge Phase | **E** (blocked until proven) |

### RISK-003: OAuth Redirect URI Mismatch

| Field | Value |
|-------|-------|
| Risk ID | RISK-003 |
| Title | OAuth redirect_uri Validation Failure |
| Affected Dependencies | DEP-OAUTH-AUTH, DEP-OAUTH-TOKEN, DEP-OAUTH-CB |
| Severity | 🔴 HIGH |
| Likelihood | MEDIUM |
| Detection Method | Live OAuth flow test with `--resolve` |
| Mitigation | Verify redirect URIs match in auth-gateway config |
| Rollback Path | Revert DNS A record; Netlify OAuth handlers still active |
| Owner/Action | Auth team to verify OAuth config |
| Bridge Phase | **D** (blocked until proven) |

### RISK-004: Auth Login Cookie Handling

| Field | Value |
|-------|-------|
| Risk ID | RISK-004 |
| Title | Session Cookie Not Set or Lost After Migration |
| Affected Dependencies | DEP-AUTH-LOGIN, DEP-AUTH-REG, DEP-AUTH-REFRESH |
| Severity | 🔴 HIGH |
| Likelihood | MEDIUM |
| Detection Method | Test login with invalid credentials (expects 400/401, not 502) |
| Mitigation | Verify SameSite=Lax and Secure flags match Netlify |
| Rollback Path | Revert DNS; Netlify cookie still valid |
| Owner/Action | Auth team to verify cookie attributes |
| Bridge Phase | **D** (blocked until proven both invalid and valid) |

### RISK-005: CORS Origin Validation Fails

| Field | Value |
|-------|-------|
| Risk ID | RISK-005 |
| Title | CORS Whitelist Mismatch |
| Affected Dependencies | All frontend clients |
| Severity | 🟡 MEDIUM |
| Likelihood | LOW |
| Detection Method | Test with `curl -H "Origin: https://dashboard.lanonasis.com"` |
| Mitigation | Match nginx CORS whitelist to Netlify config |
| Rollback Path | Revert DNS; Netlify CORS still valid |
| Owner/Action | Nginx config must match Netlify origin whitelist |

### RISK-006: Auth-Gateway Outbox Backlog

| Field | Value |
|-------|-------|
| Risk ID | RISK-006 |
| Title | Auth-Gateway Has 2017 Pending Outbound Messages |
| Affected Dependencies | auth-gateway service |
| Severity | 🟡 MEDIUM |
| Likelihood | KNOWN |
| Detection Method | `curl -s http://localhost:4000/health | jq '.outbox.pending'` |
| Mitigation | Investigate pending messages before restart |
| Rollback Path | N/A — internal service state only |
| Owner/Action | Auth team to review outbox |

### RISK-007: Supabase Direct Proxy Headers Lost

| Field | Value |
|-------|-------|
| Risk ID | RISK-007 |
| Title | Intelligence Routes Missing Headers |
| Affected Dependencies | DEP-INT-ANALYZE, DEP-INT-TAGS, DEP-PROF-GET, DEP-PROF-ASK |
| Severity | 🟡 MEDIUM |
| Likelihood | LOW |
| Detection Method | Compare response from Netlify vs VPS `--resolve` |
| Mitigation | Verify nginx proxy_set_header directives |
| Rollback Path | N/A — config fixable |
| Owner/Action | Nginx team to verify headers |

### RISK-008: Unknown Netlify Function Behavior

| Field | Value |
|-------|-------|
| Risk ID | RISK-008 |
| Title | Netlify-Specific Logic Not in VPS |
| Affected Dependencies | Undocumented Netlify function behavior |
| Severity | 🟡 MEDIUM |
| Likelihood | LOW |
| Detection Method | Compare live responses |
| Mitigation | Review Netlify function source code |
| Rollback Path | Revert DNS; Netlify still active 7 days |
| Owner/Action | Code review before migration |

### RISK-009: DNS Propagation Gap

| Field | Value |
|-------|-------|
| Risk ID | RISK-009 |
| Title | Users Hit Different Backends During TTL Window |
| Affected Dependencies | All routes |
| Severity | 🟢 LOW |
| Likelihood | HIGH (100% during cutover) |
| Detection Method | Expected by design |
| Mitigation | Set TTL to 300s; monitor for 10 min |
| Rollback Path | Revert DNS A record |
| Owner/Action | DNS provider to verify TTL settings |

### RISK-010: Auth Status Route Behavior Change

| Field | Value |
|-------|-------|
| Risk ID | RISK-010 |
| Title | /api/v1/auth/status Behavior Differs Between Netlify and VPS |
| Affected Dependencies | DEP-AUTH-STATUS |
| Severity | 🟡 MEDIUM |
| Likelihood | LOW |
| Detection Method | Test with `--resolve` to compare response |
| Mitigation | Verify Supabase direct returns same JSON shape |
| Rollback Path | Bridge not applied; stays on Netlify |
| Owner/Action | Auth team to verify parity |
| Bridge Phase | **C** |

---

## Risk Summary by Severity

| Severity | Count | Items |
|----------|-------|-------|
| 🔴 CRITICAL | 1 | RISK-001 |
| 🔴 HIGH | 3 | RISK-002, RISK-003, RISK-004 |
| 🟡 MEDIUM | 5 | RISK-005, RISK-006, RISK-007, RISK-008, RISK-010 |
| 🟢 LOW | 1 | RISK-009 |

---

## Risk Summary by Bridge Phase

| Bridge Phase | Blocked Risks | Go Criteria |
|------------|------------|-----------|
| **A** | RISK-001 | SSL cert issued |
| **B** | None (static only) | All return 200 |
| **C** | RISK-010 | Auth status parity verified |
| **D** | RISK-003, RISK-004 | OAuth + cookie handling verified |
| **E** | RISK-002 | MCP reconnection verified |

---

## Pre-Migration Completion Checklist

- [ ] **RISK-001**: SSL certificate issued via certbot DNS challenge
- [ ] **RISK-006**: Auth-gateway outbox backlog investigated
- [ ] All Phase B routes tested with `--resolve`
- [ ] Phase C auth status tested with `--resolve`
- [ ] Phase D auth login tested (invalid 400/401, valid Set-Cookie)
- [ ] Phase D OAuth authorize tested with `--resolve`
- [ ] Phase E MCP reconnection tested (or DNS override method documented)
- [ ] CORS whitelist validated
- [ ] Redirect URI configuration verified
- [ ] DNS TTL lowered to 300s

---

## Netlify Bridge Rollback Gate

| Pre-Bridge Requirement | Command/Action |
|------------------------|----------------|
| Backup current _redirects | `cp apps/onasis-core/_redirects apps/onasis-core/_redirects.backup.$(date +%Y%m%d%H%M%S)` |
| Prepare rollback patch | `git diff apps/onasis-core/_redirects > rollback-bridge.patch` |
| Restore command | `git checkout apps/onasis-core/_redirects` or apply patch |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 2.0 |
| Created | 2026-05-11 |
| Last Updated | 2026-05-11 02:30 UTC |
| Owner | Infrastructure Team |
| Review Frequency | Daily during migration |

---

*This document is a living artifact. Add new risks as they are identified.*