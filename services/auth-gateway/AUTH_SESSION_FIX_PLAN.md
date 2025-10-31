# 🔐 Authentication & Session Management Fix Plan

**Date:** October 31, 2025  
**Issue:** Users experiencing auth errors and being redirected to landing page instead of personalized dashboard

---

## 🔍 Current Problems Identified

### 1. **Dual Authentication Systems**

- ❌ Dashboard uses direct Supabase auth
- ❌ Auth-gateway exists separately at auth.lanonasis.com
- ❌ No session synchronization between them
- ❌ Users must authenticate twice

### 2. **No Cross-Domain Session Cookies**

- ❌ No HTTP-only cookies set by auth-gateway
- ❌ Sessions don't persist across \*.lanonasis.com domains
- ❌ Each subdomain treats user as unauthenticated

### 3. **Incorrect Dashboard Redirect**

- ❌ After login, redirects to `/dashboard` landing page
- ❌ Should redirect to personalized `/dashboard/[userId]` or `/dashboard/home`
- ❌ No state preservation for where user was trying to go

### 4. **Missing Session Validation Middleware**

- ❌ No middleware to validate session cookies
- ❌ No automatic token refresh
- ❌ No graceful session expiry handling

---

## ✅ Solution Architecture

### **Unified Authentication Flow**

```
User visits dashboard → Check session cookie → Valid? → Dashboard home
                                             ↓ Invalid
                                    Redirect to auth.lanonasis.com/login
                                             ↓
                                    User authenticates
                                             ↓
                                    Auth-gateway sets HTTP-only cookie
                                             ↓
                                    Redirect back to dashboard with session
                                             ↓
                                    Dashboard validates cookie → Dashboard home
```

---

## 🛠️ Implementation Steps

### **Step 1: Enable Session Cookies in Auth-Gateway**

#### Update Environment Variables

```bash
# Add to /opt/lanonasis/auth-gateway/.env
COOKIE_DOMAIN=.lanonasis.com
COOKIE_SECURE=true
COOKIE_HTTP_ONLY=true
COOKIE_SAME_SITE=lax
SESSION_SECRET=<generate-secure-secret>
DASHBOARD_URL=https://dashboard.lanonasis.com
```

#### Update auth.controller.ts - Login Method

```typescript
// Set HTTP-only session cookie after successful login
res.cookie("lanonasis_session", tokens.access_token, {
  domain: process.env.COOKIE_DOMAIN || ".lanonasis.com",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
});

// Redirect to dashboard instead of returning JSON
const returnTo =
  req.query.return_to || `${process.env.DASHBOARD_URL}/dashboard/home`;
return res.redirect(returnTo);
```

#### Update auth.controller.ts - Logout Method

```typescript
// Clear session cookie on logout
res.clearCookie("lanonasis_session", {
  domain: process.env.COOKIE_DOMAIN || ".lanonasis.com",
  path: "/",
});
```

---

### **Step 2: Add Session Cookie Middleware**

Create `/apps/onasis-core/services/auth-gateway/src/middleware/session.ts`:

```typescript
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { getSessionByToken } from "../services/session.service";

export async function validateSessionCookie(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const sessionToken = req.cookies.lanonasis_session;

  if (!sessionToken) {
    return next(); // No session cookie, continue
  }

  try {
    // Verify JWT token
    const payload = verifyToken(sessionToken);

    // Check if session exists and is active
    const session = await getSessionByToken(sessionToken);

    if (
      !session ||
      session.revoked ||
      new Date() > new Date(session.expires_at)
    ) {
      // Session expired or revoked, clear cookie
      res.clearCookie("lanonasis_session", {
        domain: process.env.COOKIE_DOMAIN || ".lanonasis.com",
        path: "/",
      });
      return next();
    }

    // Attach user to request
    req.user = payload;
    next();
  } catch (error) {
    // Invalid token, clear cookie
    res.clearCookie("lanonasis_session", {
      domain: process.env.COOKIE_DOMAIN || ".lanonasis.com",
      path: "/",
    });
    next();
  }
}
```

---

### **Step 3: Update Dashboard Authentication**

#### Create Session Cookie Checker

