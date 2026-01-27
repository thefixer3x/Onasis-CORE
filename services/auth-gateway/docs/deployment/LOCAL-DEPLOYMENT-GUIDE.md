# Auth Gateway - Local PM2 Deployment Guide

**Purpose**: Safe local testing environment that simulates VPS production deployment  
**Last Updated**: 2025-10-24  
**Status**: ✅ Restart-loop protection enabled

---

## 🎯 Overview

This guide helps you deploy the auth-gateway locally with PM2 using a **single instance** configuration that mirrors the live VPS deployment. It includes safety checks to prevent the restart loops that occurred in production.

### What's Different from Production?

| Feature | Production (VPS) | Local Testing |
|---------|-----------------|---------------|
| Instances | 2 (cluster mode) | 1 (fork mode) |
| Auto-restart | Unlimited | Max 5 in 1 minute |
| Port | 9999 | 4000 |
| Domain | auth.lanonasis.com | localhost |
| SSL | Yes (Nginx) | No |

---

## 🚨 Known Issues (Already Fixed)

Based on [`PM2-STABILITY-FIX.md`](PM2-STABILITY-FIX.md), the following issues were resolved:

1. ✅ **ESM Module Resolution** - Fixed by using `tsx` loader in [`start.js`](start.js:1)
2. ✅ **Import Extensions** - All imports now include `.js` extensions
3. ✅ **TypeScript Compilation** - No build step needed, runs TypeScript directly

These fixes are already in your codebase, so you won't encounter the restart loops that happened before.

---

## 📋 Prerequisites

### Required Software
- ✅ Node.js 18+ (check: `node --version`)
- ✅ npm (check: `npm --version`)
- ✅ PM2 (install: `npm install -g pm2`)
- ✅ curl (for testing)
- ✅ jq (optional, for pretty JSON output)

### Required Configuration
- ✅ `.env` file with valid credentials
- ✅ Neon database connection string
- ✅ Supabase credentials (for user auth)
- ✅ JWT secret (32+ characters)

---

## 🚀 Quick Start (Recommended)

### Step 1: Navigate to Directory
```bash
cd services/auth-gateway
```

### Step 2: Run Safe Startup Script
```bash
chmod +x safe-start.sh
./safe-start.sh
```

This script will:
1. ✅ Run pre-flight validation checks
2. ✅ Check for existing PM2 processes
3. ✅ Start PM2 with local configuration
4. ✅ Wait for service initialization
5. ✅ Perform health checks
6. ✅ Monitor for restart loops (30 seconds)
7. ✅ Display service information

**Expected Output:**
```
╔════════════════════════════════════════════════╗
║   Auth Gateway - Safe PM2 Startup Script      ║
╚════════════════════════════════════════════════╝

▶ Running pre-flight checks...
✓ Pre-flight checks passed
▶ Starting PM2 process with local configuration...
✓ PM2 process started
▶ Waiting for service to initialize (10 seconds)...
▶ Performing health check...
✓ Health check passed!
▶ Monitoring for restart loops (30 seconds)...
✓ No restarts detected - service is stable

╔════════════════════════════════════════════════╗
║           Deployment Successful! ✓             ║
╚════════════════════════════════════════════════╝
```

---

## 🔍 Manual Deployment (Step-by-Step)

If you prefer manual control or need to troubleshoot:

### Step 1: Pre-flight Checks
```bash
node preflight-check.js
```

This validates:
- ✅ Node.js version (18+)
- ✅ Environment variables (.env file)
- ✅ Required dependencies installed
- ✅ Entry point files exist
- ✅ PM2 installation
- ✅ Port 4000 availability

**If checks fail**, fix the reported issues before proceeding.

### Step 2: Install Dependencies (if needed)
```bash
npm install
```

### Step 3: Configure Environment
```bash
# If .env doesn't exist
cp .env.example .env

# Edit with your credentials
nano .env
```

**Critical Variables:**
```bash
postgresql://<user>:<password>@<host>:<port>/<db>
https://<project-ref>.supabase.co
REDACTED_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
REDACTED_JWT_SECRET=REDACTED_JWT_SECRET
PORT=4000
NODE_ENV="development"
```

