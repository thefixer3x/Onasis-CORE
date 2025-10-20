# Auth Gateway

Centralized authentication gateway for the Onasis-CORE ecosystem. Provides unified authentication for web, MCP, CLI, and API clients with Neon PostgreSQL backend.

## Overview

This service centralizes all authentication logic across:
- **Web Applications** - Dashboard, admin panels
- **MCP Clients** - Claude Desktop integration
- **CLI Tools** - Command-line authentication
- **API Clients** - Third-party integrations

### Architecture

```
Clients (Web/MCP/CLI/API)
    ↓
Auth Gateway (Express.js, Port 4000)
    ↓
Neon PostgreSQL (auth_gateway schema)
```

### Database

- **Neon Project**: `the-fixer-initiative` (super-night-54410645)
- **Region**: aws-us-east-1
- **Schema**: `auth_gateway`
- **Tables**: sessions, api_clients, auth_codes, audit_log

## Features

- ✅ Password-based authentication
- ✅ JWT token generation and verification
- ✅ Session management with platform isolation
- ✅ MCP-specific auth endpoints
- ✅ CLI authentication
- ✅ Audit logging
- ✅ Rate limiting
- ✅ RLS-enabled database security

## Endpoints

### Auth Endpoints (`/v1/auth`)

- `POST /v1/auth/login` - Password login
- `POST /v1/auth/logout` - Logout and revoke session
- `GET /v1/auth/session` - Get current session
- `POST /v1/auth/verify` - Verify token
- `GET /v1/auth/sessions` - List user sessions

### MCP Endpoints (`/mcp`)

- `POST /mcp/auth` - MCP client authentication
- `GET /mcp/health` - MCP health check

### CLI Endpoints (`/auth`)

- `POST /auth/cli-login` - CLI tool authentication

### System Endpoints

- `GET /health` - Service health check

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Neon credentials

# Apply database migration
psql "$DATABASE_URL" -f migrations/001_init_auth_schema.sql

# Run development server
npm run dev
```

Server runs on: http://localhost:4000

### Testing

```bash
# Health check
curl http://localhost:4000/health

# Login
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass","project_scope":"web"}'

# Verify token
curl -X POST http://localhost:4000/v1/auth/verify \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy to Hostinger VPS

```bash
# Build and deploy
./deploy.sh deploy

# Configure Nginx
./deploy.sh nginx

# Setup SSL
./deploy.sh ssl
```

## Project Structure

```
services/auth-gateway/
├── src/
│   ├── index.ts              # Express server entry point
│   ├── controllers/          # Route handlers
│   │   ├── auth.controller.ts
│   │   └── mcp.controller.ts
│   ├── routes/               # Route definitions
│   │   ├── auth.routes.ts
│   │   ├── mcp.routes.ts
│   │   └── cli.routes.ts
│   ├── services/             # Business logic
│   │   ├── session.service.ts
│   │   └── audit.service.ts
│   ├── middleware/           # Express middleware
│   │   └── auth.ts
│   └── utils/                # Utilities
│       └── jwt.ts
├── db/
│   └── client.ts             # Neon DB + Supabase clients
├── config/
│   └── env.ts                # Environment config (Zod validated)
├── migrations/
│   └── 001_init_auth_schema.sql
├── tests/                    # Test files
├── logs/                     # Application logs
├── Dockerfile                # Docker image
├── docker-compose.yml        # Docker Compose config
├── ecosystem.config.js       # PM2 config
├── nginx.conf                # Nginx reverse proxy config
├── deploy.sh                 # Deployment script
├── DEPLOYMENT.md             # Deployment guide
└── README.md                 # This file
```

## Configuration

### Required Environment Variables

```bash
# Neon Database
DATABASE_URL="postgresql://service_role:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/neondb"

# Supabase (for auth services)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-key"

# JWT
JWT_SECRET="your-secret-32-chars-minimum"
JWT_EXPIRY="7d"

# Server
PORT=4000
NODE_ENV="production"
CORS_ORIGIN="https://dashboard.lanonasis.com,https://lanonasis.com"
```

See [.env.example](.env.example) for all configuration options.

## Documentation

- [Deployment Guide](DEPLOYMENT.md) - Complete deployment instructions
- [Integration Template](../../.devops/NEON-DB-AUTH-INTEGRATION-TEMPLATE.md) - Neon DB integration
- [Auth Ecosystem](../../docs/auth/AUTH_ECOSYSTEM_ENABLEMENT.md) - Ecosystem-wide auth

---

**Version**: 1.0.0
**Last Updated**: 2025-10-20
**Status**: Production Ready
