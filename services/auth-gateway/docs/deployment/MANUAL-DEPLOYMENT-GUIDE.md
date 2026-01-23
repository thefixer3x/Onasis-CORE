# Manual Deployment Guide - OAuth Dual-Path

## 🚨 SSH Connection Issue Detected

The automated deployment script cannot connect to the VPS (69.49.243.218).

## 🔍 Alternative Deployment Methods

### Option 1: Fix SSH Connection (Recommended)

The SSH connection is timing out. This could be due to:

1. VPN/Firewall blocking the connection
2. VPS firewall rules
3. SSH key authentication issues
4. VPS is down or IP changed

**Troubleshooting Steps:**

```bash
# Test if the IP is reachable
ping 69.49.243.218

# Try SSH with verbose output
ssh -vvv u139558452@69.49.243.218

# Check if you're on VPN
# If yes, disconnect and try again

# Check SSH config
cat ~/.ssh/config

# Try alternative SSH port (if configured)
ssh -p 2222 u139558452@69.49.243.218
```

### Option 2: Deploy via Hosting Control Panel

If you have access to Hostinger control panel:

1. Log into Hostinger control panel
2. Navigate to File Manager
3. Go to `/domains/api.lanonasis.com/public_html/src/`
4. Edit `index.ts`
5. Add the line: `app.use('/api/v1/oauth', oauthRoutes)`
6. Go to terminal in control panel
7. Run:
   ```bash
   cd /domains/api.lanonasis.com/public_html
   npm run build
   pm2 restart auth-gateway
   ```

### Option 3: Deploy via Git (If configured)

If the VPS has git deploy hooks:

```bash
# From your local machine
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/services/auth-gateway

# Commit changes
git add src/index.ts
git commit -m "feat: add OAuth dual-path support for CLI compatibility"

# Push to trigger deployment
git push origin main
```

### Option 4: Alternative VPS Access

Check if there's an alternative access method:

```bash
# Try different hostname
ssh u139558452@api.lanonasis.com

# Or check if there's a management interface
# Check Hostinger dashboard for web terminal access
```

## 📋 What Needs to Be Deployed

The change is minimal and already implemented in your local `src/index.ts`:

```typescript
// Around line 56-62:
app.use("/oauth", oauthRoutes);

// ADD THIS LINE:
app.use("/api/v1/oauth", oauthRoutes);
```

That's it! Just one line needs to be added to production.

## 🎯 Manual Deployment Steps (via SSH when accessible)

Once SSH access is restored:

```bash
# 1. Connect to VPS
ssh u139558452@69.49.243.218

# 2. Navigate to project
cd /home/u139558452/domains/api.lanonasis.com/public_html

# 3. Backup current file
cp src/index.ts src/index.ts.backup.$(date +%Y%m%d_%H%M%S)

# 4. Edit the file
nano src/index.ts

# Add this line after app.use('/oauth', oauthRoutes):
app.use('/api/v1/oauth', oauthRoutes)

# Save: Ctrl+O, Enter, Ctrl+X

# 5. Build
npm run build

# 6. Restart
pm2 restart auth-gateway
pm2 save

# 7. Verify
pm2 logs auth-gateway --lines 30

# 8. Test endpoints
curl -I https://api.lanonasis.com/api/v1/oauth/authorize?client_id=test
# Should return: HTTP/2 200
```

## 🧪 Verification After Deployment

Run the test script from your local machine:

```bash
cd /Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/onasis-core/services/auth-gateway
./test-oauth-endpoints.sh
```

Expected result:

```
✅ GET /oauth/authorize - Status: 200
✅ GET /api/v1/oauth/authorize - Status: 200
🎉 ALL TESTS PASSED!
```

## 📞 Need Help?

If you continue to have SSH issues:

1. Contact Hostinger support to verify:
   - VPS is running
   - SSH service is active
   - Your IP is not blocked
   - Correct SSH credentials

2. Use Hostinger's web terminal:
   - Log into Hostinger panel
   - Find "Terminal" or "SSH Access" option
   - Execute commands directly

## 🔄 Current Status

- ✅ Code changes ready locally
- ✅ Test scripts created
- ✅ Documentation complete
- ⚠️ SSH connection blocked/timeout
- ⏳ Waiting for deployment access

---

**The implementation is complete and ready. We just need working access to deploy it to the VPS.** 🚀
