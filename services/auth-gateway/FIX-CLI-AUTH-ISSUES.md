# 🔧 CLI Authentication Issues - Fix Guide

**Date:** October 27, 2025  
**Status:** Multiple issues identified

---

## 🐛 **Issues Identified**

### **1. Local Auth Gateway Was Stopped** ✅ **FIXED**
```
Problem: PM2 instances were stopped
Cause: tsconfig.json changes broke build
Fix: Reverted tsconfig.json, rebuilt, restarted PM2
Status: ✅ Local auth-gateway running on localhost:4000
```

### **2. mcp.lanonasis.com/auth/cli-login Showing Static Image** ⚠️ **CRITICAL**
```
Problem: Page shows static Terminal-like image with non-functional buttons
Expected: Interactive authentication page with OAuth providers
Actual: Just an image showing "SIGN IN", "SIGN UP", "AUTHENTICATE" (not clickable)
Impact: CLI browser authentication completely broken
```

### **3. Local Admin Login Test Working** ✅
```
Status: ✅ localhost:4000/admin/bypass-login working
VPS Status: ✅ auth.lanonasis.com/admin/bypass-login working
```

### **4. CLI Authentication Failing (All 3 Methods)** ❌
```
Failed Methods:
1. Username/Password → 404 error
2. Browser OAuth → Static image page (not functional)
3. Vendor Token/API Key → Likely 404 as well
```

---

## 🔍 **Root Cause Analysis**

### **The mcp.lanonasis.com/auth/cli-login Issue**

Looking at the image you shared, the page is showing:
```
$ lanonasis auth

✓ Authentication Gateway Active

Authenticating for CLI

[Black box with text:]
SIGN IN
SIGN UP  
AUTHENTICATE

Resources:
• Documentation: docs.lanonasis.com
• Repository: github.com/lanonasis/lanonasis-maas
• API Status: api.lanonasis.com/health
```

**This is a SCREENSHOT/IMAGE, not an interactive page!**

### **Why This Happened:**

The MCP server at `mcp.lanonasis.com` is serving the **WRONG endpoint or wrong content**:

1. **Expected:** HTML page with OAuth provider buttons (GitHub, Google, etc.)
2. **Actual:** Static image or broken HTML without interactive elements
3. **Location:** This is served by the MCP standalone server on VPS port 3001

---

## 🔧 **Solution 1: Fix MCP Server CLI Auth Page**

The MCP server needs to serve a FUNCTIONAL authentication page, not a static image.

### **Check VPS MCP Server:**
```bash
ssh root@168.231.74.29 -p 2222
cd /opt/mcp-servers/lanonasis-standalone/current

# Check which server is running
pm2 list | grep mcp
pm2 logs onasis-mcp-standalone --lines 50

# Check the auth endpoint
curl http://localhost:3001/auth/cli-login

# Should return HTML with OAuth buttons, not an image!
```

### **Expected Response:**
The endpoint should return HTML like:
```html
<!DOCTYPE html>
<html>
<head>
    <title>CLI Authentication</title>
</head>
<body>
    <h1>Authenticate CLI</h1>
    <button onclick="signIn()">Sign In with GitHub</button>
    <button onclick="signUp()">Sign Up</button>
    <div id="token-display"></div>
    <script>
        function signIn() {
            // OAuth flow logic
        }
    </script>
</body>
</html>
```

---

## 🔧 **Solution 2: Use Auth Gateway Instead**

Since auth-gateway is working, we can bypass the broken MCP page:

### **Option A: Direct Credentials Authentication**
```bash
# Use username/password directly with auth-gateway
curl -X POST https://auth.lanonasis.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@lanonasis.com",
    "password": "LanonasisAdmin2025!",
    "platform": "cli"
  }'

# This returns an access_token you can use
```

### **Option B: Admin Bypass Token**
```bash
# Get admin token
curl -X POST https://auth.lanonasis.com/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@lanonasis.com",
    "password": "LanonasisAdmin2025!"
  }'

# Use the token returned
```

---

## 🔧 **Solution 3: Fix CLI to Use Auth Gateway Directly**

Update CLI to use auth-gateway for authentication instead of MCP server:

### **Current Flow (BROKEN):**
```
CLI → Opens browser → mcp.lanonasis.com/auth/cli-login (BROKEN)
```

### **New Flow (WORKING):**
```
CLI → POST credentials → auth.lanonasis.com/v1/auth/login → Get token
```

### **Implementation:**
```typescript
// In apps/lanonasis-maas/cli/src/commands/auth.ts

// OPTION 1: Direct credentials (skip browser)
const loginWithCredentials = async (email: string, password: string) => {
  const response = await axios.post('https://auth.lanonasis.com/v1/auth/login', {
    email,
    password,
    platform: 'cli'
  });
  
  const { access_token } = response.data;
  await config.setToken(access_token);
  console.log('✅ Authenticated successfully');
};

// OPTION 2: Use admin bypass
const loginWithAdmin = async (email: string, password: string) => {
  const response = await axios.post('https://auth.lanonasis.com/admin/bypass-login', {
    email,
    password
  });
  
  const { access_token } = response.data;
  await config.setToken(access_token);
  console.log('✅ Authenticated with admin access');
};
```