Create `/apps/dashboard/src/lib/auth-session.ts`:

```typescript
import { supabase } from "@/integrations/supabase/client";

const AUTH_GATEWAY_URL = "https://auth.lanonasis.com";

/**
 * Check if user has valid session cookie from auth-gateway
 */
export async function checkAuthGatewaySession(): Promise<{
  valid: boolean;
  user?: any;
  error?: string;
}> {
  try {
    // This will include cookies automatically
    const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/session`, {
      credentials: "include", // Important: include cookies
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    const data = await response.json();
    return { valid: true, user: data.user };
  } catch (error) {
    console.error("Auth gateway session check failed:", error);
    return { valid: false, error: "Network error" };
  }
}

/**
 * Sync auth-gateway session with Supabase session
 */
export async function syncAuthGatewayToSupabase(): Promise<boolean> {
  const session = await checkAuthGatewaySession();

  if (!session.valid) {
    return false;
  }

  try {
    // Get access token from auth-gateway
    const response = await fetch(`${AUTH_GATEWAY_URL}/v1/auth/token`, {
      credentials: "include",
    });

    if (!response.ok) {
      return false;
    }

    const { access_token } = await response.json();

    // Set Supabase session
    await supabase.auth.setSession({
      access_token,
      refresh_token: "", // Auth-gateway handles refresh
    });

    return true;
  } catch (error) {
    console.error("Failed to sync sessions:", error);
    return false;
  }
}

/**
 * Redirect to auth-gateway login with return URL
 */
export function redirectToAuthGateway(returnTo?: string) {
  const currentUrl = returnTo || window.location.href;
  const loginUrl = `${AUTH_GATEWAY_URL}/v1/auth/login?return_to=${encodeURIComponent(currentUrl)}`;
  window.location.href = loginUrl;
}
```

#### Update ProtectedRoute Component

```typescript
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { checkAuthGatewaySession, syncAuthGatewayToSupabase } from '@/lib/auth-session';
import { useToast } from '@/hooks/use-toast';

export function ProtectedRoute() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    async function validateSession() {
      // Check auth-gateway session cookie
      const session = await checkAuthGatewaySession();

      if (session.valid) {
        // Sync with Supabase
        await syncAuthGatewayToSupabase();
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    }

    validateSession();
  }, [location]);

  if (isAuthenticated === null) {
    return <div>Loading...</div>; // Or loading component
  }

  if (!isAuthenticated) {
    // Redirect to auth-gateway login
    const returnTo = encodeURIComponent(window.location.href);
    return <Navigate to={`https://auth.lanonasis.com/v1/auth/login?return_to=${returnTo}`} replace />;
  }

  return <Outlet />;
}
```

---

### **Step 4: Add Web Login Endpoint to Auth-Gateway**

Create `/apps/onasis-core/services/auth-gateway/src/routes/web.routes.ts`:

```typescript
import express from "express";
import { supabaseAdmin } from "../../db/client.js";
import { generateTokenPair } from "../utils/jwt.js";
import { createSession } from "../services/session.service.js";

const router = express.Router();

/**
 * GET /web/login
 * Show login page
 */
