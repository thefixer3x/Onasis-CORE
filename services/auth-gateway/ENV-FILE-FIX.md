# 🚨 VPS .env File Error Fix

## Problem
Your `.env` file has a formatting issue where lines are merged:
```
LOG_FORMAT="json"COOKIE_DOMAIN=.lanonasis.com
```

This should be two separate lines:
```
LOG_FORMAT="json"
COOKIE_DOMAIN=.lanonasis.com
```

## Quick Fix on VPS

### Option 1: Automated Fix
```bash
cd /opt/lanonasis/onasis-core/services/auth-gateway
chmod +x fix-env.sh
./fix-env.sh
```

### Option 2: Manual Fix

1. **Edit the .env file:**
```bash
nano .env
```

2. **Find this line:**
```
LOG_FORMAT="json"COOKIE_DOMAIN=.lanonasis.com
```

3. **Replace it with (two separate lines):**
```
LOG_FORMAT=json
COOKIE_DOMAIN=.lanonasis.com
```

**Note:** Remove the quotes around "json" - it should be just `json`, not `"json"`

4. **Also ensure you have these additional lines:**
```bash
DASHBOARD_URL=https://dashboard.lanonasis.com
AUTH_GATEWAY_URL=https://auth.lanonasis.com
```

5. **Save and exit** (Ctrl+X, then Y, then Enter)

## Complete .env File Should Look Like:

```bash
# Database
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Server
PORT=4000
NODE_ENV=production

# CORS
CORS_ORIGIN=https://dashboard.lanonasis.com,https://api.lanonasis.com,https://mcp.lanonasis.com

# JWT
JWT_SECRET=your-secret-min-32-chars
JWT_EXPIRY=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Cookie & Session (NEW - add these)
COOKIE_DOMAIN=.lanonasis.com
DASHBOARD_URL=https://dashboard.lanonasis.com
AUTH_GATEWAY_URL=https://auth.lanonasis.com
```

## After Fixing

1. **Rebuild:**
```bash
npm run build
```

2. **Restart:**
```bash
pm2 restart auth-gateway
```

3. **Check logs:**
```bash
pm2 logs auth-gateway --lines 20
```

4. **Test:**
```bash
curl https://auth.lanonasis.com/health
```

## Common .env Mistakes

❌ **Wrong:** `LOG_FORMAT="json"`  
✅ **Right:** `LOG_FORMAT=json`

❌ **Wrong:** Values with spaces without quotes  
✅ **Right:** `CORS_ORIGIN="url1,url2,url3"` or `CORS_ORIGIN=url1,url2,url3`

❌ **Wrong:** Missing newline between variables  
✅ **Right:** Each variable on its own line

❌ **Wrong:** Comments on same line as value  
✅ **Right:** Comments on separate lines
