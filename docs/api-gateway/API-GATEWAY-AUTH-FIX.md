# API Gateway Auth Fix Required
**Date:** October 23, 2025

> **Current-state caution (2026-03-18):**
> This note documents an older auth-routing incident. Use it as background, not
> as the current authority for auth-plane behavior. For the current rollout
> state, refer to:
> - [`../../../../docs/security/auth-centralization-overhaul-plan-2026-03-17.md`](../../../../docs/security/auth-centralization-overhaul-plan-2026-03-17.md)
> - [`../../../../docs/security/auth-identity-envelope.schema.json`](../../../../docs/security/auth-identity-envelope.schema.json)
> - [`../../../../docs/security/auth-introspect-response.schema.json`](../../../../docs/security/auth-introspect-response.schema.json)

## 🔍 PROBLEM IDENTIFIED

`api.lanonasis.com` is served by the "Onasis-CORE API Gateway" (not Netlify). The `/auth/login` endpoint doesn't exist on the API Gateway, causing:

1. Dashboard calls `https://api.lanonasis.com/auth/login`
2. API Gateway returns HTML "Page not found"
3. Dashboard tries to parse HTML as JSON → "string did not match expected pattern"

## 🎯 SOLUTION

### Option 1: Add Auth Route to API Gateway
Update the API Gateway to route `/auth/*` to the auth server on port 3005

### Option 2: Update Nginx Configuration
Add nginx routing to proxy `/auth/*` from `api.lanonasis.com` to the auth server

### Option 3: Update Dashboard Configuration
Change dashboard to call the auth server directly:

```env
VITE_AUTH_BASE_URL=https://auth.lanonasis.com
```

## 📋 IMMEDIATE ACTION NEEDED

1. Check API Gateway configuration
2. Add auth routing to API Gateway or nginx
3. Ensure proper JSON responses for API calls
4. Test dashboard authentication flow

---

**The API Gateway needs to route `/auth/login` to the auth server!**
