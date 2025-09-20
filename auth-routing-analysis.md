# 🔐 Authentication Chain Analysis & Fix Plan

## 🚨 Critical Failure Points Identified

### Issue #1: Double Slash in CLI Auth URL ❌
**Problem**: CLI generates `mcp.lanonasis.com//auth/cli-login`
**Root Cause**: URL concatenation without normalization
**Location**: `apps/lanonasis-maas/cli/src/commands/auth.ts:162`
```typescript
const authUrl = `${config.getDiscoveredApiUrl()}/auth/cli-login`;
```
**Impact**: 404 errors, routing failures

### Issue #2: Service Discovery Returns Wrong URL 🔍
**Problem**: `auth_base` from `.well-known/onasis.json` may end with slash
**Location**: Service discovery endpoint returns inconsistent URL format
**Impact**: URL malformation when paths are appended

### Issue #3: MCP Server Connection Refused 🚫
**Problem**: `mcp.lanonasis.com` is not responding (connection refused)
**Root Cause**: VPS server down or Vercel deployment not active
**Impact**: CLI auth completely broken

### Issue #4: Redirect URI Mismatches 🔄
**Problem**: Supabase allowed redirect URLs don't match all callback endpoints
**Configured Redirects**:
- `dashboard.lanonasis.com/auth/callback` ✅
- `api.lanonasis.com/auth/callback` ✅
- `localhost:8989/callback` (CLI) ❓
- `mcp.lanonasis.com/auth/callback` ❓

### Issue #5: Session Storage Not Persistent 💾
**Problem**: CLI auth uses `Map()` for sessions
**Location**: `apps/onasis-core/netlify/functions/cli-auth.js:19`
```javascript
const authSessions = new Map();
```
**Impact**: Sessions lost between function invocations

## 📊 Authentication Flow Matrix

| User Type | Entry Point | Auth Service | Callback | Status |
|-----------|-------------|--------------|----------|---------|
| **Dashboard Users** | `dashboard.lanonasis.com` | `api.lanonasis.com/auth/login` | `dashboard.lanonasis.com/auth/callback` | ⚠️ Needs deployment |
| **CLI Users (OAuth)** | CLI command | `mcp.lanonasis.com/auth/cli-login` | `localhost:8989/callback` | ❌ Connection refused |
| **CLI Users (API Key)** | CLI command | Direct Supabase RPC | N/A | ✅ Working |
| **REST API Users** | Direct API | Bearer token auth | N/A | ✅ Working |
| **IDE Extension Users** | MCP protocol | `mcp.lanonasis.com/mcp` | N/A | ❌ Server down |
| **Remote MCP Users** | VPS server | `mcp.lanonasis.com/oauth/authorize` | Custom callback | ❌ Server down |

## 🎯 Consolidated Auth Architecture (Target State)

```
                    ┌─────────────────────────┐
                    │  api.lanonasis.com      │
                    │  (Central Auth Gateway) │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
    /auth/login          /auth/cli-login         /auth/oauth
    (Dashboard)              (CLI)              (MCP/Extensions)
        │                       │                       │
        ▼                       ▼                       ▼
   auth.html            cli-auth.js             oauth-handler.js
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                        ┌───────▼────────┐
                        │   Supabase     │
                        │  Auth Service  │
                        └────────────────┘
```

## 🔧 Immediate Fixes Required

### Fix #1: URL Normalization in CLI
```typescript
// apps/lanonasis-maas/cli/src/commands/auth.ts
const baseUrl = config.getDiscoveredApiUrl().replace(/\/$/, ''); // Remove trailing slash
const authUrl = `${baseUrl}/auth/cli-login`;
```

### Fix #2: Update Service Discovery
```javascript
// apps/lanonasis-maas/src/server.ts
app.get('/.well-known/onasis.json', (req, res) => {
  const manifest = {
    auth_base: 'https://api.lanonasis.com', // No trailing slash
    memory_base: 'https://api.lanonasis.com/api/v1/memories',
    mcp_ws_base: 'wss://mcp.lanonasis.com',
    // ...
  };
});
```

### Fix #3: Deploy to api.lanonasis.com
1. Use `vercel.json` (already configured)
2. Deploy: `vercel --prod`
3. Verify auth endpoints are accessible

### Fix #4: Add All Redirect URIs to Supabase
```sql
-- Run in Supabase SQL Editor
UPDATE auth.redirect_urls 
SET urls = array_append(urls, 'http://localhost:8989/callback')
WHERE project_id = 'mxtsdgkwzjzlttpotole';
```

### Fix #5: Implement Redis Session Storage
```javascript
// apps/onasis-core/netlify/functions/cli-auth.js
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Replace Map with Redis
await redis.setex(`auth:${state}`, 600, JSON.stringify(session));
```

## 📋 Debugging Checklist

- [ ] Check service discovery endpoint: `curl https://api.lanonasis.com/.well-known/onasis.json`
- [ ] Verify auth_base has no trailing slash
- [ ] Test CLI auth URL generation (should not have double slash)
- [ ] Confirm Vercel deployment is live at api.lanonasis.com
- [ ] Check Supabase redirect URLs include all callbacks
- [ ] Monitor Vercel logs for auth errors: `vercel logs api.lanonasis.com --follow`
- [ ] Test each user type authentication flow end-to-end

## 🚀 Deployment Commands

```bash
# Deploy API Gateway (auth service)
cd apps/onasis-core
vercel --prod

# Deploy MCP Server (if using separate deployment)
vercel --prod -c vercel-mcp.json

# Check deployment status
vercel ls

# Monitor logs
vercel logs api.lanonasis.com --follow
```

## ⚡ Quick Test Commands

```bash
# Test API Gateway health
curl https://api.lanonasis.com/health

# Test auth endpoint
curl https://api.lanonasis.com/auth/login

# Test service discovery
curl https://api.lanonasis.com/.well-known/onasis.json

# Test CLI auth (after fixes)
onasis auth login
```
