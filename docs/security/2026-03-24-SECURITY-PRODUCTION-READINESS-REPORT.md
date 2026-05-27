# Security Test & Production Readiness Report

**Date:** 2026-03-24  
**Scope:** Onasis-CORE repository and deployment configuration artifacts  
**Assessor:** Codex automated review (static + executable checks)

---

## 1) Executive Summary

Overall readiness is **NOT READY FOR FINAL PRODUCTION DEPLOYMENT** pending remediation of security and operational blockers.

### Headline Results
- Dependency/tooling setup is installable with Bun, and frontend build succeeds.
- Security and functional validation is currently constrained by network reachability to external test targets.
- Multiple code/configuration findings indicate credential-handling risk and weak production hardening defaults.
- No evidence of active alerting configuration was identified in-repo; redundancy appears partial and asymmetric across services.

### Recommended Gate Decision
**Gate: HOLD** until all P0/P1 tasks in Section 6 are complete.

---

## 2) Security Assessment

### 2.1 Vulnerability Scanning Performed

#### A) Dependency / build integrity scan
- `bun install` completed successfully.
- `bun run lint` failed with 30 errors, including parse errors in auth/security-adjacent files and policy-rule violations.
- `bun run test:run` executed but failed due to `ENETUNREACH` on external Supabase/Netlify endpoints.
- `bun run build` completed successfully.

#### B) Secret exposure / insecure pattern scan (repo-level)
Manual pattern scan identified multiple high-sensitivity areas:

| ID | Finding | Evidence | Severity | Risk |
|---|---|---|---|---|
| V-001 | Default fallback API key literal in router script | `scripts/ai-service-router.js` uses hardcoded fallback secret pattern in `Authorization` header construction | **High** | May enable unintended access path if env vars are unset or logs leak headers. |
| V-002 | SQL script prints generated secret keys in notices | `scripts/create_admin_api_keys.sql` emits key secrets in output | **High** | Credential disclosure risk in terminal logs/CI logs/history. |
| V-003 | Wildcard CORS on health function | `functions/health.js` sets `Access-Control-Allow-Origin: *` | **Medium** | Broad cross-origin access increases abuse surface (especially if endpoint grows in sensitivity). |
| V-004 | Demo credentials embedded in testing scripts | `scripts/test/test-api.sh` and `scripts/test/test-mcp-auth.sh` include static test credentials | **Medium** | Can normalize unsafe credential practices and leak in logs/chat artifacts. |
| V-005 | PM2 configs in development mode | `ecosystem.config.cjs` and `server/ecosystem.config.cjs` both default to `NODE_ENV=development` | **Medium** | Potentially weaker runtime protections and noisy debug behavior in production deployment paths. |

### 2.2 Penetration Testing (Critical Endpoints)

Endpoint smoke/pen tests were attempted via existing test harnesses.

- `scripts/test/test-api.sh` was executed against sandbox API target.
- Root (`/`), health (`/health`), and OAuth authorize tests returned HTTP `000` (unreachable).
- Authentication token acquisition failed; downstream authenticated endpoint tests could not proceed.

**Interpretation:** Endpoint availability and/or network path is currently failing from this environment, preventing full exploitability validation.

### 2.3 Compliance & Policy Alignment Snapshot

Observed controls present in config:
- TLS1.2/1.3 and core security headers configured in Nginx.
- Rate limiting zones defined for API, auth, memory, and AI routes.

Observed control gaps / concerns:
- CORS origin reflection (`'$http_origin'`) with credentials enabled requires strict origin allowlisting controls not visible in this config file.
- CSP still permits `'unsafe-inline'` for scripts/styles.
- No in-repo SOC2/ISO control mapping evidence for security monitoring ownership/workflows.

---

## 3) Production Readiness Evaluation

### 3.1 Performance Under Expected Load

- No repeatable local load test profile (k6/artillery/locust) is currently wired in this repo.
- Existing test suite relies heavily on external endpoints and failed due to network reachability.

**Status:** ⚠️ **Insufficient evidence** for production load readiness.

### 3.2 Redundancy & Failover

- Auth upstream has two backends with one marked as `backup` (partial redundancy).
- Memory and MCP upstreams are single-instance targets (no active failover peer configured).

**Status:** ⚠️ **Partially ready** (auth only).

### 3.3 Monitoring & Alerting

- PM2 log file paths are configured.
- No explicit alert routing/paging configuration (e.g., PagerDuty/Opsgenie/Slack webhooks/SLO burn alerts) found in scoped repo configs.