### Step 4: Start PM2
```bash
pm2 start ecosystem.config.local.js
```

### Step 5: Check Status
```bash
pm2 status
```

Expected output:
```
┌─────┬──────────────────────┬─────────┬─────────┬──────────┬────────┐
│ id  │ name                 │ mode    │ status  │ cpu      │ memory │
├─────┼──────────────────────┼─────────┼─────────┼──────────┼────────┤
│ 0   │ auth-gateway-local   │ fork    │ online  │ 0%       │ 60 MB  │
└─────┴──────────────────────┴─────────┴─────────┴──────────┴────────┘
```

### Step 6: Health Check
```bash
curl http://localhost:4000/health | jq '.'
```

Expected response:
```json
{
  "status": "ok",
  "service": "auth-gateway",
  "database": {
    "healthy": true,
    "timestamp": "2025-10-24T01:00:00.000Z"
  },
  "timestamp": "2025-10-24T01:00:00.000Z"
}
```

### Step 7: Monitor for Stability
```bash
# Watch logs in real-time
pm2 logs auth-gateway-local

# Or check restart count after 1 minute
pm2 status
```

**If restart count increases**, check logs for errors:
```bash
pm2 logs auth-gateway-local --err --lines 50
```

---

## 🧪 Testing Your Deployment

### 1. Health Check
```bash
curl http://localhost:4000/health
```

### 2. Admin Login (Emergency Access)
```bash
curl -X POST http://localhost:4000/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "REDACTED_CHANGE_ME"
  }'
```

Expected: JWT token with admin privileges

### 3. App Registration
```bash
curl -X POST http://localhost:4000/admin/register-app \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "app_id": "app_test_local",
    "app_name": "Local Test App",
    "redirect_uris": ["http://localhost:3000/callback"],
    "metadata": {"environment": "local"}
  }'
```

### 4. List Registered Apps
```bash
curl http://localhost:4000/admin/list-apps \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 5. User Login (Requires Supabase)
```bash
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "project_scope": "web"
  }'
```

---

## 🛠️ PM2 Management Commands

### View Logs
```bash
# Real-time logs
pm2 logs auth-gateway-local

# Last 100 lines
pm2 logs auth-gateway-local --lines 100

# Error logs only
pm2 logs auth-gateway-local --err

# Output logs only
pm2 logs auth-gateway-local --out
```

### Control Service
```bash
# Restart
pm2 restart auth-gateway-local

# Stop
pm2 stop auth-gateway-local

# Delete (removes from PM2)
pm2 delete auth-gateway-local

# Reload (zero-downtime, if supported)
pm2 reload auth-gateway-local
```

### Monitor Resources
```bash
# Interactive monitoring
pm2 monit

# Status overview
pm2 status

# Detailed info
pm2 describe auth-gateway-local
```

### Save Configuration
```bash
# Save current PM2 process list
pm2 save

# Setup auto-start on system boot
pm2 startup
```

---

## 🚨 Troubleshooting

### Problem: Pre-flight Check Fails

**Symptom**: `preflight-check.js` reports errors

**Solutions**:
1. Check Node.js version: `node --version` (must be 18+)
2. Install dependencies: `npm install`
3. Configure `.env` file with real credentials
4. Ensure JWT_SECRET=REDACTED_JWT_SECRET

### Problem: Service Won't Start

**Symptom**: PM2 shows "errored" status

**Check**:
```bash
pm2 logs auth-gateway-local --err --lines 50
```

**Common Causes**:
1. ❌ Missing environment variables
2. ❌ Invalid database connection string
3. ❌ Port 4000 already in use
4. ❌ Missing dependencies

**Solutions**:
```bash
# Check what's using port 4000
lsof -ti:4000

# Kill process on port 4000
kill -9 $(lsof -ti:4000)

# Verify .env file
cat .env | grep -v "^#" | grep -v "^$"

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Problem: Restart Loop Detected

**Symptom**: Service restarts multiple times per minute

**Check**:
```bash
pm2 logs auth-gateway-local --lines 100
```

