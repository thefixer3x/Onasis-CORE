# LanOnasis API Routing Architecture

## Overview

The LanOnasis platform uses a multi-tier routing architecture:

```
Client Request
      ↓
┌─────────────────────────┐
│   api.lanonasis.com     │  (Netlify CDN)
│   (_redirects file)     │
└─────────────────────────┘
           ↓
    ┌──────┴──────┐
    ↓             ↓
┌────────┐  ┌──────────┐  ┌──────────────┐
│Supabase│  │Netlify   │  │VPS Services  │
│Edge Fn │  │Functions │  │(Auth Gateway)│
└────────┘  └──────────┘  └──────────────┘
```

## Routing Priority

Netlify's `_redirects` file processes rules in order. The **first matching rule wins**.

### Critical: Specific Routes Before Wildcards

```
# CORRECT ORDER:
/api/v1/auth/status → Supabase Edge Function (SPECIFIC)
/api/v1/auth/*      → VPS Auth Gateway (WILDCARD)

# Request to /api/v1/auth/status matches line 1 first
```

---

## Route Categories

### 1. Memory API → Supabase Edge Functions

| Route | Edge Function | Priority |
|-------|---------------|----------|
| `/api/v1/memory/search` | `memory-search` | Specific |
| `/api/v1/memory/stats` | `memory-stats` | Specific |
| `/api/v1/memory/list` | `memory-list` | Specific |
| `/api/v1/memory/bulk/delete` | `memory-bulk-delete` | Specific |
| `/api/v1/memory/health` | `system-health` | Specific |
| `/api/v1/memory/update` | `memory-update` | Specific |
| `/api/v1/memory/delete` | `memory-delete` | Specific |
| `/api/v1/memory/:id` | `memory-get` | Parameterized |
| `/api/v1/memory` | `memory-create` | Exact |
| `/api/v1/memory/*` | `maas-api` (Netlify) | **Fallback** |

### 2. User API Keys → Supabase Edge Functions

| Route | Edge Function | Purpose |
|-------|---------------|---------|
| `/api/v1/keys` | `api-key-create` | Create new key |
| `/api/v1/keys/list` | `api-key-list` | List user's keys |
| `/api/v1/keys/rotate` | `api-key-rotate` | Rotate key value |
| `/api/v1/keys/revoke` | `api-key-revoke` | Soft delete |
| `/api/v1/keys/delete` | `api-key-delete` | Hard delete |

### 3. Vendor API Keys → Netlify Function

| Route | Netlify Function | Purpose |
|-------|------------------|---------|
| `/v1/keys/vendors/*` | `key-manager` | Third-party keys (OpenAI, etc.) |

**Note:** User keys (`/api/v1/keys/*`) and vendor keys (`/v1/keys/*`) are different systems!

### 4. Auth Routes → Mixed

| Route | Destination | Priority |
|-------|-------------|----------|
| `/api/v1/auth/status` | Supabase `auth-status` | Specific (first) |
| `/api/v1/auth/*` | VPS auth gateway | Wildcard (fallback) |
| `/v1/auth/*` | VPS auth gateway | Wildcard |

### 5. System Routes → Various

| Route | Destination | Purpose |
|-------|-------------|---------|
| `/api/v1/organization` | Supabase `organization-info` | Org details |
| `/api/v1/projects/*` | Supabase Edge Functions | Project management |
| `/api/v1/config/*` | Supabase Edge Functions | Configuration |
| `/api/v1/intelligence/*` | Supabase Edge Functions | AI operations |
| `/health` | Netlify `health.js` | System health |
| `/api/v1/health` | Netlify `health.js` | API health |

---

## Potential Conflict Points

### ✅ Resolved: auth/status vs auth/*

```
Line 74:  /api/v1/auth/status → Supabase (WINS - comes first)
Line 132: /api/v1/auth/*      → VPS (fallback for other auth routes)
```

### ✅ Resolved: User Keys vs Vendor Keys

```
/api/v1/keys/*  → Supabase Edge Functions (user API keys)
/v1/keys/*      → Netlify key-manager (vendor API keys)
```

These are completely different paths - no conflict.

### ✅ Resolved: Memory Routes

```
Specific routes → Supabase Edge Functions (handled first)
Wildcard /*     → Netlify maas-api (fallback for unmatched)
```

---

## Function Inventory

### Supabase Edge Functions (20)

| Category | Count | Functions |
|----------|-------|-----------|
| Memory | 9 | search, create, get, update, delete, list, stats, bulk-delete, health |
| API Keys | 5 | create, list, rotate, revoke, delete |
| System | 4 | auth-status, organization-info, project-create, project-list |
| Config | 2 | get, set |

### Netlify Functions (13)

| Function | Purpose | Route |
|----------|---------|-------|
| `api-gateway` | Catch-all router | `/api/*` |
| `maas-api` | Legacy memory API | Fallback for `/api/v1/memory/*` |
| `key-manager` | Vendor key storage | `/v1/keys/*` |
| `mcp-message` | MCP messaging | `/message` |
| `mcp-sse` | Server-Sent Events | `/sse` |
| `health` | Health check | `/health` |
| `auth-api` | Auth operations | (via VPS proxy) |
| `auth-health` | Auth health | `/auth/health` |
| `auth-verify` | Token verification | (internal) |
| `cli-auth` | CLI authentication | (via VPS) |
| `dashboard-callback` | OAuth callback | `/auth/dashboard/callback` |
| `apply-migration` | DB migrations | `/migrate` |
| `mcp` | MCP core | `/api/mcp` |

### VPS Services

| Service | Port | Routes |
|---------|------|--------|
| Auth Gateway | 4000 | `/api/v1/auth/*`, `/v1/auth/*` |
| MCP WebSocket | 3002 | `/ws`, `/api/v1/ws` |
| MCP Events | 3003 | `/api/v1/events` |

---

## Testing Routing

```bash
# Test Supabase Edge Function (direct)
curl https://lanonasis.supabase.co/functions/v1/auth-status \
  -H "X-API-Key: your_key"

# Test via Netlify routing
curl https://api.lanonasis.com/api/v1/auth/status \
  -H "X-API-Key: your_key"

# Both should return the same result
```

---

## Debugging Routing Issues

1. **Check _redirects order** - First match wins
2. **Use `200!` suffix** - Forces the redirect (no fallback)
3. **Test direct Supabase URL** - Bypass Netlify routing
4. **Check Netlify deploy logs** - See which function was invoked

---

**Last Updated:** 2025-12-27
**Total Routes:** 50+ configured redirects
