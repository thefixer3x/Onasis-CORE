# Frontend Configuration Fix Required
**Date:** October 23, 2025

## Problem Identified

Dashboard frontend is calling the **wrong authentication endpoint**.

### Current Configuration (BROKEN):
```env
VITE_AUTH_DOMAIN=api.lanonasis.com
VITE_AUTH_BASE_URL=https://api.lanonasis.com
VITE_AUTH_REDIRECT_URI=https://api.lanonasis.com/auth/callback
```

### Required Configuration (CORRECT):
```env
VITE_AUTH_DOMAIN=auth.lanonasis.com
VITE_AUTH_BASE_URL=https://auth.lanonasis.com
VITE_AUTH_ENDPOINT=https://auth.lanonasis.com/v1/auth/login
VITE_AUTH_REDIRECT_URI=https://auth.lanonasis.com/v1/auth/callback
VITE_CENTRAL_AUTH=true
```

## Backend Infrastructure Status ✅

Verified via MCP tools and direct testing:

1. **Neon Database:** ✅ CONNECTED & HEALTHY
   - Project: plain-voice-23407025
   - Version: PostgreSQL 17.5
   - Status: Active and responsive

2. **Auth Gateway:** ✅ RUNNING ON PORT 4000
   - Domain: auth.lanonasis.com
   - Health: {"status":"ok","service":"auth-gateway"}
   - Endpoints: All responding correctly

3. **Nginx:** ✅ CONFIGURED CORRECTLY
   - Proxying auth.lanonasis.com → port 4000
   - SSL certificates valid

## What Needs to Be Done

### Option 1: Update Netlify Environment Variables

If dashboard is deployed on Netlify:

1. Go to Netlify Dashboard
2. Navigate to Site Settings → Environment Variables
3. Update or add:
   ```
   VITE_AUTH_BASE_URL=https://auth.lanonasis.com
   VITE_AUTH_DOMAIN=auth.lanonasis.com
   VITE_CENTRAL_AUTH=true
   ```
4. Trigger a new deployment

### Option 2: Update Local Build Configuration

If building locally:

1. Edit `/opt/lanonasis/onasis-core/.env` (create if doesn't exist)
2. Add the configuration above
3. Rebuild and redeploy:
   ```bash
   cd /opt/lanonasis/onasis-core
   npm run build
   # Then deploy to Netlify or wherever
   ```

### Option 3: Create .env File Now

```bash
cd /opt/lanonasis/onasis-core
cat > .env << 'ENVEOF'
VITE_AUTH_DOMAIN=auth.lanonasis.com
VITE_AUTH_BASE_URL=https://auth.lanonasis.com
VITE_AUTH_ENDPOINT=https://auth.lanonasis.com/v1/auth/login
VITE_AUTH_REDIRECT_URI=https://auth.lanonasis.com/v1/auth/callback
VITE_CENTRAL_AUTH=true
VITE_API_BASE_URL=https://api.lanonasis.com
VITE_ENABLE_OAUTH=true
ENVEOF
```

## Testing After Fix

1. Build/Redeploy dashboard
2. Clear browser cache
3. Visit https://dashboard.lanonasis.com
4. Try to login
5. Should now call: `https://auth.lanonasis.com/v1/auth/login` ✅

## Verification Commands

```bash
# Check what the dashboard will call
grep -r "VITE_AUTH" /opt/lanonasis/onasis-core/dist/

# Test auth endpoint directly
curl https://auth.lanonasis.com/v1/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'

# Check PM2 logs
pm2 logs auth-gateway --lines 20
```

## Summary

**Backend:** ✅ 100% Working  
**Frontend Config:** ❌ Wrong URLs  
**Fix:** Update environment variables to use `auth.lanonasis.com`  
**ETA:** 5 minutes to update + deployment time

---

The backend is solid. This is purely a frontend configuration issue.
