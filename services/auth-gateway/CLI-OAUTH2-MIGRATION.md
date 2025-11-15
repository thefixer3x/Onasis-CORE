# CLI Browser Login → OAuth2 Migration Plan

## Current Implementation Analysis

### Location
`/opt/lanonasis/lanonasis-maas/cli/src/commands/auth.ts`

### Current Browser Login Flow (JWT-based)

```typescript
// Line ~490 in handleOAuthFlow()
const authBase = config.getDiscoveredApiUrl();
const authUrl = `${authBase.replace(/\/$/, '')}/auth/cli-login`;
```

**Current Endpoint:** `http://localhost:4000/auth/cli-login`
- Opens browser to JWT login page
- User authenticates
- Gets JWT token
- Pastes token back into CLI

## Proposed OAuth2 PKCE Flow

### New Endpoint Structure

```
Port 4000 (auth-gateway):
├─ /auth/cli-login      → JWT (keep for backward compatibility)
└─ /oauth/authorize     → OAuth2 PKCE (NEW browser login method)
   ├─ /oauth/token      → Exchange code for tokens
   └─ /oauth/introspect → Validate OAuth tokens
```

### OAuth2 PKCE CLI Flow

```
1. CLI generates code_verifier and code_challenge (PKCE)
2. CLI opens browser to /oauth/authorize with:
   - client_id: lanonasis-cli
   - response_type: code
   - redirect_uri: http://localhost:8888/callback (local listener)
   - code_challenge: SHA256(code_verifier)
   - code_challenge_method: S256
   - scope: read write

3. User authenticates in browser
4. Auth gateway redirects to: http://localhost:8888/callback?code=AUTH_CODE
5. CLI catches redirect with local server
6. CLI exchanges code for tokens at /oauth/token with:
   - code: AUTH_CODE
   - code_verifier: (original verifier)
   - grant_type: authorization_code

7. Store access_token + refresh_token
```

## Implementation Changes

### 1. Add OAuth2 Helper Functions

```typescript
// Add to auth.ts

import crypto from 'crypto';
import http from 'http';
import url from 'url';

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { verifier: string; challenge: string } {
  // Generate random verifier (43-128 chars, base64url)
  const verifier = crypto.randomBytes(32).toString('base64url');
  
  // Generate challenge: base64url(sha256(verifier))
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  
  return { verifier, challenge };
}

/**
 * Start local HTTP server to catch OAuth2 callback
 */
function createCallbackServer(port: number = 8888): Promise<{ code: string; state?: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url!, true);
      
      if (parsedUrl.pathname === '/callback') {
        const { code, state, error, error_description } = parsedUrl.query;
        
        // Send response to browser
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>❌ Authentication Failed</h1>
                <p>${error_description || error}</p>
                <p style="color: gray;">You can close this window.</p>
              </body>
            </html>
          `);
          reject(new Error(`OAuth error: ${error_description || error}`));
        } else if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>✅ Authentication Successful</h1>
                <p>You can close this window and return to the CLI.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);
          resolve({ code: code as string, state: state as string });
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid callback');
          reject(new Error('No authorization code received'));
        }
        
        // Close server after handling request
        server.close();
      }
    });
    
    server.listen(port, () => {
      console.log(chalk.gray(`   Local callback server listening on port ${port}`));
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout'));
    }, 300000);
  });
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  authBase: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const tokenEndpoint = `${authBase}/oauth/token`;
  
  const response = await apiClient.post(tokenEndpoint, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: 'lanonasis-cli',
    redirect_uri: 'http://localhost:8888/callback'
  });
  
  return response;
}
```

### 2. Update handleOAuthFlow Function

```typescript
async function handleOAuthFlow(config: CLIConfig): Promise<void> {
  console.log();
  console.log(chalk.yellow('🌐 Browser-Based OAuth2 Authentication'));
  console.log(chalk.gray('Secure authentication using OAuth2 with PKCE'));
  console.log();

  const { openBrowser } = await inquirer.prompt<{ openBrowser: boolean }>([
    {
      type: 'confirm',
      name: 'openBrowser',
      message: 'Open browser for OAuth2 authentication?',
      default: true
    }
  ]);

  if (!openBrowser) {
    console.log(chalk.yellow('⚠️  Authentication cancelled'));
    return;
  }

  try {
    // Generate PKCE challenge
    const pkce = generatePKCE();
    console.log(chalk.gray('   ✓ Generated PKCE challenge'));

    // Start local callback server
    const callbackPort = 8888;
    const callbackPromise = createCallbackServer(callbackPort);
    console.log(chalk.gray(`   ✓ Started local callback server on port ${callbackPort}`));

    // Build OAuth2 authorization URL
    const authBase = config.getDiscoveredApiUrl();
    const authUrl = new URL(`${authBase}/oauth/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', 'lanonasis-cli');
    authUrl.searchParams.set('redirect_uri', `http://localhost:${callbackPort}/callback`);
    authUrl.searchParams.set('scope', 'read write offline_access');
    authUrl.searchParams.set('code_challenge', pkce.challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));

    console.log();
    console.log(colors.info('Opening browser for authentication...'));
    await open(authUrl.toString());

    console.log(colors.info('Waiting for authentication in browser...'));
    console.log(colors.muted(`If browser doesn't open, visit: ${authUrl.toString()}`));
    console.log();

    // Wait for callback
    const spinner = ora('Waiting for authorization...').start();
    const { code } = await callbackPromise;
    spinner.succeed('Authorization code received');

    // Exchange code for tokens
    spinner.text = 'Exchanging code for access tokens...';
    spinner.start();
    const tokens = await exchangeCodeForTokens(code, pkce.verifier, authBase);
    spinner.succeed('Access tokens received');

    // Store tokens
    await config.setToken(tokens.access_token);
    await config.set('refresh_token', tokens.refresh_token);
    await config.set('token_expires_at', Date.now() + (tokens.expires_in * 1000));
    await config.set('authMethod', 'oauth2');

    console.log();
    console.log(chalk.green('✓ OAuth2 authentication successful'));
    console.log(colors.info('You can now use Lanonasis services'));

  } catch (error) {
    console.error(chalk.red('✖ OAuth2 authentication failed'));
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.gray(`   ${errorMessage}`));
    process.exit(1);
  }
}
```

### 3. Add OAuth2 Token Refresh Support

```typescript
/**
 * Refresh OAuth2 access token using refresh token
 */
