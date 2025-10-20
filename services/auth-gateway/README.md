# Auth Gateway (Neon Template)

This folder contains the self-contained authentication gateway template designed to integrate with a Neon-hosted Postgres instance that already mirrors Supabase role semantics.

## Goals

- Centralise all authentication logic for dashboards, CLI, MCP, and API clients.
- Operate against Neon (`super-night-54410645`) using the `auth_gateway` schema.
- Provide an extensible scaffold for additional projects by keeping all code within `services/auth-gateway/`.

## Contents

- `package.json` – Template dependencies and scripts
- `tsconfig.json` – TypeScript configuration
- `.env.example` – Required environment variables (sanitised placeholders)
- `db/` – Database connection helpers for Neon + Supabase admin operations
- `config/` – Runtime configuration loaders and constants
- `src/` – Express server, routes, controllers, and domain logic
- `migrations/` – Database schema for `auth_gateway`
- `tests/` – Placeholder for automated checks

## Getting Started

```bash
cd services/auth-gateway
npm install
cp .env.example .env
npm run dev
```

All future authentication development should be isolated to this folder to keep the root project uncluttered and to enable templated reuse across new initiatives.
