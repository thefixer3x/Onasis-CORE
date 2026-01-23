# ✅ Local PM2 Setup - Complete

**Date**: 2025-10-24  
**Status**: Ready for deployment  
**Purpose**: Safe local testing environment for auth-gateway

---

## 📦 What Was Created

### 1. **Local PM2 Configuration** [`ecosystem.config.local.js`](ecosystem.config.local.js)
- Single instance (fork mode) for easier debugging
- Max 5 restarts per minute (prevents restart loops)
- 4-second restart delay
- 500MB memory limit
- Separate log files for local testing

**Key Differences from Production:**
```javascript
// Local (this file)
instances: 1
exec_mode: 'fork'
max_restarts: 5

// Production (ecosystem.config.js)
instances: 2
exec_mode: 'cluster'
max_restarts: unlimited
```

### 2. **Pre-flight Validation Script** [`preflight-check.js`](preflight-check.js)
Validates before starting PM2:
- ✅ Node.js version (18+)
- ✅ Environment variables (.env)
- ✅ Dependencies installed
- ✅ Entry point files exist
- ✅ PM2 installation
- ✅ Port 4000 availability

**Usage:**
```bash
node preflight-check.js
```

### 3. **Safe Startup Script** [`safe-start.sh`](safe-start.sh)
Automated deployment with safety checks:
1. Runs pre-flight validation
2. Checks for existing processes
3. Starts PM2 with local config
4. Waits for initialization (10s)
5. Performs health checks (5 retries)
6. Monitors for restart loops (30s)
7. Displays service information

**Usage:**
```bash
./safe-start.sh
```

### 4. **Comprehensive Documentation**
- [`LOCAL-DEPLOYMENT-GUIDE.md`](LOCAL-DEPLOYMENT-GUIDE.md) - Full deployment guide (545 lines)
- [`QUICK-START.md`](QUICK-START.md) - Quick reference (130 lines)
- This file - Setup summary

---

## 🎯 Why This Setup?

### Problem: VPS Restart Loops
From [`PM2-STABILITY-FIX.md`](PM2-STABILITY-FIX.md):
- Auth gateway experienced continuous crashes
- Hundreds of restarts per hour
- Caused by ESM module resolution errors

### Solution Applied
1. ✅ Created `start.js` with `tsx` loader
2. ✅ Fixed all import statements (added `.js` extensions)
3. ✅ Updated PM2 config to use `start.js`
4. ✅ Result: 17+ hours uptime, 0 restarts

### Local Testing Benefits
- 🔍 Test changes before VPS deployment
- 🛡️ Restart loop protection (max 5 restarts)
- 🐛 Easier debugging (single instance, fork mode)
- 📊 Health monitoring built-in
- ⚡ Fast iteration cycle

---

## 🚀 How to Use

### Quick Start (Recommended)
```bash
cd services/auth-gateway
./safe-start.sh
```

### Manual Start
```bash
# 1. Validate
node preflight-check.js

# 2. Start PM2
pm2 start ecosystem.config.local.js

# 3. Check status
pm2 status

# 4. Test health
curl http://localhost:4000/health
```

### Stop Service
```bash
pm2 stop auth-gateway-local
pm2 delete auth-gateway-local
```

---

## 🧪 Testing Checklist

After deployment, verify:

### 1. Service Status
```bash
pm2 status
# Should show: online, 0 restarts
```

### 2. Health Endpoint
```bash
curl http://localhost:4000/health
# Should return: {"status":"ok","service":"auth-gateway",...}
```

### 3. Admin Login
```bash
curl -X POST http://localhost:4000/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"REDACTED_CHANGE_ME"}'
# Should return: JWT token
```

### 4. Stability Check
```bash
# Wait 5 minutes, then check
pm2 status
# Restart count should still be 0
```

### 5. Log Review
```bash
pm2 logs auth-gateway-local --lines 50
# Should show no errors
```

---

## 🔧 Configuration Files

### Environment Variables (`.env`)
```bash
# Required
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET=REDACTED_JWT_SECRET

# Optional (defaults provided)
PORT=4000
NODE_ENV="development"
CORS_ORIGIN="*"
```

### PM2 Config ([`ecosystem.config.local.js`](ecosystem.config.local.js))
```javascript
{
  name: 'auth-gateway-local',
  script: 'start.js',
  instances: 1,
  exec_mode: 'fork',
  max_restarts: 5,
  restart_delay: 4000,
  env: {
    NODE_ENV: 'development',
    PORT: 4000
  }
}
```

---

## 📊 Comparison: Local vs VPS

| Feature | Local | VPS Production |
|---------|-------|----------------|
| **Config File** | `ecosystem.config.local.js` | `ecosystem.config.js` |
| **Process Name** | `auth-gateway-local` | `auth-gateway` |
| **Instances** | 1 | 2 |
| **Mode** | fork | cluster |
| **Port** | 4000 | 9999 |
| **Domain** | localhost | auth.lanonasis.com |
| **SSL** | No | Yes (Nginx) |
| **Max Restarts** | 5/min | Unlimited |
| **Purpose** | Testing | Production |

---

## 🚨 Safety Features

