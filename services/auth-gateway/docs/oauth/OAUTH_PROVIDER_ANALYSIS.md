# OAuth Provider Processing & Routing Analysis

## Overview
This document analyzes how social OAuth providers (GitHub, Google, Apple, LinkedIn, Azure, Discord) are processed and routed in the auth-gateway service.

## Current Implementation Status

### ⚠️ **CRITICAL FINDING: Missing Route Handler**

The CLI routes reference `/v1/auth/oauth?provider=...` but **no route handler exists** for this endpoint.

**Location**: `src/routes/cli.routes.ts` (line ~618)
```javascript
const oauthUrl = `/v1/auth/oauth?provider=${provider}&project_scope=lanonasis-maas&platform=${platform}&redirect_uri=${encodeURIComponent(redirectUri)}`;
```

**Issue**: This route is not defined in any route file, which means OAuth provider buttons in the CLI login page will result in 404 errors.

---

## OAuth Provider Buttons (UI Layer)

### Supported Providers (in UI)
The CLI login page (`src/routes/cli.routes.ts`) includes buttons for:

1. **Google** (`data-provider="google"`)
2. **GitHub** (`data-provider="github"`)
3. **LinkedIn** (`data-provider="linkedin_oidc"`)
4. **Discord** (`data-provider="discord"`)
5. **Apple** (`data-provider="apple"`)

### Provider Button HTML Structure
```html
<button type="button" class="oauth-btn" data-provider="google">
  <svg class="oauth-icon">...</svg>
  <span class="oauth-text">GOOGLE</span>
</button>
```

### JavaScript Handler
```javascript
function handleOAuthLogin(provider, button) {
  // Builds URL: /v1/auth/oauth?provider=${provider}&project_scope=lanonasis-maas&platform=${platform}&redirect_uri=${encodeURIComponent(redirectUri)}
  const oauthUrl = `/v1/auth/oauth?provider=${provider}&project_scope=lanonasis-maas&platform=${platform}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  window.location.href = oauthUrl;
}
```

---

## Current Route Structure

### Mounted Routes (from `src/index.ts`)
```typescript
app.use('/v1/auth', authRoutes)        // Password-based auth
app.use('/oauth', oauthRoutes)          // OAuth2 PKCE flow (authorize, token, revoke, introspect)
app.use('/api/v1/oauth', oauthRoutes)   // Backward compatibility
app.use('/auth', cliRoutes)             // CLI-specific routes
```

### OAuth Routes (`src/routes/oauth.routes.ts`)
The OAuth routes handle **OAuth2 PKCE flow** (not social providers):
- `GET /oauth/authorize` - Authorization endpoint
- `POST /oauth/token` - Token exchange
- `POST /oauth/revoke` - Token revocation
- `POST /oauth/introspect` - Token introspection

**These are NOT for social OAuth providers** - they're for OAuth2 client applications.

---

## Authentication Flow (Current)

### Password-Based Authentication
1. **Route**: `POST /v1/auth/login`
2. **Controller**: `src/controllers/auth.controller.ts::login()`
3. **Service**: Uses `supabaseAdmin.auth.signInWithPassword()`
4. **Provider Detection**: Reads `data.user.app_metadata?.provider` from Supabase user

### Provider Metadata
When a user logs in, the system captures:
```typescript
provider: data.user.app_metadata?.provider  // e.g., "google", "github", etc.
```

This suggests users **can** authenticate via social providers through Supabase, but the auth-gateway doesn't initiate the OAuth flow itself.

---

## Missing Implementation: Social OAuth Flow

### What Should Happen

1. **User clicks provider button** → Redirects to `/v1/auth/oauth?provider=google&...`
2. **Route handler** should:
   - Extract provider name
   - Get Supabase OAuth URL for that provider
   - Redirect user to Supabase OAuth page
3. **Supabase handles OAuth** → Redirects back to callback URL
4. **Callback handler** should:
   - Exchange code for tokens
   - Create/update user account
   - Generate custom JWT tokens
   - Create session
   - Redirect to original `redirect_uri`

### Required Implementation

#### 1. Add Route Handler (`src/routes/auth.routes.ts` or new file)
```typescript
router.get('/oauth', async (req, res) => {
  const { provider, project_scope, platform, redirect_uri } = req.query;
  
  // Validate provider
  const allowedProviders = ['google', 'github', 'apple', 'linkedin_oidc', 'discord', 'azure'];
  if (!allowedProviders.includes(provider as string)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  
  // Get Supabase OAuth URL
  const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
    provider: provider as any,
    options: {
      redirectTo: `${process.env.AUTH_GATEWAY_URL}/v1/auth/oauth/callback?redirect_uri=${encodeURIComponent(redirect_uri as string)}`,
      scopes: 'email profile',
    }
  });
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  // Redirect to Supabase OAuth page
  return res.redirect(data.url);
});
```

#### 2. Add Callback Handler
```typescript
router.get('/oauth/callback', async (req, res) => {
  const { code, redirect_uri } = req.query;
  
  // Exchange code for session
  const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code as string);
  
  if (error || !data.user) {
    return res.redirect(`${redirect_uri}?error=authentication_failed`);
  }
  
  // Upsert user account
  await upsertUserAccount({
    user_id: data.user.id,
    email: data.user.email!,
    role: data.user.role || 'authenticated',
    provider: data.user.app_metadata?.provider,
    raw_metadata: data.user.user_metadata || {},
    last_sign_in_at: data.user.last_sign_in_at || null,
  });
  
  // Generate tokens
  const tokens = generateTokenPair({
    sub: data.user.id,
    email: data.user.email!,
    role: data.user.role || 'authenticated',
    project_scope: req.query.project_scope as string,
    platform: req.query.platform as 'mcp' | 'cli' | 'web' | 'api',
  });
  
  // Create session
  await createSession({...});
  
  // Redirect with tokens (or set cookies for web)
  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.set('access_token', tokens.access_token);
  redirectUrl.searchParams.set('refresh_token', tokens.refresh_token);
  
  return res.redirect(redirectUrl.toString());
});
```

---

## Supabase OAuth Configuration

### Required Supabase Setup
1. **Enable OAuth providers** in Supabase Dashboard:
   - Google
   - GitHub
   - Apple
   - LinkedIn
   - Discord
   - Azure AD

2. **Configure redirect URLs**:
   - `https://auth.lanonasis.com/v1/auth/oauth/callback`
   - `http://localhost:3000/v1/auth/oauth/callback` (for development)

