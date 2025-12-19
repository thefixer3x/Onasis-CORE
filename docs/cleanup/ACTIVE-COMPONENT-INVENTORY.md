# Active Component Inventory (2025-11-02)

This inventory highlights the parts of the repository that currently ship executable code, the scripts that launch them, and the dependencies that justify staying in the root `package.json`. Use it as the baseline when pruning duplicated guides and unused packages.

## Runtime Surface

| Component                         | Location                                         | Start command(s)                                                            | Role                                                                                              | Key dependencies                                                                                                                                      |
| --------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend SPA                      | `src/`, `index.html`, `vite.config.ts`           | `bun run dev`, `bun run build`, `bun run preview`                           | React dashboard that talks to the auth/API layer via `/auth` and `/api` proxies.                  | `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `react-hot-toast`, `lucide-react`, `react-hook-form`, `@hookform/resolvers`, `zod` |
| Local API server                  | `server/index.js`                                | `bun run server:start` (`node server/index.js`)                             | Express fallback API for local development; issues JWTs and proxies Supabase when available.      | `express`, `cors`, `cookie-parser`, `jsonwebtoken`, `bcryptjs`, `@supabase/supabase-js`, `ws`                                                         |
| Netlify Functions bundle          | `netlify/functions/*.js` (plus `.zip` artifacts) | Deployed by Netlify; invoke via `/.netlify/functions/<name>`                | Serverless replacement for the Express API (`auth-api`, `maas-api`, `key-manager`, etc.).         | `@netlify/functions`, `serverless-http`, `express`, `jsonwebtoken`, `bcryptjs`, `@supabase/supabase-js`                                               |
| Memory Service (MaaS API)         | `netlify/functions/maas-api.js`                  | Deployed by Netlify; mirrors via `_redirects` and `/maas/*` routes          | Primary vector memory service exposed through REST. Powers MCP tooling and memory adapters.       | `express`, `serverless-http`, `jsonwebtoken`, `@supabase/supabase-js`, `node-fetch`, shared audit/masking utils                                       |
| Auth Gateway service (TypeScript) | `services/auth-gateway`                          | `bun run --filter auth-gateway dev` / `bun run --filter auth-gateway build` | Full-featured auth service targeting Neon/Supabase. Includes PM2 scripts, Dockerfile, migrations. | `express`, `helmet`, `cookie-parser`, `cors`, `jsonwebtoken`, `bcryptjs`, `@neondatabase/serverless`, `@supabase/supabase-js`, `ws`, `zod`            |
| Privacy API Gateway (legacy)      | `services/api-gateway/server.js`                 | `node services/api-gateway/server.js`                                       | Legacy vendor-masking proxy. Shares many Express deps with the main server.                       | `express`, `cors`, `helmet`, `node-fetch`, `winston`                                                                                                  |
| Key manager microservice          | `services/key-manager/server.js`                 | `node services/key-manager/server.js`                                       | Issues API keys against Supabase; consumed by dashboards.                                         | `express`, `@supabase/supabase-js`, `jsonwebtoken`, `bcryptjs`                                                                                        |
| MCP websocket router              | `services/websocket-mcp-handler.js`              | `node services/websocket-mcp-handler.js`                                    | Handles MCP relay via websockets, reuses Supabase client.                                         | `ws`, `@supabase/supabase-js`                                                                                                                         |

> **Note:** The zipped files inside `netlify/functions/` are pre-built artifacts. If you adopt a clean build pipeline they can be removed to cut duplication. The memory service REST function (`maas-api.js`) is the production path today—any rewrite must preserve its schema and Supabase audit hooks.

## Root package scripts

The `.npmrc` forces Bun, so prefer the following:

- `bun run dev` → launches Vite dev server on port 3000.
- `bun run build` → runs `tsc` type-check then `vite build` (outputs `dist/`).
- `bun run preview` → serves the generated SPA.
- `bun run lint` → executes ESLint with the project config.
- `bun run test` → runs Vitest (currently no test files under `src/`).

## Dependency audit (root `package.json`)

**Required for current runtimes**

- Frontend/UI: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `react-hot-toast`, `lucide-react`, `react-hook-form`, `@hookform/resolvers`, `zod`.
- Auth/API integration: `@supabase/supabase-js`, `jsonwebtoken`, `bcryptjs`, `cors`, `express`, `serverless-http`, `@netlify/functions`.

**Only used by active services**

- `ws` usage is inside `server/index.js` (websocket bridge).
- `js-cookie` is only referenced in docs; nothing in `src/` consumes it → candidate for removal unless future roadmap requires it.

**Scoped to internal packages (`packages/ui-kit`, `packages/privacy-sdk`, `packages/shared-types`)**

- `@radix-ui/*`, `class-variance-authority`, `clsx`, `framer-motion`, `tailwind-merge`, `crypto` (from npm) are used exclusively inside those packages. If you retire the packages, you can drop these dependencies from the root as well.

**Currently unreferenced in repo sources**

- `date-fns`, `recharts`, `zustand` have no import hits outside `package.json` / lockfiles. Removing them will not affect the running app. Re-add if you introduce analytics widgets later.

## Additional package.json files

| Package           | Path                                 | Scripts                              | Status                                                                                      |
| ----------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| API server (CJS)  | `server/package.json`                | `start`, `dev` (nodemon)             | Active for local dev; shares deps with root but maintain separately because it is CommonJS. |
| Auth gateway (TS) | `services/auth-gateway/package.json` | `dev`, `build`, `start`, `lint`      | Feature-complete auth service; decide whether to migrate or decommission before pruning.    |
| UI kit            | `packages/ui-kit/package.json`       | `build`, `dev`, `lint`, `clean`      | Component library; not imported by the SPA today.                                           |
| Privacy SDK       | `packages/privacy-sdk/package.json`  | `build`, `dev`, `lint`, `type-check` | Supports data masking; unused by SPA. Relies on `@lanonasis/shared-types`.                  |
| Shared types      | `packages/shared-types/package.json` | `build`, `dev`, `lint`, `type-check` | Provides DTOs; only consumed by `privacy-sdk`.                                              |

## Candidate cleanup focus areas

- Documentation duplicates: top-level `*_SUMMARY.md`, `AUTH-*.md`, and the dense guides under `services/auth-gateway/` cover the same rollout multiple times. Decide on one canonical home (likely `docs/auth/`) and archive or delete the rest.
- Legacy routers: `multi-platform-router.js`, `ai-service-router.js`, `unified-router.cjs/js`, and `vendor-auth-middleware.js` duplicate logic found in the Netlify/Auth gateway stacks. Confirm none are referenced before removal.
- Archived bundles: directories under `archived/`, unreferenced assets in `MCP BUILD/`, and zipped Netlify bundles inflate repo size without affecting runtime.
- Internal packages: if the mono-repo no longer publishes `packages/ui-kit`, `packages/privacy-sdk`, or `packages/shared-types`, they can be removed together with the grouped dependencies above.

Keep this sheet updated after each cleanup step so the dependency surface stays aligned with the code you actively run.