**Status:** ❌ **Not production-ready** for incident response posture.

### 3.4 Backup & Disaster Recovery

- A comprehensive VPS backup script exists and includes app/config snapshots + optional DB dumps.
- Process appears manual/scripted and not evidently scheduled/test-restored in this repo.

**Status:** ⚠️ **Partially ready** pending automation + restore drills.

---

## 4) Risk Assessment

| Risk Area | Current Level | Rationale |
|---|---|---|
| Credentials & secrets handling | **High** | Hardcoded fallback secret pattern + secret material output in SQL utility workflows. |
| External endpoint reliability | **High** | Critical endpoint tests failed with HTTP 000/ENETUNREACH, blocking confidence in auth/data paths. |
| Runtime hardening | **Medium** | Development-mode defaults and permissive CORS/CSP patterns need tightening. |
| Operational resilience | **Medium-High** | Uneven redundancy and no explicit alerting posture documented in-repo. |
| DR maturity | **Medium** | Backup scripting exists, but no evidence of scheduled execution and restore verification cycles. |

---

## 5) Readiness Status

### Deployment Readiness Decision: **NOT READY**

**Readiness score (evidence-weighted): 58/100**

- Security controls present but not consistently hardened.
- Critical test evidence is incomplete due to endpoint reachability failures.
- Operational readiness (alerting/failover/load proof) requires closure before launch.

---

## 6) Action-Oriented To-Do List (Outstanding)

> Priority scale: **P0 (blocker), P1 (high), P2 (medium), P3 (low)**

| Priority | Action Item | Owner | Target Date | Exit Criteria |
|---|---|---|---|---|
| **P0** | Remove hardcoded fallback secrets from runtime scripts and enforce env-only secret injection. | Security Eng + Backend | 2026-03-26 | No secret literals in code scan; startup fails closed when required env missing. |
| **P0** | Stop emitting generated key secrets in SQL notices and any logs. | Security Eng + Data Eng | 2026-03-26 | SQL utilities redact/omit secrets; reviewed in dry-run output. |
| **P0** | Restore endpoint reachability for sandbox/prod-like auth and health endpoints; rerun pen smoke suite successfully. | Platform/SRE | 2026-03-27 | `/`, `/health`, `/auth/login`, `/auth/authorize` reachable with expected status codes. |
| **P1** | Replace permissive CORS/CSP defaults with explicit origin allowlist and no `unsafe-inline` where feasible. | AppSec + Frontend Platform | 2026-03-29 | Nginx config hardened; validation tests confirm blocked unauthorized origins. |
| **P1** | Convert PM2 runtime defaults to production-safe env (`NODE_ENV=production`) for deploy profiles. | Platform/SRE | 2026-03-27 | Deploy manifests/configs use production mode by default. |
| **P1** | Add active-active or active-standby failover for memory and MCP backends. | Platform/SRE | 2026-03-31 | Nginx upstreams define healthy secondary nodes and failover test passes. |
| **P1** | Stand up alerting matrix (availability, auth failures, error-rate, latency, saturation) with paging. | SRE + Incident Response Lead | 2026-03-31 | Alert rules deployed and test-alert drill acknowledged by on-call. |
| **P2** | Add reproducible load test profiles (k6/artillery) for auth + memory critical paths. | Performance Eng | 2026-04-02 | Baseline throughput/latency report captured and thresholded. |
| **P2** | Automate backup schedule and implement quarterly restore drills with evidence retention. | Platform/SRE + DBA | 2026-04-05 | Cron/pipeline job active + last successful restore report attached. |
| **P3** | Replace embedded demo credentials in scripts with env-injected test fixtures and docs. | QA + Security Eng | 2026-04-07 | Test scripts require env vars and contain no static credentials. |

---

## 7) Delivery Timeline (Requested Format)

- **Security testing:** 2026-03-24 to 2026-03-27
- **Report compilation:** 2026-03-27 to 2026-03-28
- **To-do list review and closure:** 2026-03-28 to 2026-04-07

---

## 8) Evidence (Commands Executed)

```bash
bun install
bun run lint
bun run test:run
bun run build
bash scripts/test/test-api.sh
rg -n "(TODO|FIXME|password|secret|api[_-]?key|jwt|eval\(|child_process\.exec\(|Access-Control-Allow-Origin\"\s*:\s*\"\*\")" functions server deploy scripts
```

