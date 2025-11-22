# Unified Authentication Migration Plan
**Date:** October 23, 2025  
**Goal:** Permanent, consistent auth across all platforms

## Current State Analysis

### 1. Multiple Auth Endpoints (CONFUSING)
- `api.lanonasis.com/auth/login` → HTML page (port 3005)
- `auth.lanonasis.com/v1/auth/login` → JSON API (port 4000) 
- `mcp.lanonasis.com/auth/cli-login` → HTML page (port 3005)

### 2. Services Running
- **Port 3005:** Quick Auth Server (HTML interface)
- **Port 4000:** Auth Gateway (JSON API)
- **Port 3001:** MCP Core Server

### 3. The Problem
- Dashboard calls `api.lanonasis.com/auth/login` → Gets HTML → JavaScript error
- CLI calls `mcp.lanonasis.com/auth/cli-login` → Gets HTML → Works for CLI
- New auth gateway at `auth.lanonasis.com` → Returns JSON → Works for APIs

## 🎯 RECOMMENDED SOLUTION: Unified Auth Gateway

### Phase 1: Consolidate to auth.lanonasis.com

**Make `auth.lanonasis.com` the SINGLE auth endpoint for ALL platforms:**

1. **Dashboard:** `auth.lanonasis.com/v1/auth/login` ✅ (already working)
2. **CLI:** `auth.lanonasis.com/auth/cli-login` (migrate from mcp.lanonasis.com)
3. **APIs:** `auth.lanonasis.com/v1/auth/*` (migrate from api.lanonasis.com)
4. **MCP:** `auth.lanonasis.com/mcp/*` (migrate from mcp.lanonasis.com)

### Phase 2: Update All Configurations

#### A. Dashboard Configuration
```env
VITE_AUTH_BASE_URL=https://auth.lanonasis.com
VITE_AUTH_DOMAIN=auth.lanonasis.com
VITE_CENTRAL_AUTH=true
```

#### B. CLI Configuration  
```env
AUTH_GATEWAY_URL=https://auth.lanonasis.com
MCP_AUTH_URL=https://auth.lanonasis.com/auth/cli-login
```

#### C. API Services Configuration
```env
AUTH_SERVICE_URL=https://auth.lanonasis.com/v1/auth
AUTH_VERIFY_URL=https://auth.lanonasis.com/v1/auth/verify
```

### Phase 3: Update Nginx Routing

#### Update `/etc/nginx/sites-available/auth.lanonasis.com`:

```nginx
server {
    server_name auth.lanonasis.com;
    
    # Main auth API endpoints
    location /v1/auth/ {
        proxy_pass http://127.0.0.1:4000/v1/auth/;
        # ... proxy headers
    }
    
    # CLI auth endpoints (migrate from mcp.lanonasis.com)
    location /auth/cli-login {
        proxy_pass http://127.0.0.1:4000/auth/cli-login;
        # ... proxy headers
    }
    
    # MCP endpoints (migrate from mcp.lanonasis.com)
    location /mcp/ {
        proxy_pass http://127.0.0.1:4000/mcp/;
        # ... proxy headers
    }
    
    # Legacy redirects (temporary)
    location /oauth/ {
        return 301 https://auth.lanonasis.com/v1/auth$request_uri;
    }
}
```

### Phase 4: Update Auth Gateway

#### Add missing endpoints to `/opt/lanonasis/services/auth-gateway`:

```typescript
// Add CLI login endpoint
app.get('/auth/cli-login', (req, res) => {
  // Serve HTML login page for CLI
  res.sendFile(path.join(__dirname, 'public/cli-login.html'));
});

// Add MCP endpoints
app.use('/mcp', mcpRoutes);

// Add OAuth compatibility
app.use('/oauth', oauthRoutes);
```

## 🚀 IMPLEMENTATION STEPS

### Step 1: Update Auth Gateway (Priority)
```bash
# Add missing endpoints to auth-gateway
cd /opt/lanonasis/services/auth-gateway
# Add CLI login HTML page
# Add MCP routes
# Add OAuth compatibility routes
```

### Step 2: Update Nginx Configuration
```bash
# Update auth.lanonasis.com to handle all auth traffic
sudo nano /etc/nginx/sites-available/auth.lanonasis.com
sudo nginx -t && sudo systemctl reload nginx
```

### Step 3: Update All Client Configurations
```bash
# Dashboard
cd /opt/lanonasis/onasis-core
# Update .env files

# CLI tools
# Update environment variables

# API services  
# Update service configurations
```

### Step 4: Test Migration
```bash
# Test dashboard
curl https://auth.lanonasis.com/v1/auth/login

# Test CLI
curl https://auth.lanonasis.com/auth/cli-login

# Test MCP
curl https://auth.lanonasis.com/mcp/health
```

### Step 5: Deprecate Old Endpoints
```bash
# After migration is complete:
# - Redirect api.lanonasis.com/auth/* → auth.lanonasis.com/v1/auth/*
# - Redirect mcp.lanonasis.com/auth/* → auth.lanonasis.com/auth/*
```

## 📋 MIGRATION CHECKLIST

- [ ] Update auth-gateway with missing endpoints
- [ ] Update nginx routing for auth.lanonasis.com
- [ ] Update dashboard configuration
- [ ] Update CLI configuration  
- [ ] Update API service configurations
- [ ] Test all endpoints
- [ ] Update documentation
- [ ] Set up redirects for old endpoints
- [ ] Monitor for 24 hours
- [ ] Remove old auth services

## 🎯 END RESULT

**Single Auth Domain:** `auth.lanonasis.com`

**All Endpoints:**
- `auth.lanonasis.com/v1/auth/login` (JSON API)
- `auth.lanonasis.com/auth/cli-login` (HTML for CLI)
- `auth.lanonasis.com/mcp/*` (MCP endpoints)
- `auth.lanonasis.com/oauth/*` (OAuth compatibility)

**Benefits:**
- ✅ Single source of truth
- ✅ Consistent authentication
- ✅ Easier maintenance
- ✅ Better security
- ✅ Clear separation of concerns

---

**Next Action:** Start with updating the auth-gateway to handle all auth traffic.
