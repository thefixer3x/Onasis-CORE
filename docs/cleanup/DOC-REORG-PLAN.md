# Documentation Reorganization Plan (Auth Gateway & Memory Service Focus)

_Last updated: 2025-11-02_

## Why this plan exists

While we implement the OAuth2 PKCE build for the auth-gateway and keep the Memory Service stable, we need a single source of truth for documentation. This plan:

1. Declares the **canonical references** you must follow during the PKCE rollout.
2. Maps every root-level `.md` status file to a context-based folder so stale copies stop causing conflicts.
3. Staggers the clean-up so we do not break links or lose critical history mid-implementation.

Follow the phases in order—Phase 0 is required before touching the code.

---

## Phase 0 — Canonical references (effective immediately)

| Area                      | Canonical location                                | Contents                                                                                                                                                            | Notes                                                                                                                                                        |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth Gateway PKCE build   | `services/auth-gateway/auth-gateway-oauth2-pkce/` | `README.md`, `OAUTH2_PKCE_IMPLEMENTATION_GUIDE.md`, `IMPLEMENTATION_CHECKLIST.md`, `CLIENT_INTEGRATION_GUIDE.md`, `PORT_MAPPING_COMPLETE.md`, `002_oauth2_pkce.sql` | **Only** consult these when coding the OAuth endpoints. Treat everything else (root summaries, legacy guides) as archival unless explicitly referenced here. |
| Memory Service (MaaS)     | `docs/memory/` + `netlify/functions/maas-api.js`  | Integration plan, quick reference, architecture diagram, REST handlers                                                                                              | The Netlify `maas-api.js` function is the production surface. All CLI/MCP tooling should align with these docs.                                              |
| Netlify routing & proxies | `_redirects`, `netlify/functions/*.js`            | Source of truth for deployed endpoints                                                                                                                              | Keep zipped deploy artifacts until the new pipeline ships; mark them as build outputs in future.                                                             |

Action: add this file, the updated `ACTIVE-COMPONENT-INVENTORY.md`, and PKCE reference folder to the team’s shared bookmarking list.

---

## Phase 1 — Group root Markdown files by domain

The table below lists each root-level `.md` file and where it should live long term. **Do not move files yet**; simply treat the "Recommended action" column as the plan while we finish the PKCE build. Once Phase 2 begins you can apply the moves in batches.

