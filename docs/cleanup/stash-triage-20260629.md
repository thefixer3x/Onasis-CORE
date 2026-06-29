# Stash Triage: 2026-06-29

This note captures the disposition of the local stash retained in `apps/onasis-core` during the monorepo submodule cleanup pass.

- Stash ref at review time: `stash@{0}`
- Stash object: `0e3bc9e7dc8a47fb1eb786cc4f43055ed181a901`
- Review branch: `sanitize/stash-auth-gateway-20260629`
- Original stash remains local and was intentionally not dropped

## Files in the Stash

- `auth.html`
- `netlify.toml`
- `netlify/functions/api-gateway.js`
- `netlify/functions/maas-api.js`
- `package.json`
- `turbo.json`

## Outcome

The stash was applied onto current `main` and produced conflicts in every file. That was expected because the submodule has moved since the stash was created.

After review, the branch was resolved back to current `main` content and no stash code was replayed directly. The reasons were:

- `auth.html`
  - The stash intent was improved password-toggle accessibility and `backdrop-filter` compatibility.
  - Current `main` already contains the relevant accessibility state and browser-compatibility support.
- `netlify/functions/maas-api.js`
  - The stash assumed an older API-key and memory-routing shape.
  - Current `main` already has a newer memory edge-proxy flow and broader `/api/v1/memory` handling.
- `netlify/functions/api-gateway.js`
  - The stash added memory proxying through the gateway.
  - Current routing already covers memory endpoints through `_redirects`, `memory-proxy`, and `maas-api`.
- `package.json` and `turbo.json`
  - The stash reflects an older service-oriented project shape.
  - Current `main` is a different application layout, so replaying those changes would be high-risk.
- `netlify.toml`
  - The stash added extra route definitions and expanded secret-scan omit configuration.
  - Current `_redirects` already covers the relevant live routes.
  - The omit-list expansion included concrete token-like and project-specific values, so it must not be published verbatim.

## Sensitive Content Handling

The only clearly unique stash content was the expanded secret-scan omit configuration in `netlify.toml`. That content was intentionally kept local only because it included concrete value patterns that should be sanitized before any remote preservation.

If this stash needs to be turned into mergeable code later, use this pattern:

1. Create a fresh branch from current `main`.
2. Apply the stash without dropping it.
3. Reintroduce only still-relevant behavior in small commits.
4. Replace any concrete token-like or environment-specific literals with placeholders or env-driven references.
5. Open a draft PR and keep the original stash until the sanitized branch is verified.

## Current Recommendation

Treat the stash as a local forensic artifact, not a merge candidate.

If future review shows a missing behavior from this stash, rebuild that specific behavior from current `main` rather than replaying the old patch wholesale.
