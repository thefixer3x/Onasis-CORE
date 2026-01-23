# Auth Gateway Deployment Scripts Analysis

**Date:** October 27, 2025  
**Current Status:** Auth gateway tested locally, ready for VPS deployment

---

## 📋 Script Analysis Summary

### ✅ **deploy.sh** (RECOMMENDED - Handles Redeployment)
**Location:** `apps/onasis-core/services/auth-gateway/deploy.sh`  
**Process Manager:** PM2  
**Redeployment Support:** ✅ YES

**Key Actions:**
- `./deploy.sh deploy` - **FULL REDEPLOYMENT** (recommended)
- `./deploy.sh build` - Build only
- `./deploy.sh start` - Start with PM2
- `./deploy.sh restart` - Restart existing PM2 process
- `./deploy.sh status` - Check health
- `./deploy.sh logs` - View logs

**Redeployment Flow:**
```bash
./deploy.sh deploy
# 1. npm ci --only=production (clean install)
# 2. npm run build (compile TypeScript)
# 3. pm2 stop auth-gateway || true (stop if running)
# 4. pm2 start ecosystem.config.js --env production
# 5. pm2 save (persist)
# 6. sudo systemctl reload nginx
```

**Verdict:** ✅ **Fully supports redeployment** - Safe to run multiple times

---

### ⚠️ **deploy-to-vps.sh** (Initial Deployment Only)
**Location:** `apps/onasis-core/services/auth-gateway/deploy-to-vps.sh`  
**Process Manager:** systemd  
**Redeployment Support:** ❌ NO

**Issues:**
1. Always creates new systemd service (will fail if exists)
2. Always creates new Nginx config (overwrites)
3. No check for existing deployment
4. Uses systemd instead of PM2

**What it does:**
- Uploads files via rsync
- Creates systemd service from scratch
- Sets up Nginx config
- **NOT designed for updates**

**Verdict:** ❌ **Initial deployment only** - Will fail on redeployment

---

## 🎯 Recommended Deployment Strategy

### For VPS (Hostinger 168.231.74.29)

**Use `deploy.sh` not `deploy-to-vps.sh`**

#### **Option 1: Local PM2 Test First (Recommended)**
```bash
# 1. Test locally with PM2
cd apps/onasis-core/services/auth-gateway

# Install PM2 globally if not installed
npm install -g pm2

# Build the project
npm run build

# Start with PM2 locally
pm2 start ecosystem.config.js --env production

# Check status
pm2 status

# Test endpoint
curl http://localhost:4000/health

# View logs
pm2 logs auth-gateway --lines 50

# Stop when done testing
pm2 stop auth-gateway
pm2 delete auth-gateway
```

#### **Option 2: Direct VPS Deployment**
```bash
# SSH to VPS (adjust port if needed)
ssh root@168.231.74.29 -p 2222

# Navigate to deployment directory
cd /var/www/onasis-core/services/auth-gateway

# Pull latest changes
git pull origin main

# Run deployment script
./deploy.sh deploy

# This will:
# - Install dependencies
# - Build TypeScript
# - Restart PM2 process
# - Reload Nginx
```

---

## 🔧 PM2 Configuration Details

### **ecosystem.config.js**
```javascript
{
  name: 'auth-gateway',
  script: 'start.js',           // Points to start.js wrapper
  instances: 2,                  // 2 cluster instances
  exec_mode: 'cluster',          // Load balanced
  autorestart: true,             // Auto-restart on crash
  max_memory_restart: '500M',    // Restart if exceeds 500MB
  env: {
    NODE_ENV: 'production',
    PORT: 4000
  }
}
```

### **start.js** (Entry Point)
```javascript
// Wrapper that loads the built dist/index.js
import './dist/index.js'
```

### **PM2 Process Flow**
```
PM2 → start.js → dist/index.js → Express Server (Port 4000)
```

---

## 🧪 Local PM2 Test Instructions

### **Step 1: Build the Application**
```bash
cd apps/onasis-core/services/auth-gateway
npm run build

# Verify build output
ls -la dist/
# Should show: index.js and other compiled files
```

### **Step 2: Start with PM2**
```bash
# Start using ecosystem config
pm2 start ecosystem.config.js --env production

# Or start directly
pm2 start start.js --name auth-gateway

# Expected output:
# ┌────┬────────────────┬─────────┬───────┬────────┬─────────┐
# │ id │ name           │ mode    │ ↺    │ status │ cpu     │
# ├────┼────────────────┼─────────┼───────┼────────┼─────────┤
# │ 0  │ auth-gateway   │ cluster │ 0    │ online │ 0%      │
# │ 1  │ auth-gateway   │ cluster │ 0    │ online │ 0%      │
# └────┴────────────────┴─────────┴───────┴────────┴─────────┘
```

### **Step 3: Verify Running**
```bash
# Check PM2 status
pm2 status

# View real-time logs
pm2 logs auth-gateway

# Test health endpoint
curl http://localhost:4000/health
# Expected: {"status":"ok","service":"auth-gateway",...}

# Test CLI verification endpoint
curl -X POST http://localhost:4000/v1/auth/verify-token \
  -H "Content-Type: application/json" \
  -d '{"token":"cli_1730009400000_test123"}'
# Expected: {"valid":true,...}
```

### **Step 4: Test CLI Integration**
```bash
# In another terminal
cd apps/lanonasis-maas/cli

# Test login (should verify against PM2 instance)
./dist/index-simple.js auth login

# Check status
./dist/index-simple.js status
# Should show: "Authenticated: Yes"
```

