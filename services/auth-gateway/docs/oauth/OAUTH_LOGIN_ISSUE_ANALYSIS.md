# OAuth Login Issue Analysis - Jam Recording

**Jam ID**: `03aa1418-e418-42f0-a07f-2b7707d5010a`  
**Issue**: "login button not responding"  
**Date**: November 16, 2024

## Issue Summary

The OAuth authorization flow is **working correctly on the server side**, but failing because the redirect URI points to a local server that isn't running.

## What's Happening

### ✅ Server Side (Working)

1. User clicks login button
2. Browser navigates to: `https://auth.lanonasis.com/web/login?return_to=/oauth/authorize?...`
3. OAuth authorize endpoint processes request
4. Server returns **302 Found** with authorization code
5. Location header: `http://localhost:8080/callback?code=...&state=...`

### ❌ Client Side (Failing)

1. Browser attempts to follow redirect to `http://localhost:8080/callback`
2. **No server listening on localhost:8080**
3. Browser shows `net::ERR_ABORTED`
4. User sees "login button not responding"

## Network Request Details

```
Request: GET /oauth/authorize?client_id=vscode-extension&response_type=code&redirect_uri=http://localhost:8080/callback&scope=memories:read+memories:write+memories:delete&code_challenge=...&code_challenge_method=S256&state=...

Response: 302 Found
Location: http://localhost:8080/callback?code=XOPjqbFHAKe1PmaS9vS9FHz8Pb18Om5Y9j56M6n0iCYWNw6gdUtAdhQLN1a0giTo&state=c7ce1acf9ce2d4de7233d8c5ca7085a0

Error: net::ERR_ABORTED (redirect target not reachable)
```

## Root Cause

The `vscode-extension` OAuth client is configured with:

- **Client ID**: `vscode-extension`
- **Redirect URI**: `http://localhost:8080/callback`
- **Flow**: Authorization Code with PKCE

**Problem**: This configuration expects a local callback server to be running on port 8080, but:

1. No local server is running
2. User is trying to login via web browser directly
3. The redirect fails because localhost:8080 isn't accessible

## Solutions

### Option 1: Add Web-Based Redirect URI (Recommended)

Add a web-accessible redirect URI for browser-based flows:

```sql
-- Update vscode-extension client to support both local and web redirects
UPDATE oauth_clients
SET redirect_uris = ARRAY[
    'http://localhost:8080/callback',  -- For CLI/VSCode extension
    'https://auth.lanonasis.com/oauth/callback',  -- For web-based login
    'https://app.lanonasis.com/auth/callback'  -- For web app
]
WHERE client_id = 'vscode-extension';
```

### Option 2: Create Separate Web Client

Create a dedicated OAuth client for web-based logins:

```sql
INSERT INTO oauth_clients (
    client_id,
    client_name,
    redirect_uris,
    grant_types,
    response_types,
    scope,
    is_public
) VALUES (
    'web-app',
    'LanOnasis Web Application',
    ARRAY['https://app.lanonasis.com/auth/callback'],
    ARRAY['authorization_code', 'refresh_token'],
    ARRAY['code'],
    'memories:read memories:write memories:delete profile',
    true
);
```

### Option 3: Implement Callback Server

If this is for VSCode extension, ensure the extension starts a local server:

```typescript
// In VSCode extension
import * as http from "http";

function startCallbackServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:8080`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (code && state) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Authorization successful! You can close this window.</h1>"
        );
        server.close();
        resolve(code);
      }
    });

    server.listen(8080, () => {
      console.log("Callback server listening on port 8080");
    });
  });
}
```

## Immediate Fix

The quickest fix is to update the web login flow to use a web-accessible redirect URI:

1. **Check current OAuth client configuration**
2. **Add web redirect URI** to the vscode-extension client
3. **Update login page** to detect context and use appropriate redirect_uri

## Files to Check/Update

1. `migrations/007_add_mcp_oauth_clients.sql` - OAuth client configuration
2. `src/routes/oauth.routes.ts` - OAuth authorize endpoint
3. `src/routes/web.routes.ts` - Web login page
4. `src/controllers/oauth.controller.ts` - OAuth flow logic

## Testing Steps

1. Check OAuth client configuration in database
2. Verify redirect_uris for vscode-extension client
3. Test with web-accessible redirect URI
4. Ensure PKCE validation still works
5. Test both CLI and web flows

---

**Status**: Issue identified - OAuth server working, redirect target unreachable  
**Priority**: HIGH - Blocking user login  
**Next Step**: Check OAuth client configuration and add web redirect URI