### 1. Restart Loop Protection
```javascript
max_restarts: 5,        // Max 5 restarts
restart_delay: 4000,    // 4 seconds between restarts
min_uptime: '10s',      // Must run 10s to be considered stable
```

If service restarts 5 times in 1 minute, PM2 stops it automatically.

### 2. Pre-flight Validation
Catches issues before PM2 starts:
- Missing environment variables
- Invalid database URLs
- Port conflicts
- Missing dependencies

### 3. Health Monitoring
`safe-start.sh` monitors for 30 seconds:
- Checks health endpoint (5 retries)
- Counts restarts
- Alerts if unstable

### 4. Graceful Shutdown
```javascript
kill_timeout: 10000,    // 10 seconds to cleanup
wait_ready: true,       // Wait for app ready signal
listen_timeout: 10000   // 10 seconds to start listening
```

---

## 🐛 Troubleshooting

### Pre-flight Check Fails
**Solution**: Fix reported issues before starting PM2
```bash
node preflight-check.js
# Follow error messages
```

### Service Restarts Immediately
**Check logs**:
```bash
pm2 logs auth-gateway-local --err --lines 50
```

**Common causes**:
1. Invalid DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
2. Missing Supabase credentials
3. Port 4000 in use
4. Syntax errors in code

### Health Check Fails
**Test manually**:
```bash
curl -v http://localhost:4000/health
```

**If connection refused**:
- Service may still be starting (wait 10s)
- Check PM2 status: `pm2 status`
- Review logs: `pm2 logs auth-gateway-local`

### Restart Loop Detected
**Immediate action**:
```bash
pm2 stop auth-gateway-local
pm2 logs auth-gateway-local --lines 100
```

**Analyze logs** for:
- Database connection errors
- Module resolution errors
- Uncaught exceptions
- Configuration errors

---

## 📈 Success Metrics

Your deployment is successful when:

1. ✅ Pre-flight checks pass
2. ✅ PM2 status shows "online"
3. ✅ Health endpoint returns 200 OK
4. ✅ Zero restarts after 5 minutes
5. ✅ Admin login works
6. ✅ Database connection healthy
7. ✅ No errors in logs

---

## 🔄 Deployment Workflow

### 1. Local Testing (This Setup)
```bash
cd services/auth-gateway
./safe-start.sh
# Test changes locally
```

### 2. Verify Stability
```bash
# Let run for 30+ minutes
pm2 monit
# Check restart count stays at 0
```

### 3. Deploy to VPS
```bash
# SSH to VPS
ssh root@168.231.74.29

# Navigate to auth-gateway
cd /opt/lanonasis/services/auth-gateway

# Pull latest changes
git pull

# Restart PM2 (production config)
pm2 restart auth-gateway

# Monitor
pm2 logs auth-gateway
```

---

## 📚 Related Documentation

### In This Directory
- [`LOCAL-DEPLOYMENT-GUIDE.md`](LOCAL-DEPLOYMENT-GUIDE.md) - Comprehensive guide
- [`QUICK-START.md`](QUICK-START.md) - Quick reference
- [`PM2-STABILITY-FIX.md`](PM2-STABILITY-FIX.md) - VPS restart loop fix
- [`DEPLOYMENT-STATUS.md`](DEPLOYMENT-STATUS.md) - VPS deployment status
- [`CURRENT-STATUS.md`](CURRENT-STATUS.md) - Current operational status
- [`AUTH-SYSTEM-FINDINGS-SUMMARY.md`](AUTH-SYSTEM-FINDINGS-SUMMARY.md) - Architecture analysis

### Root Directory
- [`PM2-STABILITY-FIX.md`](../../PM2-STABILITY-FIX.md) - Root level stability documentation

---

## 🎓 Key Learnings

### From VPS Issues
1. **ESM modules need explicit `.js` extensions** in imports
2. **TypeScript compilation can cause module resolution issues**
3. **Using `tsx` loader is more reliable** than pre-compiled JS
4. **Restart limits prevent infinite loops** from crashing servers
5. **Pre-flight validation catches issues early**

### Best Practices Applied
1. ✅ Single instance for local testing
2. ✅ Fork mode for easier debugging
3. ✅ Automated validation before start
4. ✅ Health monitoring built-in
5. ✅ Restart loop protection
6. ✅ Comprehensive logging
7. ✅ Clear documentation

---

## 🎯 Next Steps

1. **Test Your Changes**
   ```bash
   ./safe-start.sh
   ```

2. **Verify Stability**
   - Let run for 30+ minutes
   - Check restart count stays at 0
   - Test all endpoints

3. **Review Logs**
   ```bash
   pm2 logs auth-gateway-local
   ```

4. **Deploy to VPS** (when stable)
   - Follow deployment workflow above
   - Monitor VPS logs carefully
   - Keep local instance running for comparison

---

## ✅ Summary

You now have a **production-like local PM2 environment** that:

- ✅ Simulates VPS deployment
- ✅ Prevents restart loops
- ✅ Validates before starting
- ✅ Monitors health automatically
- ✅ Provides detailed logging
- ✅ Matches VPS architecture

**Ready to deploy?** Run `./safe-start.sh` and start testing!

---

**Created**: 2025-10-24  
**Purpose**: Safe local PM2 testing for auth-gateway  
**Status**: ✅ Ready for use