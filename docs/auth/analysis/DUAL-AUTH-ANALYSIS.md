# Dual Authentication System Analysis
**Date:** October 23, 2025

## Current Architecture

### 1. Onasis-CORE (api.lanonasis.com)
**Service:** PM2 `auth` (ID 21) on port 3005  
**Location:** `/opt/lanonasis/auth/server.js`  
**Status:** ✅ Running and healthy

**Issue Found:** 
- `POST /auth/login` returns **HTML login page** instead of JSON
- Dashboard expects JSON response for API calls
- This causes: `SyntaxError: The string did not match the expected pattern`

### 2. Dashboard (auth.lanonasis.com) 
**Service:** PM2 `auth-gateway` (IDs 34, 35) on port 4000  
**Location:** `/opt/lanonasis/services/auth-gateway`  
**Status:** ✅ Running and healthy

**Response:** Returns proper JSON
```json
{"error":"Invalid credentials","code":"AUTH_INVALID_CREDENTIALS"}
```

## The Problem

**Dashboard calls:** `https://api.lanonasis.com/auth/login`  
**Gets:** HTML login page (terminal-style UI)  
**Expects:** JSON response  
**Result:** JavaScript parsing error

## Root Cause

The `api.lanonasis.com/auth/login` endpoint serves an HTML login page instead of a JSON API endpoint.

Looking at `/opt/lanonasis/auth/server.js`:
- It's a "Quick Auth Server for CLI Authentication"
- Serves HTML login interface
- Not designed for programmatic API calls

## Solutions

### Option 1: Fix api.lanonasis.com to return JSON
Update `/opt/lanonasis/auth/server.js` to:
1. Detect `Content-Type: application/json` header
2. Return JSON response instead of HTML
3. Keep HTML for browser requests

### Option 2: Point dashboard to auth.lanonasis.com
Update dashboard configuration to use:
```
VITE_AUTH_BASE_URL=https://auth.lanonasis.com
```

### Option 3: Add JSON endpoint to api.lanonasis.com
Add `/api/auth/login` endpoint that returns JSON while keeping `/auth/login` as HTML.

## Recommended Fix

**Option 2** is cleanest since:
- `auth.lanonasis.com` already returns proper JSON
- No code changes needed to existing services
- Dashboard can use the new auth gateway

## Testing Commands

```bash
# Test current api.lanonasis.com (returns HTML)
curl https://api.lanonasis.com/auth/login

# Test auth.lanonasis.com (returns JSON)
curl -X POST https://auth.lanonasis.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test","password":"test"}'
```

## Status

- ✅ Both auth services running
- ✅ Infrastructure healthy
- ❌ Dashboard calling wrong endpoint (HTML vs JSON)
- 🔧 Fix: Update dashboard to use `auth.lanonasis.com`

---

**Summary:** Dashboard needs to call `auth.lanonasis.com` instead of `api.lanonasis.com` for JSON responses.
