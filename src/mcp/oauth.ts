/**
 * MCP OAuth Bridge
 * Handles OAuth authentication for MCP integrations
 * Similar to HubSpot's OAuth bridge implementation
 */

import express from 'express';
import crypto from 'crypto';
import { Request, Response } from 'express';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string[];
}

interface OAuthSession {
  state: string;
  codeVerifier?: string;
  codeChallenge?: string;
  redirectUri: string;
  timestamp: number;
}

export class MCPOAuthBridge {
  private sessions: Map<string, OAuthSession> = new Map();
  private config: OAuthConfig;

  constructor(config: Partial<OAuthConfig> = {}) {
    this.config = {
      clientId: config.clientId || process.env.MCP_CLIENT_ID || 'lanonasis-mcp-client',
      clientSecret: config.clientSecret || process.env.MCP_CLIENT_SECRET || '',
      redirectUri: config.redirectUri || 'https://mcp.lanonasis.com/auth/callback',
      authorizationUrl: config.authorizationUrl || 'https://auth.lanonasis.com/v1/auth/authorize',
      tokenUrl: config.tokenUrl || 'https://auth.lanonasis.com/v1/auth/token',
      scope: config.scope || ['mcp', 'memory', 'api_keys']
    };

    // Clean up expired sessions periodically
    setInterval(() => this.cleanupSessions(), 60000); // Every minute
  }

  /**
   * Generate PKCE challenge
   */
  private generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    return { verifier, challenge };
  }

  /**
   * Generate state parameter
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Handle OAuth authorization request
   */
  public handleAuthRequest(req: Request, res: Response) {
    const {
      client_id,
      redirect_uri,
      scope,
      state: clientState,
      code_challenge,
      code_challenge_method
    } = req.query;

    // Generate internal state
    const state = this.generateState();
    
    // Store session
    const session: OAuthSession = {
      state,
      codeChallenge: code_challenge as string,
      redirectUri: redirect_uri as string || this.config.redirectUri,
      timestamp: Date.now()
    };

    this.sessions.set(state, session);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: client_id as string || this.config.clientId,
      redirect_uri: session.redirectUri,
      response_type: 'code',
      scope: scope as string || this.config.scope.join(' '),
      state: state,
      ...(code_challenge && { code_challenge: code_challenge as string }),
      ...(code_challenge_method && { code_challenge_method: code_challenge_method as string }),
      ...(clientState && { original_state: clientState as string })
    });

    const authUrl = `${this.config.authorizationUrl}?${params.toString()}`;
    
    // Redirect to authorization server
    res.redirect(authUrl);
  }

  /**
   * Handle OAuth callback
   */
  public async handleCallback(req: Request, res: Response) {
    const { code, state, error, error_description } = req.query;

    // Handle errors
    if (error) {
      return res.status(400).json({
        error: error as string,
        error_description: error_description as string
      });
    }

    // Validate state
    const session = this.sessions.get(state as string);
    if (!session) {
      return res.status(400).json({
        error: 'invalid_state',
        error_description: 'State parameter mismatch'
      });
    }

    // Clean up session
    this.sessions.delete(state as string);

    try {
      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(
        code as string,
        session.redirectUri,
        session.codeVerifier
      );

      // Return success page with token
      res.send(this.generateSuccessPage(tokenResponse));
    } catch (error: any) {
      res.status(500).json({
        error: 'token_exchange_failed',
        error_description: error.message
      });
    }
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...(codeVerifier && { code_verifier: codeVerifier })
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Token exchange failed');
    }

    return response.json();
  }

  /**
   * Generate success page HTML
   */
  private generateSuccessPage(tokenData: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>MCP Authentication Successful</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 400px;
        }
        h1 {
            color: #2d3748;
            margin-bottom: 1rem;
        }
        .success-icon {
            width: 60px;
            height: 60px;
            margin: 0 auto 1rem;
            background: #48bb78;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .checkmark {
            color: white;
            font-size: 30px;
        }
        .message {
            color: #4a5568;
            margin-bottom: 1.5rem;
        }
        .token-info {
            background: #f7fafc;
            padding: 1rem;
            border-radius: 5px;
            margin-bottom: 1rem;
            word-break: break-all;
            font-family: monospace;
            font-size: 12px;
        }
        button {
            background: #667eea;
            color: white;
            border: none;
            padding: 0.75rem 2rem;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background: #5a67d8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">
            <span class="checkmark">✓</span>
        </div>
        <h1>Authentication Successful!</h1>
        <p class="message">
            Your MCP integration with Onasis has been authorized successfully.
            You can now close this window and return to your application.
        </p>
        <div class="token-info" id="tokenInfo">
            Access Token: ${tokenData.access_token.substring(0, 20)}...
        </div>
        <button onclick="window.close()">Close Window</button>
    </div>
    <script>
        // Post message to parent window if opened as popup
        if (window.opener) {
            window.opener.postMessage({
                type: 'mcp_auth_success',
                data: ${JSON.stringify(tokenData)}
            }, '*');
        }
        
        // Auto-close after 5 seconds
        setTimeout(() => {
            window.close();
        }, 5000);
    </script>
</body>
</html>`;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupSessions() {
    const now = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutes

    for (const [state, session] of this.sessions.entries()) {
      if (now - session.timestamp > timeout) {
        this.sessions.delete(state);
      }
    }
  }

  /**
   * Create Express router for OAuth endpoints
   */
  public createRouter(): express.Router {
    const router = express.Router();

    // OAuth bridge endpoint (like HubSpot's)
    router.get('/oauth-bridge', (req, res) => {
      this.handleAuthRequest(req, res);
    });

    // OAuth callback endpoint
    router.get('/auth/callback', async (req, res) => {
      await this.handleCallback(req, res);
    });

    // Token introspection endpoint
    router.post('/auth/introspect', async (req, res) => {
      const { token } = req.body;
      
      // Validate token and return info
      // This would check against your token store
      res.json({
        active: true,
        scope: 'mcp memory api_keys',
        client_id: this.config.clientId,
        token_type: 'Bearer',
        exp: Math.floor(Date.now() / 1000) + 3600
      });
    });

    // Token refresh endpoint
    router.post('/auth/refresh', async (req, res) => {
      const { refresh_token } = req.body;
      
      // Refresh the token
      // This would validate and issue new tokens
      res.json({
        access_token: 'new_access_token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refresh_token
      });
    });

    return router;
  }
}

// Create default instance
export const oauthBridge = new MCPOAuthBridge();

// Export router factory
export function createOAuthRouter(config?: Partial<OAuthConfig>) {
  const bridge = new MCPOAuthBridge(config);
  return bridge.createRouter();
}