3. **Provider-specific settings**:
   - Client IDs
   - Client Secrets
   - Scopes

---

## Provider-Specific Details

### Google
- **Provider ID**: `google`
- **Scopes**: `email profile`
- **Supabase Method**: `signInWithOAuth({ provider: 'google' })`

### GitHub
- **Provider ID**: `github`
- **Scopes**: `user:email read:user`
- **Supabase Method**: `signInWithOAuth({ provider: 'github' })`

### Apple
- **Provider ID**: `apple`
- **Scopes**: `email name`
- **Supabase Method**: `signInWithOAuth({ provider: 'apple' })`
- **Note**: Requires Apple Developer account setup

### LinkedIn
- **Provider ID**: `linkedin_oidc` (in UI) → `linkedin` (Supabase)
- **Scopes**: `openid profile email`
- **Supabase Method**: `signInWithOAuth({ provider: 'linkedin' })`

### Discord
- **Provider ID**: `discord`
- **Scopes**: `identify email`
- **Supabase Method**: `signInWithOAuth({ provider: 'discord' })`

### Azure AD
- **Provider ID**: `azure` (not currently in UI)
- **Scopes**: `openid email profile`
- **Supabase Method**: `signInWithOAuth({ provider: 'azure' })`

---

## Current Workflow (Broken)

```
User clicks "GOOGLE" button
  ↓
JavaScript: window.location.href = "/v1/auth/oauth?provider=google&..."
  ↓
❌ 404 Not Found (route doesn't exist)
```

---

## Recommended Workflow (Fixed)

```
User clicks "GOOGLE" button
  ↓
JavaScript: window.location.href = "/v1/auth/oauth?provider=google&..."
  ↓
GET /v1/auth/oauth handler
  ↓
Call supabaseAdmin.auth.signInWithOAuth({ provider: 'google' })
  ↓
Redirect to Supabase OAuth page
  ↓
User authenticates with Google
  ↓
Supabase redirects to: /v1/auth/oauth/callback?code=...&redirect_uri=...
  ↓
GET /v1/auth/oauth/callback handler
  ↓
Exchange code for session
  ↓
Create/update user account
  ↓
Generate JWT tokens
  ↓
Create session
  ↓
Redirect to original redirect_uri with tokens
  ↓
CLI tool receives tokens and stores them
```

---

## Files That Need Changes

1. **`src/routes/auth.routes.ts`** - Add OAuth route handlers
2. **`src/controllers/auth.controller.ts`** - Add OAuth controller functions (or create new `oauth-provider.controller.ts`)
3. **Environment variables** - Add `AUTH_GATEWAY_URL` for callback URL
4. **Supabase Dashboard** - Configure OAuth providers

---

## Testing Checklist

- [ ] Google OAuth flow works
- [ ] GitHub OAuth flow works
- [ ] Apple OAuth flow works
- [ ] LinkedIn OAuth flow works
- [ ] Discord OAuth flow works
- [ ] Azure OAuth flow works (if added)
- [ ] Callback URL handles errors gracefully
- [ ] Tokens are properly generated and returned
- [ ] Sessions are created correctly
- [ ] User accounts are upserted with correct provider metadata
- [ ] Redirect URI validation works
- [ ] Platform-specific tokens are generated (cli, mcp, web, api)

---

## Summary

**Current State**: 
- UI has OAuth provider buttons ✅
- Route handler is missing ❌
- Supabase integration exists but not used for OAuth initiation ❌

**Required Actions**:
1. Implement `/v1/auth/oauth` route handler
2. Implement `/v1/auth/oauth/callback` route handler
3. Configure Supabase OAuth providers
4. Test end-to-end flow for each provider

