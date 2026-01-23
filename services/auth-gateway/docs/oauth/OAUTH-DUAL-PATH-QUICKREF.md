# OAuth Dual-Path Quick Reference

## 🎯 What We're Deploying

Support for **both** OAuth URL patterns simultaneously:

```
Pattern 1 (Original):    /oauth/*
Pattern 2 (CLI):         /api/v1/oauth/*
```

Both route to the **same handlers** - no code duplication!

---

## 🚀 Quick Deploy

```bash
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/services/auth-gateway

# Deploy
./deploy-oauth-dual-path.sh

# Test
./test-oauth-endpoints.sh
```

---

## 📍 Endpoints After Deployment

### Authorization Endpoints

✅ `https://api.lanonasis.com/oauth/authorize`  
✅ `https://api.lanonasis.com/api/v1/oauth/authorize`

### Token Endpoints

✅ `https://api.lanonasis.com/oauth/token`  
✅ `https://api.lanonasis.com/api/v1/oauth/token`

### Revoke Endpoints

✅ `https://api.lanonasis.com/oauth/revoke`  
✅ `https://api.lanonasis.com/api/v1/oauth/revoke`

### Introspect Endpoints

✅ `https://api.lanonasis.com/oauth/introspect`  
✅ `https://api.lanonasis.com/api/v1/oauth/introspect`

---

## 🔍 Who Uses Which Pattern?

### Pattern 1: `/oauth/*`

- VSCode Extensions
- Windsurf IDE
- Web Dashboard
- Existing integrations

### Pattern 2: `/api/v1/oauth/*`

- lanonasis-cli
- REST API clients
- New integrations
- SDK implementations

---

## ✅ Expected Test Results

After deployment, running `./test-oauth-endpoints.sh`:

```
✅ GET /oauth/authorize - Status: 200
✅ POST /oauth/token - Status: 400 (endpoint exists)
✅ POST /oauth/revoke - Status: 400 (endpoint exists)
✅ POST /oauth/introspect - Status: 400 (endpoint exists)

✅ GET /api/v1/oauth/authorize - Status: 200
✅ POST /api/v1/oauth/token - Status: 400 (endpoint exists)
✅ POST /api/v1/oauth/revoke - Status: 400 (endpoint exists)
✅ POST /api/v1/oauth/introspect - Status: 400 (endpoint exists)

🎉 ALL TESTS PASSED!
```

---

## 🛠️ Manual Verification

```bash
# Test Pattern 1
curl -I "https://api.lanonasis.com/oauth/authorize?client_id=test"
# Expected: HTTP/2 200

# Test Pattern 2
curl -I "https://api.lanonasis.com/api/v1/oauth/authorize?client_id=lanonasis-cli"
# Expected: HTTP/2 200
```

---

## 🔧 Troubleshooting

### If deployment fails:

```bash
ssh u139558452@69.49.243.218
cd /home/u139558452/domains/api.lanonasis.com/public_html
pm2 logs auth-gateway --lines 50
```

### If tests fail:

```bash
# Check PM2 status
ssh u139558452@69.49.243.218 "pm2 list | grep auth-gateway"

# Restart service
ssh u139558452@69.49.243.218 "cd /home/u139558452/domains/api.lanonasis.com/public_html && pm2 restart auth-gateway"
```

---

## 📊 Architecture

```
Nginx (443)
    ↓
Port 4000 (auth-gateway)
    ├─ /oauth/*         → oauthRoutes (Pattern 1)
    └─ /api/v1/oauth/*  → oauthRoutes (Pattern 2)
           ↓
    Same OAuth Controllers
           ↓
    Neon Database
```

---

## 📚 Full Documentation

- **Complete Guide**: `OAUTH-DUAL-PATH-GUIDE.md`
- **Architecture**: `auth-gateway-oauth2-pkce/PORT_MAPPING_COMPLETE.md`
- **Deployment Script**: `deploy-oauth-dual-path.sh`
- **Test Script**: `test-oauth-endpoints.sh`

---

## ✨ Benefits

✅ **Zero Breaking Changes** - Existing clients keep working  
✅ **CLI Compatible** - lanonasis-cli can now authenticate  
✅ **DRY Code** - Single handler for both patterns  
✅ **Future-Proof** - Easy to add more API versions  
✅ **Zero Downtime** - Deploy without service interruption

---

**Ready to deploy?** Run `./deploy-oauth-dual-path.sh` 🚀
