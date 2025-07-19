# Supabase-client Module
This is the `packages/supabase-client` directory.
# Supabase Client Module

This package provides the centralized Supabase client configuration for all Lan Onasis apps within the monorepo.

## Current Structure & Integration Goals

We aim to align this module with the previously defined Supabase schema and architecture, including the `control_room` schema and isolated schemas per application.

### Referenced Schemas (from supabase/config.toml)
- `control_room` (core registry, audit logs, access control)
- `app_vortexcore`
- `app_seftec`
- `app_saas`
- `app_apple`

### Supabase Configuration Highlights:
- Centralized `config.toml` includes:
  - `site_url`: https://seftechub.supabase.co
  - Google, Apple, GitHub, and Azure OAuth
  - Expanded schema access with `extra_search_path`

### Target Implementation
- Each app will authenticate through this shared client.
- Client functions will auto-respect per-app schema separation.
- Audit logs and metrics routed to `control_room`.

### Repository Planning
This aligns with the proposed `control-room` repo structure:
```
control-room/
├── README.md
├── frontend/
│   └── src/app, components, lib
├── shared/client-sdk
└── supabase/
    ├── config.toml
    ├── functions/
    ├── migrations/
    └── .gitignore
```

> For advanced integration, we will add Supabase Edge Functions and hook automation using GitHub Discussions and Project Boards for coordination.


## Repo Integration Plan

We will begin integration using the following repositories:

- https://github.com/thefixer3x/LanOnasisIndex → to be added under `apps/lanonasis-index`
- https://github.com/thefixer3x/vortexcore → to be integrated as `apps/vortexcore`
- https://github.com/thefixer3x/vortexcore-saas → components or services to be moved into `packages/` or nested in `apps/vortexcore`

All projects will be migrated from npm to Bun.

Migration Steps:
1. Remove `package-lock.json` and `node_modules`
2. Run `bun init` in each app/package
3. Update scripts and dependencies in `package.json` to use Bun
4. Commit `bun.lockb` and updated `package.json` to monorepo

Turborepo will handle workspace relationships and ensure build pipelines remain consistent across Bun packages.