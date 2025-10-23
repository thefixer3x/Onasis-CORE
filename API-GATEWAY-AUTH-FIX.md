# API Gateway Auth Fix Required
**Date:** October 23, 2025

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
