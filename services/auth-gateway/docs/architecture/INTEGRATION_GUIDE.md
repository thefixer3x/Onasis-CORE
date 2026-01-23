# Unified Router Integration into Auth-Gateway

> **Status:** Files created, pending integration into index.ts  
> **Version:** 0.3.0  
> **Date:** January 2026

---

## What Was Created

| File | Location | Purpose |
|------|----------|---------|
| `router.types.ts` | `src/types/` | TypeScript interfaces for router |
| `services.config.ts` | `config/` | Service registry (Supabase function mappings) |
| `router.service.ts` | `src/services/` | Core routing logic to Supabase |
| `privacy.ts` | `src/middleware/` | Privacy protection middleware |
| `services.routes.ts` | `src/routes/` | Express routes for service routing |

---

## Integration Steps

### Step 1: Apply index.ts Changes

Open `src/index.ts` and make these changes:

**A. Add import (line ~25, after device routes import):**
```typescript
import servicesRoutes from './routes/services.routes.js'
```

**B. Mount routes (line ~175, after device routes mount):**
```typescript
// ============================================================================
// UNIFIED SERVICE ROUTER (ported from unified-router.cjs)
// Routes authenticated requests to Supabase edge functions
// ============================================================================
app.use(servicesRoutes)
```

**C. Add startup logs (in the startup section):**
```typescript
console.log(`🔀 Service Router endpoints:`)
console.log(`   - GET  /services (discovery)`)
console.log(`   - ALL  /api/v1/services/:name/* (authenticated routing)`)
console.log(`   - POST /api/v1/chat/completions (legacy)`)
console.log(`   - POST /webhook/:service`)
```

### Step 2: Build & Test

```bash
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/services/auth-gateway

# Build TypeScript
npm run build

# Test locally
npm run dev

# Test endpoints
curl http://localhost:4000/services
curl http://localhost:4000/health
```

### Step 3: Verify Integration

```bash
# Service discovery should return list of services
curl http://localhost:4000/services | jq

# Expected output:
# {
#   "available_services": [
#     { "name": "ai-chat", "endpoint": "/api/v1/services/ai-chat", ... },
#     { "name": "memories", "endpoint": "/api/v1/services/memories", ... },
#     ...
#   ],
#   "total_count": 10,
#   "version": "1.0.0"
# }
```

---

## New Endpoints Added

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/services` | GET | No | Service discovery |
| `/api/v1/services/:name/*` | ALL | Yes* | Dynamic service routing |
| `/api/v1/chat/completions` | POST | Yes | Legacy OpenAI compatibility |
| `/webhook/:service` | POST | No | Webhook forwarding |

*Auth requirement depends on service configuration in `services.config.ts`

---

## Architecture After Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AUTH-GATEWAY v0.3.0                                      │
│                          Port 4000                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EXISTING (unchanged)                                                        │
│  ├── /oauth/*              → PKCE, Device Code, token exchange              │
│  ├── /v1/auth/*            → Login, logout, OTP, sessions                   │
│  ├── /api/v1/auth/*        → API keys management                            │
│  ├── /web/*                → Browser auth forms                             │
│  ├── /.well-known/*        → OAuth discovery (RFC 8414)                     │
│  └── /admin/*              → Admin bypass, status                           │
│                                                                              │
│  NEW (from unified-router.cjs)                                               │
│  ├── /services                  → Service discovery                         │
│  ├── /api/v1/services/:name/*   → Authenticated Supabase routing           │
│  │       ↓ privacyProtection()                                              │
│  │       ↓ requireAuth() (if service.requiresAuth)                          │
│  │       ↓ requireScopes() (if service.scopes defined)                      │
│  │       ↓ routeToSupabase()                                                │
│  ├── /api/v1/chat/completions   → Legacy AI chat                            │
│  └── /webhook/:service          → Webhook forwarding                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                         Supabase Edge Functions
                    /functions/v1/ai-chat
                    /functions/v1/memories
                    /functions/v1/generate-embedding
                    ... etc
```

---

## Adding New Services

Edit `config/services.config.ts`:

```typescript
export const SERVICE_ROUTES: ServiceRegistry = {
  // ... existing services ...

  // Add your new service:
  'my-new-service': {
    path: '/functions/v1/my-new-function',  // Supabase function path
    rateLimitTier: 'general',                // general | ai | media | webhook
    description: 'Description for discovery',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 30000,
    scopes: ['my-service:*'],                // Optional OAuth scopes
  },
}
```

---

## Cleanup (Optional)

Once integration is verified, you can archive the standalone router:

```bash
# Move to archive
mv /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/unified-router.cjs \
   /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/_archive/unified-router.cjs.bak
```

---

## Troubleshooting

### Build Errors

If you get import errors, ensure the `.js` extensions are in imports:
```typescript
// Correct (ESM)
import { routeToSupabase } from '../services/router.service.js'

// Wrong
import { routeToSupabase } from '../services/router.service'
```

### Supabase Connection Errors

Verify environment variables:
```bash
echo $SUPABASE_URL=https://<project-ref>.supabase.co
echo $SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
```

### Rate Limiting in Tests

Rate limiting is skipped when `NODE_ENV=test`.

---

## Files Reference

```
auth-gateway/
├── config/
│   ├── env.ts                    # Existing
│   ├── services.config.ts        # NEW - Service registry
│   └── ...
├── src/
│   ├── index.ts                  # MODIFY - Mount routes
│   ├── middleware/
│   │   ├── auth.ts               # Existing
│   │   ├── privacy.ts            # NEW - Privacy protection
│   │   └── ...
│   ├── routes/
│   │   ├── services.routes.ts    # NEW - Service endpoints
│   │   └── ...
│   ├── services/
│   │   ├── router.service.ts     # NEW - Supabase routing
│   │   └── ...
│   └── types/
│       └── router.types.ts       # NEW - TypeScript types
└── ...
```
