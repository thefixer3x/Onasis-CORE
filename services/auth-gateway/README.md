# Auth Gateway

This folder contains the self-contained authentication gateway service for LanOnasis. It now runs against the dedicated auth-gateway Supabase/Postgres database, while the main application data remains in the main Supabase database.

## Goals

- Centralise all authentication logic for dashboards, CLI, MCP, and API clients.
- Operate against the auth-gateway database using the `auth_gateway` schema and related security tables.
- Provide an extensible scaffold for additional projects by keeping all code within `services/auth-gateway/`.

## Contents

- `package.json` – Template dependencies and scripts
- `tsconfig.json` – TypeScript configuration
- `.env.example` – Required environment variables (sanitised placeholders)
- `db/` – Database connection helpers for the auth-gateway DB plus Supabase admin operations
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

## Database Migrations

The auth-gateway now uses a ledger-aware migration runner backed by
`auth_gateway.schema_migrations`. That keeps deploys idempotent and blocks silent
file drift.

```bash
# show applied, pending, and drifted migrations
npm run db:migrate:status

# apply all pending migrations
npm run db:migrate

# production status/apply (dotenvx + .env.production)
npm run db:migrate:status:prod
npm run db:migrate:prod

# baseline already-applied migrations without executing SQL
node run-migration.mjs --baseline 003_create_api_keys_table.sql,006_api_key_management_service.sql
```