**Common Causes**:
1. ❌ Database connection failures
2. ❌ Invalid Supabase credentials
3. ❌ Module resolution errors
4. ❌ Uncaught exceptions in code

**Solutions**:
1. Test database connection:
   ```bash
   psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
   ```

2. Verify Supabase credentials:
   ```bash
   curl -I https://mxtsdgkwzjzlttpotole.supabase.co
   ```

3. Check for syntax errors:
   ```bash
   npm run build
   ```

4. Review recent code changes:
   ```bash
   git diff HEAD~1
   ```

### Problem: Health Check Fails

**Symptom**: `curl http://localhost:4000/health` returns error

**Check**:
```bash
# Is service running?
pm2 status

# Check logs
pm2 logs auth-gateway-local --lines 20

# Test port
curl -v http://localhost:4000/health
```

**Solutions**:
1. Restart service: `pm2 restart auth-gateway-local`
2. Check database: Verify DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
3. Wait longer: Service may still be initializing

### Problem: Database Connection Errors

**Symptom**: Logs show "database connection failed"

**Check**:
```bash
# Test connection directly
psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

# Check if schema exists
psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
```

**Solutions**:
1. Verify DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
2. Check Neon database is active (not paused)
3. Verify network connectivity
4. Run migrations if schema missing:
   ```bash
   psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
   ```

---

## 📊 Configuration Files

### [`ecosystem.config.local.js`](ecosystem.config.local.js:1)
- Single instance (fork mode)
- Max 5 restarts per minute
- 4-second restart delay
- 500MB memory limit
- Logs in `logs/` directory

### [`preflight-check.js`](preflight-check.js:1)
- Validates Node.js version
- Checks environment variables
- Verifies dependencies
- Tests port availability

### [`safe-start.sh`](safe-start.sh:1)
- Runs pre-flight checks
- Manages existing processes
- Monitors health
- Detects restart loops

---

## 🔄 Comparing with VPS Deployment

### Similarities
- ✅ Uses same codebase
- ✅ Same environment variables
- ✅ Same database (Neon)
- ✅ Same endpoints
- ✅ PM2 process management

### Differences
- 🔄 Single instance vs. 2 instances
- 🔄 Fork mode vs. cluster mode
- 🔄 Port 4000 vs. 9999
- 🔄 No Nginx reverse proxy
- 🔄 No SSL/TLS

### Why These Differences?
- **Single instance**: Easier debugging, lower resource usage
- **Fork mode**: Simpler process model, better for development
- **Different port**: Avoid conflicts with other services
- **No Nginx/SSL**: Not needed for local testing

---

## ✅ Success Criteria

Your local deployment is successful when:

1. ✅ Pre-flight checks pass
2. ✅ PM2 shows "online" status
3. ✅ Health endpoint returns 200 OK
4. ✅ No restarts in first 5 minutes
5. ✅ Admin login works
6. ✅ Database connection healthy
7. ✅ Logs show no errors

---

## 🎯 Next Steps

After successful local deployment:

1. **Test All Endpoints**: Use the test scripts
   ```bash
   ./test-admin-login.sh
   ./test-app-registration.sh
   ```

2. **Monitor Stability**: Let it run for 30+ minutes
   ```bash
   pm2 monit
   ```

3. **Test Recent Changes**: Verify your latest commits work correctly

4. **Compare with VPS**: Ensure behavior matches production

5. **Deploy to VPS**: Once stable locally, deploy to production
   ```bash
   # On VPS
   cd /opt/lanonasis/services/auth-gateway
   git pull
   pm2 restart auth-gateway
   ```

---

## 📞 Support

- **Documentation**: See other `.md` files in this directory
- **VPS Status**: Check [`DEPLOYMENT-STATUS.md`](DEPLOYMENT-STATUS.md:1)
- **Architecture**: See [`AUTH-SYSTEM-FINDINGS-SUMMARY.md`](AUTH-SYSTEM-FINDINGS-SUMMARY.md:1)
- **Stability Fix**: See [`PM2-STABILITY-FIX.md`](PM2-STABILITY-FIX.md:1)

---

**Remember**: This local setup is for testing. Always test locally before deploying to VPS!