async function refreshOAuth2Token(config: CLIConfig): Promise<boolean> {
  const refreshToken = config.get<string>('refresh_token');
  if (!refreshToken) {
    return false;
  }

  try {
    const authBase = config.getDiscoveredApiUrl();
    const response = await apiClient.post(`${authBase}/oauth/token`, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: 'lanonasis-cli'
    });

    await config.setToken(response.access_token);
    if (response.refresh_token) {
      await config.set('refresh_token', response.refresh_token);
    }
    await config.set('token_expires_at', Date.now() + (response.expires_in * 1000));

    return true;
  } catch (error) {
    console.error(chalk.yellow('⚠️  Token refresh failed, please re-authenticate'));
    return false;
  }
}
```

### 4. Update Config Validation

```typescript
// Add to CLIConfig class

async isAuthenticated(): Promise<boolean> {
  const authMethod = this.get<string>('authMethod');
  
  if (authMethod === 'oauth2') {
    const tokenExpiresAt = this.get<number>('token_expires_at');
    
    // Check if token is expired
    if (tokenExpiresAt && Date.now() >= tokenExpiresAt) {
      console.log(chalk.yellow('Token expired, attempting refresh...'));
      return await refreshOAuth2Token(this);
    }
  }
  
  // Existing JWT validation logic
  const token = this.getToken();
  return !!token;
}
```

## Auth Gateway Changes Required

### 1. Register CLI as OAuth2 Client

```sql
-- Add to auth-gateway database
INSERT INTO oauth_clients (
  client_id,
  client_name,
  client_type,
  redirect_uris,
  allowed_scopes,
  require_pkce,
  created_at
) VALUES (
  'lanonasis-cli',
  'Lanonasis CLI',
  'public',  -- Public client (no client secret)
  ARRAY['http://localhost:8888/callback', 'http://localhost:9999/callback'],
  ARRAY['read', 'write', 'offline_access'],
  true,
  NOW()
);
```

### 2. Update CORS Configuration

```bash
# In /opt/lanonasis/onasis-core/services/auth-gateway/.env
CORS_ORIGIN="https://dashboard.lanonasis.com,https://mcp.lanonasis.com,https://docs.lanonasis.com,https://auth.lanonasis.com,http://localhost:8888,http://localhost:9999"
```

## Migration Strategy

### Phase 1: Add OAuth2 Support (Non-Breaking)

1. ✅ OAuth2 endpoints already active on port 4000
2. ⏳ Register CLI OAuth2 client in database
3. ⏳ Update CLI code to support OAuth2 flow
4. ⏳ Keep existing JWT flow as fallback

### Phase 2: Test Both Methods

```bash
# Test JWT (existing)
onasis auth login
→ Choose: Username/Password

# Test OAuth2 (new)
onasis auth login
→ Choose: Browser Login (OAuth2 PKCE)
```

### Phase 3: Gradual Migration

- Keep both methods available
- Users choose preferred method
- Recommend OAuth2 for new installations
- Migrate existing users gradually

## Dependencies to Add

```json
{
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

(crypto, http, url are Node.js built-ins - no install needed)

## Testing Checklist

- [ ] Generate PKCE verifier/challenge
- [ ] Start local callback server
- [ ] Open browser to /oauth/authorize
- [ ] Complete authentication in browser
- [ ] Catch authorization code
- [ ] Exchange code for tokens
- [ ] Store access + refresh tokens
- [ ] Validate OAuth2 token with API
- [ ] Refresh expired token automatically
- [ ] Handle errors gracefully

## Benefits of OAuth2 PKCE

✅ More secure (no secrets in CLI)
✅ Revocable tokens
✅ Automatic refresh
✅ Industry standard
✅ Better UX (browser-based)
✅ Fine-grained scopes
✅ Audit trail
