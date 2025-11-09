# OAuth Login Flow Fix

## Problem
OAuth `/oauth/authorize` returns 401 "Authentication required" when user isn't logged in.

## Root Cause  
The authorize endpoint requires `requireSessionCookie` middleware, which blocks unauthenticated users.

## Solution
Make `/oauth/authorize` redirect to `/web/login` when user isn't authenticated, then redirect back after login.

## Implementation

### 1. Update OAuth Controller (`src/controllers/oauth.controller.ts`)

**Line ~13-18, replace:**
```typescript
const userId = req.user?.sub

if (!userId) {
    return res.status(401).json({
        error: 'login_required',
        error_description: 'User session required before authorization',
    })
}
```

**With:**
```typescript
const userId = req.user?.sub

if (!userId) {
    // Redirect to login page with return URL
    const returnUrl = req.originalUrl
    return res.redirect(`/web/login?return_to=${encodeURIComponent(returnUrl)}`)
}
```

### 2. Update OAuth Routes (`src/routes/oauth.routes.ts`)

**Line ~32, replace:**
```typescript
router.get('/authorize', authorizeRateLimit, generateAuthorizeCSRF, requireSessionCookie, oauthController.authorize)
```

**With (remove requireSessionCookie):**
```typescript
router.get('/authorize', authorizeRateLimit, generateAuthorizeCSRF, oauthController.authorize)
```

The `authorize` controller will handle auth manually via redirect.

### 3. Rebuild and Restart
```bash
cd /opt/lanonasis/onasis-core/services/auth-gateway
npm run build
pm2 restart 2 3
```

## Testing
```bash
# Should redirect to login form
curl -L "https://auth.lanonasis.com/oauth/authorize?client_id=test&response_type=code&redirect_uri=http://localhost:8080/callback&code_challenge=test&code_challenge_method=S256"
```

## Flow After Fix
1. User clicks "Login with Lanonasis" in VSCode
2. Opens browser → `/oauth/authorize?...`
3. Not logged in → redirects to `/web/login?return_to=/oauth/authorize?...`
4. User logs in
5. Redirects back to `/oauth/authorize?...`
6. Now authenticated → shows authorization consent
7. User clicks "Authorize"
8. Redirects to VSCode with authorization code