---

## 🚨 **Immediate Workaround: Manual Token Setup**

Until the MCP page is fixed, use this workaround:

### **Step 1: Get Token via curl**
```bash
# Get admin token
TOKEN=$(curl -s -X POST https://auth.lanonasis.com/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lanonasis.com","password":"LanonasisAdmin2025!"}' \
  | jq -r '.access_token')

echo "Token: $TOKEN"
```

### **Step 2: Manually Set in CLI Config**
```bash
# Edit CLI config file
nano ~/.maas/config.json

# Add token:
{
  "token": "eyJhbGc...",
  "user": {
    "email": "admin@lanonasis.com"
  }
}
```

### **Step 3: Test**
```bash
onasis status
# Should show: "Authenticated: Yes" ✅
```

---

## 🔍 **Debugging MCP Server on VPS**

Run these commands on the VPS to diagnose:

```bash
ssh root@168.231.74.29 -p 2222

# 1. Check PM2 status
pm2 list

# 2. Check MCP server logs
pm2 logs onasis-mcp-standalone --lines 100

# 3. Test CLI auth endpoint locally
curl http://localhost:3001/auth/cli-login

# 4. Check if it's returning HTML or something else
curl -I http://localhost:3001/auth/cli-login

# 5. Check nginx configuration
cat /etc/nginx/sites-enabled/mcp-lanonasis

# 6. Test external access
curl https://mcp.lanonasis.com/auth/cli-login
```

---

## 📝 **Expected vs Actual**

### **Expected Response from /auth/cli-login:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>CLI Authentication | LanOnasis</title>
    <style>
        /* Proper CSS styling */
    </style>
</head>
<body>
    <div class="container">
        <h1>Authenticate CLI</h1>
        
        <!-- OAuth Buttons -->
        <button onclick="signInWithGithub()">
            Sign In with GitHub
        </button>
        
        <!-- Token Display -->
        <div id="token-display">
            <p>After authentication, your token will appear here</p>
            <input type="text" id="token-field" readonly />
            <button onclick="copyToken()">Copy Token</button>
        </div>
    </div>
    
    <script>
        function signInWithGithub() {
            // OAuth flow
            window.location.href = '/oauth/github';
        }
        
        function copyToken() {
            // Copy to clipboard
        }
    </script>
</body>
</html>
```

### **Actual Response (BROKEN):**
```
Static image showing terminal-like interface
No interactive elements
No JavaScript
No OAuth buttons
Just an image/screenshot
```

---

## ✅ **Action Items**

### **Priority 1: Fix MCP Server (VPS)**
1. SSH to VPS
2. Check MCP server code at `/opt/mcp-servers/lanonasis-standalone/`
3. Find the `/auth/cli-login` route handler
4. Ensure it returns proper interactive HTML
5. Restart MCP server: `pm2 restart onasis-mcp-standalone`

### **Priority 2: CLI Workaround**
1. Update CLI to use auth-gateway directly
2. Skip the broken browser flow
3. Use POST to `/v1/auth/login` for credentials
4. Use POST to `/admin/bypass-login` for admin access

### **Priority 3: Test & Verify**
1. Test CLI auth with all 3 methods
2. Ensure tokens are validated correctly
3. Check `onasis status` shows authenticated

---

## 🚀 **Quick Fix Script for VPS**

```bash
#!/bin/bash
# Fix MCP CLI Auth Page

ssh root@168.231.74.29 -p 2222 << 'ENDSSH'
cd /opt/mcp-servers/lanonasis-standalone/current

# Check if route exists
grep -n "auth/cli-login" src/*.js src/*.cjs

# View current implementation
cat src/production-mcp-server.cjs | grep -A 50 "auth/cli-login"

# Restart service
pm2 restart onasis-mcp-standalone
pm2 logs onasis-mcp-standalone --lines 20

# Test endpoint
curl http://localhost:3001/auth/cli-login | head -20

echo "✅ MCP server restarted. Check logs above for errors."
ENDSSH
```

---

## 📊 **Status Summary**

| Component | Status | Issue | Priority |
|-----------|--------|-------|----------|
| Local auth-gateway | ✅ Working | Was stopped, now fixed | - |
| Local admin login | ✅ Working | Working on localhost:4000 | - |
| VPS auth-gateway | ✅ Working | auth.lanonasis.com working | - |
| VPS admin login | ✅ Working | Bypass login functional | - |
| MCP CLI auth page | ❌ BROKEN | Serving static image | 🔴 CRITICAL |
| CLI username/password | ❌ Failing | 404 errors | 🔴 HIGH |
| CLI browser OAuth | ❌ Failing | Page not interactive | 🔴 HIGH |
| CLI vendor token | ❌ Unknown | Likely failing | 🟡 MEDIUM |

---

## 🎯 **Recommended Fix Order**

1. **Immediate:** Use manual token workaround (see above)
2. **Short-term:** Update CLI to use auth-gateway directly
3. **Long-term:** Fix MCP server CLI auth page on VPS

---

**Next Step:** Would you like me to:
1. Create a script to diagnose the MCP server issue on VPS?
2. Update the CLI to bypass the broken page and use auth-gateway?
3. Create a manual authentication helper for immediate use?
