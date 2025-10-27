# 🚀 Auth Gateway Deployment Checklist

**Date:** October 27, 2025  
**Status:** Ready for deployment with CLI alignment

---

## ✅ Pre-Deployment Verification

### 1. **Environment Variables (.env)**
- [x] DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
- [x] SUPABASE_URL=https://<project-ref>.supabase.co
- [x] JWT_SECRET=REDACTED_JWT_SECRET
- [x] PORT set to 4000
- [x] NODE_ENV set to production
- [x] CORS_ORIGIN includes all required domains

### 2. **Database Schema**
- [x] FK dependency moved to `auth_gateway.user_accounts`
- [x] Neon branch active with compute
- [x] Migration `001_init_auth_schema.sql` applied
- [x] `auth_gateway.user_accounts` table ready
- [x] Sessions table references local user registry

### 3. **New Features**
- [x] CLI-friendly `/v1/auth/verify-token` endpoint added
- [x] Accepts token in request body (not just auth header)
- [x] Returns format compatible with CLI expectations
- [x] No authentication required for verification

---

## 🔄 Deployment Steps

### Step 1: Build the Service

```bash
cd apps/onasis-core/services/auth-gateway

# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify build success
ls -la dist/
```

### Step 2: Start the Service

```bash
# Start in development (with auto-reload)
npm run dev

# OR start in production
npm start
```

### Step 3: Verify Health

```bash
# Check service is running
curl http://localhost:4000/health

# Expected response:
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-10-27T..."
}
```

---

## 🧪 Testing Integration with CLI

### Test 1: CLI Login Flow

```bash
# From CLI directory
cd apps/lanonasis-maas/cli

# Test login (should work with auth-gateway running)
onasis auth login

# Choose username/password or browser auth
# Token should be verified against auth-gateway
```

### Test 2: Token Verification Endpoint

```bash
# Get a valid token from CLI
TOKEN=$(cat ~/.maas/config.json | jq -r '.token')

# Test verification endpoint
curl -X POST http://localhost:4000/v1/auth/verify-token \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}"

# Expected response:
{
  "valid": true,
  "type": "jwt",
  "user": {
    "id": "...",
    "email": "...",
    "role": "..."
  },
  "expires_at": "..."
}
```

### Test 3: User Account Creation

```bash
# After successful login, check user was added to registry
psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

# Should show at least one user record
```

### Test 4: Session Creation

```bash
# Check session was created
psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

# Should show active CLI session
```

---

## 🌐 Production Deployment

### Option 1: Deploy to VPS (Recommended)

```bash
# SSH to your server
ssh user@your-server.com

# Clone/pull latest code
cd /opt/lanonasis
git pull origin main

# Navigate to auth-gateway
cd apps/onasis-core/services/auth-gateway

# Install dependencies
npm install --production

# Build
npm run build

# Start with PM2
pm2 start npm --name "auth-gateway" -- start
pm2 save

# Configure nginx reverse proxy
# Point auth.lanonasis.com to localhost:4000
```

### Option 2: Deploy to Netlify Functions

The auth-gateway is a standalone Express server, so it can't deploy directly to Netlify Functions. Instead:

1. Keep Netlify functions for lightweight endpoints (`/auth/verify`, `/auth/cli-login`)
2. Deploy auth-gateway to VPS for full OAuth flows
3. Both can coexist and serve different purposes

---

## 🔀 Routing Strategy

### Netlify Functions (Lightweight)
- `https://api.lanonasis.com/auth/verify` → Token verification
- `https://mcp.lanonasis.com/auth/cli-login` → Browser auth page

### Auth Gateway (Full Service)
- `https://auth.lanonasis.com/v1/auth/login` → OAuth login
- `https://auth.lanonasis.com/v1/auth/verify-token` → CLI verification
- `https://auth.lanonasis.com/v1/auth/session` → Session management
- `https://auth.lanonasis.com/v1/auth/logout` → Logout

### CLI Priority
The CLI tries endpoints in order:
1. Local auth-gateway (http://localhost:4000) - Development
2. Production auth-gateway (https://auth.lanonasis.com) - Primary
3. Netlify function (https://api.lanonasis.com) - Fallback

---

## 📊 Post-Deployment Monitoring

### 1. Health Check
```bash
# Production
curl https://auth.lanonasis.com/health

# Should return 200 OK
```

### 2. Database Connection
```bash
# Check Neon connection
psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
```

### 3. Check Logs
```bash
# If using PM2
pm2 logs auth-gateway

# Should show:
# - Server started on port 4000
# - Database connected
# - No errors
```

### 4. Test CLI Integration
```bash
# Test full auth flow
onasis auth logout
onasis auth login
onasis status

# Should show: "Authenticated: Yes"
```

---

## 🐛 Troubleshooting

### Issue: "Connection refused"
**Cause:** Service not running or wrong port  
**Fix:**
```bash
# Check if running
pm2 status auth-gateway

# Restart if needed
pm2 restart auth-gateway
```

### Issue: "Database connection failed"
**Cause:** Invalid DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
**Fix:**
```bash
# Test connection
psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

# Check Neon status
neonctl branches list
```

### Issue: "Token verification fails"
**Cause:** JWT_SECRET=REDACTED_JWT_SECRET
**Fix:**
```bash
# Verify JWT_SECRET=REDACTED_JWT_SECRET
echo $JWT_SECRET=REDACTED_JWT_SECRET

# Check token format
echo $TOKEN | cut -d'.' -f1 | base64 -d
```

### Issue: "CORS errors"
**Cause:** CORS_ORIGIN doesn't include requesting domain  
**Fix:**
```bash
# Update .env
CORS_ORIGIN="http://localhost:5173,https://dashboard.lanonasis.com,https://mcp.lanonasis.com"

# Restart service
pm2 restart auth-gateway
```

---

## ✅ Success Criteria

All must pass before considering deployment complete:

- [ ] Service starts without errors
- [ ] `/health` endpoint returns 200
- [ ] Database queries work
- [ ] CLI login succeeds
- [ ] Token verification works
- [ ] User account created in `auth_gateway.user_accounts`
- [ ] Session created in `auth_gateway.sessions`
- [ ] No FK errors referencing `auth.users`
- [ ] Production endpoint accessible
- [ ] Logs show no errors

---

## 📝 Next Steps After Deployment

1. **Update DNS**: Point `auth.lanonasis.com` to auth-gateway server
2. **Configure SSL**: Set up HTTPS with Let's Encrypt
3. **Monitor Logs**: Watch for any errors or unusual activity
4. **Test CLI**: Have users test the new auth flow
5. **Update Docs**: Document the new verification endpoint

---

## 🔐 Security Checklist

- [ ] JWT_SECRET=REDACTED_JWT_SECRET
- [ ] Environment variables not committed to git
- [ ] Database credentials secure
- [ ] HTTPS enabled in production
- [ ] Rate limiting active
- [ ] CORS properly configured
- [ ] Supabase service key protected
- [ ] Admin endpoints require authentication

---

## 📚 Related Documentation

- **Architecture**: `AUTH-SYSTEM-FINDINGS-SUMMARY.md`
- **Current Status**: `CURRENT-STATUS.md`
- **API Reference**: `QUICK-REFERENCE.md`
- **App Onboarding**: `APP-ONBOARDING-GUIDE.md`
- **CLI Auth Fix**: `../../lanonasis-maas/cli/AUTH-FIX-COMPLETE.md`

---

**Deployment Status:** 🟡 Ready - Awaiting execution  
**Estimated Time:** 10-15 minutes  
**Risk Level:** Low (can rollback to Netlify functions)