| File                                        | Current path | Recommended action              | Target folder                       | Rationale                                                        |
| ------------------------------------------- | ------------ | ------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| `AUTH-FIX-SUMMARY.md`                       | `/`          | Move after Phase 1 freeze       | `docs/auth/legacy/`                 | Captures earlier auth patches; keep for audit but out of root.   |
| `AUTH-SERVER-FIX-SUMMARY.md`                | `/`          | Move                            | `docs/auth/legacy/`                 | Same audience as above.                                          |
| `AUTHENTICATION-ARCHITECTURE.md`            | `/`          | Move                            | `docs/auth/`                        | High-value architecture doc; belongs with active auth materials. |
| `API-GATEWAY-AUTH-FIX.md`                   | `/`          | Move                            | `docs/api-gateway/` (new)           | Describes combined gateway/auth remediation.                     |
| `DASHBOARD-AUTH-FIX-COMPLETE.md`            | `/`          | Move                            | `docs/auth/legacy/`                 | Historical fix; archive.                                         |
| `DUAL-AUTH-ANALYSIS.md`                     | `/`          | Move                            | `docs/auth/analysis/` (new)         | Deep dive on dual auth; keep near PKCE docs.                     |
| `UNIFIED-AUTH-COMPLETE.md`                  | `/`          | Move                            | `docs/auth/`                        | Still relevant to the PKCE roadmap.                              |
| `UNIFIED-AUTH-MIGRATION-PLAN.md`            | `/`          | Move                            | `docs/auth/`                        | Pair with unified auth doc.                                      |
| `NETLIFY-AUTH-FIX.md`                       | `/`          | Move                            | `docs/deployment/netlify/`          | Deployment-specific instructions.                                |
| `NEON-DATABASE-UPDATE.md`                   | `/`          | Move                            | `docs/deployment/databases/`        | Database migration log.                                          |
| `DATABASE-FIX-SUMMARY.md`                   | `/`          | Move                            | `docs/deployment/databases/legacy/` | Historical summary.                                              |
| `SERVICE-AUDIT-SUMMARY.md`                  | `/`          | Move                            | `docs/security/`                    | Already has `docs/security/`; slot it there.                     |
| `WEBSOCKET-STABILITY-FIXES.md`              | `/`          | Move                            | `docs/mcp/`                         | Align with MCP/WebSocket tooling.                                |
| `PM2-STABILITY-FIX.md`                      | `/`          | Move                            | `docs/deployment/pm2/`              | Operational runbook.                                             |
| `FRONTEND-FIX-REQUIRED.md`                  | `/`          | Move                            | `docs/frontend/legacy/`             | Dashboard-specific note.                                         |
| `COMPLETE-FIX-SUMMARY.md`                   | `/`          | Archive (rename to `.archive/`) | `.archive/2024-fixes/`              | Mega summary—keep for posterity but outside active docs.         |
| `ACTUAL-FIX-SUMMARY.md`                     | `/`          | Archive                         | `.archive/2024-fixes/`              | Historical status.                                               |
| `ACTUAL-PROBLEM-IDENTIFIED.md`              | `/`          | Archive                         | `.archive/2024-fixes/`              | Problem statement for the above fix.                             |
| `CRITICAL-SYNC-SUMMARY.md`                  | `/`          | Archive                         | `.archive/2024-fixes/`              | Sync recap.                                                      |
| `FINAL-SOLUTION-SUMMARY.md`                 | `/`          | Archive                         | `.archive/2024-fixes/`              | Completed fix log.                                               |
| `FINAL-STATUS.md`                           | `/`          | Keep (root)                     | `/`                                 | Acts as project-level status board; leave in root.               |
| `INFRASTRUCTURE-CHECK.md`                   | `/`          | Keep (root)                     | `/`                                 | Still referenced by operators; rename later if needed.           |
| `URGENT-CREDENTIAL-LEAK-ACTION-REQUIRED.md` | `/`          | Archive                         | `.archive/incidents/`               | Incident report; keep but off the main path.                     |
| `API-GATEWAY-AUTH-FIX.md`                   | `/`          | Move                            | `docs/api-gateway/`                 | Combined fix for API gateway.                                    |
| `TYPESCRIPT_ERRORS_EXPLAINED.md`            | `/`          | Keep (root)                     | `/`                                 | Used by contributors debugging tsconfig—leave accessible.        |

Feel free to extend the table for any additional files you surface; keep the same columns so we can track sign-off.

---

## Phase 2 — Physical moves (after PKCE endpoints are merged)

1. Create the target folders listed above (`docs/auth/legacy`, `docs/api-gateway/`, `docs/deployment/netlify/`, etc.).
2. Move files in batches grouped by domain. After each batch, run `git status` and ensure no unrelated files changed.
3. Add short `README.md` files to each new folder summarizing its scope so future contributors know where to drop follow-up docs.
4. Update cross-links inside the moved Markdown files if they refer to sibling documents by relative path.

**Guardrail:** Do not move `README.md`, `FINAL-STATUS.md`, `INFRASTRUCTURE-CHECK.md`, or `TYPESCRIPT_ERRORS_EXPLAINED.md` until we review tooling that references them.

---

## Phase 3 — Remove or downscope stale duplicates

- Delete zipped Netlify artifacts once the CI/CD pipeline produces them on demand.
- Replace root-level fix summaries with a single `docs/history/CHANGELOG-2024.md` file that links to archived copies.
- For each deleted file, add an entry to `docs/history/README.md` so auditors know where to find retired content.

---

## Coordination checklist

- [ ] Share this plan with the Memory Service maintainers so they know no docs relevant to them will disappear.
- [ ] Flag any automated tooling (scripts, onboarding docs) that assumes the old paths.
- [ ] Update onboarding docs to point to the canonical folders once the moves are complete.

Once Phases 0–1 are in effect, you can proceed safely with the OAuth2 PKCE build without getting tripped up by conflicting documentation.