### **Step 5: Monitor & Debug**
```bash
# Real-time monitoring
pm2 monit

# View error logs
pm2 logs auth-gateway --err

# View all logs (last 100 lines)
pm2 logs auth-gateway --lines 100

# Restart if needed
pm2 restart auth-gateway

# Stop when done
pm2 stop auth-gateway
pm2 delete auth-gateway
```

---

## 🚀 VPS Deployment Workflow

### **Pre-Deployment Checklist**
- [ ] Tested locally with PM2 ✅ (you have it running with `npm run dev`)
- [ ] Built successfully (`npm run build`)
- [ ] Health endpoint responding
- [ ] Token verification working
- [ ] Database connected (Neon)
- [ ] `.env` file has all required variables
- [ ] PM2 ecosystem.config.js configured
- [ ] VPS SSH access working

### **Deployment Steps**

#### **1. Prepare VPS**
```bash
# SSH to VPS
ssh root@168.231.74.29 -p 2222

# Install PM2 globally (if not already installed)
npm install -g pm2

# Create deployment directory (if needed)
mkdir -p /var/www/onasis-core/services/auth-gateway
```

#### **2. Upload Latest Code**
```bash
# From local machine
cd apps/onasis-core/services/auth-gateway

# Upload to VPS (using rsync)
rsync -avz -e "ssh -p 2222" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'logs' \
  ./ root@168.231.74.29:/var/www/onasis-core/services/auth-gateway/

# Or use Git (if VPS has repo access)
ssh root@168.231.74.29 -p 2222 "cd /var/www/onasis-core/services/auth-gateway && git pull origin main"
```

#### **3. Deploy on VPS**
```bash
# SSH to VPS
ssh root@168.231.74.29 -p 2222

# Navigate to app
cd /var/www/onasis-core/services/auth-gateway

# Copy environment file (first time only)
cp .env.example .env
# Edit .env with production values
nano .env

# Run deployment
./deploy.sh deploy

# Or step by step:
npm ci --only=production
npm run build
pm2 stop auth-gateway || true
pm2 start ecosystem.config.js --env production
pm2 save
```

#### **4. Verify Deployment**
```bash
# Check PM2 status
pm2 status auth-gateway

# View logs
pm2 logs auth-gateway --lines 50

# Test health endpoint
curl http://localhost:4000/health

# Test from external
curl http://168.231.74.29:4000/health

# If behind Nginx:
curl http://auth.lanonasis.com/health
```

#### **5. Setup PM2 Startup (First Time Only)**
```bash
# Generate startup script
pm2 startup

# Follow the output instructions, usually:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

# Save PM2 process list
pm2 save

# Verify it will start on reboot
systemctl status pm2-root
```

---

## 🔄 Redeployment Process (Updates)

When you need to deploy updates:

```bash
# SSH to VPS
ssh root@168.231.74.29 -p 2222

# Navigate to app
cd /var/www/onasis-core/services/auth-gateway

# Pull latest changes
git pull origin main

# Run deployment script (handles everything)
./deploy.sh deploy

# Or manual steps:
npm ci --only=production    # Clean install
npm run build               # Rebuild TypeScript
pm2 restart auth-gateway    # Restart PM2 process
pm2 save                    # Persist changes

# Verify
pm2 logs auth-gateway --lines 20
curl http://localhost:4000/health
```

**Note:** `deploy.sh deploy` is idempotent - safe to run multiple times!

---

## 🐛 Troubleshooting

### **PM2 Process Not Starting**
```bash
# Check PM2 logs
pm2 logs auth-gateway --err

# Common issues:
# 1. Port 4000 already in use
lsof -i :4000
kill -9 <PID>

# 2. Missing dependencies
npm ci --only=production

# 3. Build failed
npm run build
```

### **Database Connection Fails**
```bash
# Verify .env has correct DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
cat .env | grep DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

# Test connection manually
psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
```

### **Nginx Not Proxying**
```bash
# Check Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## 📊 Comparison: systemd vs PM2

| Feature | systemd (deploy-to-vps.sh) | PM2 (deploy.sh) |
|---------|---------------------------|-----------------|
| **Clustering** | ❌ Single instance | ✅ 2 instances (load balanced) |
| **Auto-restart** | ✅ Yes | ✅ Yes + crash detection |
| **Log management** | systemd journal | ✅ Dedicated log files |
| **Monitoring** | systemctl status | ✅ pm2 monit (real-time) |
| **Zero-downtime** | ❌ No | ✅ Yes (reload) |
| **Redeployment** | ❌ Overwrites config | ✅ `pm2 restart` |
| **Memory limits** | Manual config | ✅ Auto-restart on 500MB |

**Recommendation:** Use PM2 (`deploy.sh`) for production

---

## ✅ Summary

### **For Local Testing:**
```bash
cd apps/onasis-core/services/auth-gateway
npm run build
pm2 start ecosystem.config.js --env production
pm2 logs auth-gateway
curl http://localhost:4000/health
```

### **For VPS Deployment:**
```bash
# SSH to VPS
ssh root@168.231.74.29 -p 2222
cd /var/www/onasis-core/services/auth-gateway
git pull origin main
./deploy.sh deploy
```

### **For Redeployment:**
```bash
# Same as deployment - script is idempotent
./deploy.sh deploy
```

**Scripts Verdict:**
- ✅ **deploy.sh** - Use this (handles both initial + redeployment)
- ❌ **deploy-to-vps.sh** - Don't use (initial only, uses systemd)

---

**Status:** Ready for VPS deployment  
**Recommended:** Test with PM2 locally first, then deploy to VPS  
**Safe to deploy:** Yes - script handles redeployment correctly