router.get("/login", (req, res) => {
  const returnTo = req.query.return_to || process.env.DASHBOARD_URL;

  // Render simple login form
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Login - LanOnasis</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 2rem;
          border-radius: 1rem;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          width: 100%;
          max-width: 400px;
        }
        h1 {
          margin: 0 0 1.5rem 0;
          font-size: 1.75rem;
          text-align: center;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        input {
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 0.5rem;
          font-size: 1rem;
        }
        button {
          padding: 0.75rem;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 600;
        }
        button:hover {
          background: #5568d3;
        }
        .error {
          color: #ef4444;
          font-size: 0.875rem;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Sign In</h1>
        <form action="/web/login" method="POST">
          <input type="email" name="email" placeholder="Email" required />
          <input type="password" name="password" placeholder="Password" required />
          <input type="hidden" name="return_to" value="${returnTo}" />
          <button type="submit">Sign In</button>
        </form>
        <div id="error" class="error"></div>
      </div>
    </body>
    </html>
  `);
});

/**
 * POST /web/login
 * Handle web login form submission
 */
router.post("/login", async (req, res) => {
  const { email, password, return_to } = req.body;

  try {
    // Authenticate with Supabase
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <body style="font-family: system-ui; text-align: center; padding: 2rem;">
          <h2>Authentication Failed</h2>
          <p>${error?.message || "Invalid credentials"}</p>
          <a href="/web/login?return_to=${encodeURIComponent(return_to || "")}">Try Again</a>
        </body>
        </html>
      `);
    }

    // Generate tokens
    const tokens = generateTokenPair({
      sub: data.user.id,
      email: data.user.email!,
      role: data.user.role || "authenticated",
      platform: "web",
    });

    // Create session
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await createSession({
      user_id: data.user.id,
      platform: "web",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      expires_at: expiresAt,
    });

    // Set HTTP-only session cookie
    res.cookie("lanonasis_session", tokens.access_token, {
      domain: process.env.COOKIE_DOMAIN || ".lanonasis.com",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    // Redirect to dashboard home
    const redirectUrl =
      return_to || `${process.env.DASHBOARD_URL}/dashboard/home`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Web login error:", error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <body style="font-family: system-ui; text-align: center; padding: 2rem;">
        <h2>Error</h2>
        <p>An unexpected error occurred. Please try again.</p>
        <a href="/web/login">Back to Login</a>
      </body>
      </html>
    `);
  }
});

export default router;
```

---

### **Step 5: Update Auth-Gateway Index to Include Web Routes**

Update `/apps/onasis-core/services/auth-gateway/src/index.ts`:

```typescript
import webRoutes from "./routes/web.routes.js";

// ... existing code ...

// Mount routes
app.use("/v1/auth", authRoutes);
app.use("/web", webRoutes); // Add web routes
app.use("/mcp", mcpRoutes);
app.use("/auth", cliRoutes);
app.use("/admin", adminRoutes);
```

---

### **Step 6: Update Environment Variables**

#### Auth-Gateway `.env`

```bash
# Add these
COOKIE_DOMAIN=.lanonasis.com
DASHBOARD_URL=https://dashboard.lanonasis.com
```

#### Dashboard `.env`

```bash
# Add these
VITE_AUTH_GATEWAY_URL=https://auth.lanonasis.com
VITE_USE_AUTH_GATEWAY=true
```

---

## 🧪 Testing the Flow

### **1. Clean Slate Test**

```bash
# Clear all cookies for *.lanonasis.com
# Open incognito window
# Visit https://dashboard.lanonasis.com
# Should redirect to auth.lanonasis.com/web/login
# Enter credentials
# Should redirect back to dashboard/home with session
```

### **2. Session Persistence Test**

```bash
# After logging in, visit different subdomains:
- https://api.lanonasis.com → Should see authenticated
- https://dashboard.lanonasis.com → Should stay logged in
- https://mcp.lanonasis.com → Should recognize session
```

### **3. Session Expiry Test**

```bash
# Wait 7 days or manually expire session in database
# Visit dashboard
# Should redirect to login
```

---

## 📊 Benefits of This Approach

✅ **Single Sign-On (SSO)**: Log in once, works everywhere  
✅ **Secure**: HTTP-only cookies can't be accessed by JavaScript  
✅ **Cross-Domain**: Works across all \*.lanonasis.com subdomains  
✅ **Persistent**: 7-day session expiry  
✅ **Graceful**: Auto-redirect to login when session expires  
✅ **Unified**: One source of truth for authentication

---

## 🚀 Deployment Checklist

- [ ] Update auth-gateway `.env` with cookie settings
- [ ] Update auth-gateway code with session cookie logic
- [ ] Add web routes to auth-gateway
- [ ] Restart auth-gateway PM2 process
- [ ] Update dashboard `.env` with auth-gateway URL
- [ ] Update dashboard code with session checking
- [ ] Deploy dashboard changes
- [ ] Test authentication flow end-to-end
- [ ] Monitor logs for any errors
- [ ] Document the flow for the team

---

**Status:** 📝 Implementation Plan Ready  
**Priority:** 🔴 High - Blocking user experience  
**Estimated Time:** 2-3 hours implementation + testing
