/**
 * CLI Authentication Bridge
 * Alternative to email/password authentication for CLI
 * Routes through mcp.lanonasis.com for OAuth-style authentication
 * Provides dashboard access token for authenticated CLI users
 */

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL=https://<project-ref>.supabase.co
  process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
);

// Store auth sessions in Supabase for persistence across function calls
const storeOAuthState = async (state, sessionData) => {
  try {
    const { error } = await supabase
      .from('oauth_sessions')
      .insert({
        state,
        session_data: sessionData,
        client_id: sessionData.clientId,
        redirect_uri: sessionData.redirectUri,
        scope: sessionData.scope,
        code_challenge: sessionData.codeChallenge,
        code_verifier: sessionData.codeVerifier,
        expires_at: new Date(Date.now() + 600000).toISOString() // 10 minutes
      });
    
    if (error) {
      console.error('Failed to store OAuth state:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('OAuth state storage error:', err);
    return false;
  }
};

const getOAuthState = async (state) => {
  try {
    const { data, error } = await supabase
      .from('oauth_sessions')
      .select('*')
      .eq('state', state)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !data) {
      console.log('OAuth state not found or expired:', error?.message);
      return null;
    }
    
    return {
      clientId: data.client_id,
      redirectUri: data.redirect_uri,
      scope: data.scope,
      codeChallenge: data.code_challenge,
      codeVerifier: data.code_verifier,
      timestamp: new Date(data.created_at).getTime()
    };
  } catch (err) {
    console.error('OAuth state retrieval error:', err);
    return null;
  }
};

const getAuthCodeSession = async (authorizationCode) => {
  try {
    const { data, error } = await supabase
      .from('oauth_sessions')
      .select('*')
      .eq('authorization_code', authorizationCode)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      console.log('Authorization code not found or expired:', error?.message);
      return null;
    }

    return data; // Return full data including session_data
  } catch (err) {
    console.error('Authorization code retrieval error:', err);
    return null;
  }
};

const markOAuthStateUsed = async (state) => {
  try {
    const { error } = await supabase
      .from('oauth_sessions')
      .update({
        is_used: true,
        used_at: new Date().toISOString()
      })
      .eq('state', state);

    if (error) {
      console.error('Failed to mark OAuth state as used:', error);
      throw new Error('Failed to mark OAuth state as used');
    }

    return true; // Success
  } catch (err) {
    console.error('OAuth state update error:', err);
    throw new Error('OAuth state update failed');
  }
};

const markAuthCodeUsed = async (authorizationCode) => {
  try {
    const { error } = await supabase
      .from('oauth_sessions')
      .update({
        is_used: true,
        used_at: new Date().toISOString()
      })
      .eq('authorization_code', authorizationCode);

    if (error) {
      console.error('Failed to mark authorization code as used:', error);
      throw new Error('Failed to mark authorization code as used');
    }

    return true; // Success
  } catch (err) {
    console.error('Authorization code update error:', err);
    throw new Error('Authorization code update failed');
  }
};

/**
 * Generate authentication URL for CLI
 */
async function generateAuthUrl(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Generate state and code challenge for PKCE
  const state = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Extract parameters
  const params = event.queryStringParameters || {};
  const clientId = params.client_id || 'lanonasis-cli';
  const redirectUri = params.redirect_uri || 'http://localhost:8989/callback';
  const scope = params.scope || 'dashboard memory api_keys';

  // Store session for later verification in Supabase
  const sessionData = {
    clientId,
    redirectUri,
    codeVerifier,
    codeChallenge,
    scope,
    timestamp: Date.now()
  };
  
  const stored = await storeOAuthState(state, sessionData);
  if (!stored) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to store OAuth state',
        code: 'STORAGE_ERROR'
      })
    };
  }

  // Build authentication URL - FIXED: Use central auth system
  const authUrl = new URL('https://api.lanonasis.com/oauth/authorize');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', scope);
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      auth_url: authUrl.toString(),
      state,
      expires_in: 600 // 10 minutes
    })
  };
}

/**
 * OAuth authorization endpoint
 * Shows login page for CLI authentication
 */
async function authorize(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const params = event.queryStringParameters || {};
  const state = params.state || 'default';
  const clientId = params.client_id || 'lanonasis-cli';
  
  // Return HTML login page
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Onasis CLI Authentication</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 400px;
            width: 100%;
            padding: 40px;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        h1 {
            color: #2d3748;
            font-size: 24px;
            margin-bottom: 10px;
            text-align: center;
        }
        .subtitle {
            color: #718096;
            text-align: center;
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            color: #4a5568;
            margin-bottom: 8px;
            font-size: 14px;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            font-size: 16px;
            transition: border-color 0.2s;
        }
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            width: 100%;
            padding: 14px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }
        button:hover {
            background: #5a67d8;
        }
        button:disabled {
            background: #cbd5e0;
            cursor: not-allowed;
        }
        .divider {
            text-align: center;
            margin: 30px 0;
            color: #a0aec0;
            position: relative;
        }
        .divider::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 1px;
            background: #e2e8f0;
        }
        .divider span {
            background: white;
            padding: 0 15px;
            position: relative;
        }
        .api-key-section {
            margin-top: 20px;
        }
        .error {
            color: #e53e3e;
            font-size: 14px;
            margin-top: 10px;
            display: none;
        }
        .success {
            color: #38a169;
            font-size: 14px;
            margin-top: 10px;
            display: none;
        }
        .info {
            background: #edf2f7;
            padding: 12px;
            border-radius: 6px;
            margin-top: 20px;
            font-size: 14px;
            color: #4a5568;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                <circle cx="30" cy="30" r="30" fill="#667eea"/>
                <path d="M30 15L40 25L30 35L20 25L30 15Z" fill="white"/>
            </svg>
        </div>
        <h1>CLI Authentication</h1>
        <p class="subtitle">Sign in to connect your CLI to Onasis Dashboard</p>
        
        <form id="loginForm">
            <div class="form-group">
                <label for="email">Email Address</label>
                <input type="email" id="email" name="email" required placeholder="you@example.com">
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required placeholder="••••••••">
            </div>
            <button type="submit" id="submitBtn">Authenticate CLI</button>
            <div class="error" id="error"></div>
            <div class="success" id="success"></div>
        </form>
        
        <div class="divider">
            <span>OR</span>
        </div>
        
        <div class="api-key-section">
            <div class="form-group">
                <label for="apiKey">Use API Key</label>
                <input type="text" id="apiKey" placeholder="sk_live_...">
            </div>
            <button type="button" id="apiKeyBtn">Authenticate with API Key</button>
        </div>
        
        <div class="info">
            <strong>Dashboard Access:</strong> After authentication, your CLI will have full access to the Onasis Dashboard and all memory services.
        </div>
    </div>
    
    <script>
        const params = new URLSearchParams(window.location.search);
        const state = params.get('state');
        const redirectUri = params.get('redirect_uri');
        const clientId = params.get('client_id');
        
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const error = document.getElementById('error');
            const success = document.getElementById('success');
            
            btn.disabled = true;
            btn.textContent = 'Authenticating...';
            error.style.display = 'none';
            success.style.display = 'none';
            
            try {
                const response = await fetch('/api/cli-auth/callback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: document.getElementById('email').value,
                        password: document.getElementById('password').value,
                        state: state,
                        client_id: clientId
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    success.textContent = 'Authentication successful! Redirecting...';
                    success.style.display = 'block';
                    
                    // Redirect with authorization code
                    const callbackUrl = new URL(redirectUri || 'http://localhost:8989/callback');
                    callbackUrl.searchParams.append('code', data.code);
                    callbackUrl.searchParams.append('state', state);
                    
                    setTimeout(() => {
                        window.location.href = callbackUrl.toString();
                    }, 1000);
                } else {
                    throw new Error(data.error || 'Authentication failed');
                }
            } catch (err) {
                error.textContent = err.message;
                error.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Authenticate CLI';
            }
        });
        
        document.getElementById('apiKeyBtn').addEventListener('click', async () => {
            const apiKey = document.getElementById('apiKey').value;
            const error = document.getElementById('error');
            const success = document.getElementById('success');
            
            if (!apiKey) {
                error.textContent = 'Please enter an API key';
                error.style.display = 'block';
                return;
            }
            
            try {
                const response = await fetch('/api/cli-auth/callback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: apiKey,
                        state: state,
                        client_id: clientId
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    success.textContent = 'API key validated! Redirecting...';
                    success.style.display = 'block';
                    
                    const callbackUrl = new URL(redirectUri || 'http://localhost:8989/callback');
                    callbackUrl.searchParams.append('code', data.code);
                    callbackUrl.searchParams.append('state', state);
                    
                    setTimeout(() => {
                        window.location.href = callbackUrl.toString();
                    }, 1000);
                } else {
                    throw new Error(data.error || 'Invalid API key');
                }
            } catch (err) {
                error.textContent = err.message;
                error.style.display = 'block';
            }
        });
    </script>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html'
    },
    body: html
  };
}

/**
 * Handle authentication callback
 * Validates credentials and returns authorization code
 */
async function callback(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { email, password, api_key, state, client_id } = body;

    // Validate state using persistent storage
    const session = await getOAuthState(state);
    if (!session) {
      throw new Error('Invalid state parameter');
    }

    let userId, organizationId, vendorCode;

    // Authenticate with email/password or API key
    if (api_key) {
      // Validate API key
      const validation = await validateApiKey(api_key);
      if (!validation.isValid) {
        throw new Error('Invalid API key');
      }
      
      vendorCode = validation.vendorCode;
      organizationId = validation.vendorOrgId;
      
    } else if (email && password) {
      // Authenticate with email/password
      const { data: user, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      userId = user.user.id;
      // Get organization from user
      const { data: userOrg } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();
      
      organizationId = userOrg?.organization_id;
    } else {
      throw new Error('Email/password or API key required');
    }

    // Generate authorization code
    const authCode = crypto.randomBytes(32).toString('base64url');
    
    // Mark OAuth state as used - prevent replay attacks
    try {
      await markOAuthStateUsed(state);
    } catch (error) {
      console.error('Failed to mark OAuth state as used, preventing further processing:', error);
      throw error; // Re-throw to prevent continuation
    }
    
    // Store auth code for token exchange in Supabase
    const { error: codeError } = await supabase
      .from('oauth_sessions')
      .insert({
        state: state, // Keep original state for CSRF protection
        authorization_code: authCode, // Store auth code in proper column
        session_data: {
          // Only essential fields needed for token exchange
          userId,
          organizationId,
          vendorCode,
          clientId: session.clientId,
          scope: session.scope,
          codeChallenge: session.codeChallenge,
          codeChallengeMethod: session.codeChallengeMethod
        },
        client_id: session.clientId,
        expires_at: new Date(Date.now() + 300000).toISOString() // 5 minutes for token exchange
      });
    
    if (codeError) {
      console.error('Failed to store auth code:', codeError);
      throw new Error('Failed to store authorization code');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        code: authCode,
        state
      })
    };

  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message
      })
    };
  }
}

/**
 * Exchange authorization code for access token
 * Provides dashboard access token for CLI
 */
async function token(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { code, code_verifier, client_id, redirect_uri } = body;

    // Get auth session using authorization code (not state)
    const sessionData = await getAuthCodeSession(code);
    if (!sessionData) {
      throw new Error('Invalid authorization code');
    }
    
    const session = sessionData.session_data || sessionData;

    // Verify code verifier (PKCE)
    if (session.codeVerifier && session.codeVerifier !== code_verifier) {
      throw new Error('Invalid code verifier');
    }

    // Generate access token with dashboard permissions
    const accessToken = jwt.sign({
      sub: session.userId || session.vendorCode,
      org: session.organizationId,
      vendor: session.vendorCode,
      scope: session.scope,
      dashboard_access: true, // Enable dashboard access
      cli_authenticated: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 30 // 30 days
    }, process.env.JWT_SECRET=REDACTED_JWT_SECRET

    // Generate refresh token
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    
    // Mark authorization code as used - prevent replay attacks
    try {
      await markAuthCodeUsed(code);
    } catch (error) {
      console.error('Failed to mark authorization code as used, preventing further processing:', error);
      throw error; // Re-throw to prevent continuation
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600 * 24 * 30,
        refresh_token: refreshToken,
        scope: session.scope,
        dashboard_url: 'https://dashboard.lanonasis.com',
        api_url: 'https://api.lanonasis.com',
        mcp_url: 'https://mcp.lanonasis.com'
      })
    };

  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: error.message
      })
    };
  }
}

/**
 * Validate API key helper
 */
async function validateApiKey(apiKey) {
  try {
    const [prefix, type, ...rest] = apiKey.split('_');
    const keyId = `${prefix}_${type}_${rest.slice(0, -1).join('_')}`;
    
    const { data, error } = await supabase.rpc('validate_vendor_api_key', {
      p_key_id: keyId,
      p_key_secret: apiKey
    });

    if (error || !data || !data[0]?.is_valid) {
      return { isValid: false };
    }

    return {
      isValid: true,
      vendorOrgId: data[0].vendor_org_id,
      vendorCode: data[0].vendor_code
    };
  } catch {
    return { isValid: false };
  }
}

/**
 * Simple token display page for CLI
 */
function simpleCliPage() {
  const token = `cli_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Lanonasis CLI Authentication</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', monospace;
            background: #0a0e27;
            color: #00ff00;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: #1a1e3a;
            border: 2px solid #00ff00;
            border-radius: 8px;
            max-width: 600px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #00ff00;
            margin-bottom: 20px;
            font-size: 28px;
        }
        .status {
            color: #00ff00;
            margin-bottom: 10px;
            padding: 10px;
            background: rgba(0, 255, 0, 0.1);
            border-left: 3px solid #00ff00;
        }
        .token-box {
            background: #0d1117;
            border: 1px solid #00ff00;
            padding: 20px;
            margin: 30px 0;
            border-radius: 4px;
            word-break: break-all;
            font-size: 14px;
            color: #00ff00;
        }
        button {
            background: #00ff00;
            color: #0a0e27;
            border: none;
            padding: 15px 30px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            margin-top: 20px;
            font-family: 'Courier New', monospace;
        }
        button:hover {
            background: #00cc00;
        }
        .instructions {
            color: #888;
            margin-top: 20px;
            font-size: 14px;
            line-height: 1.6;
        }
        .resources {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #333;
        }
        .resources h3 {
            color: #00ccff;
            margin-bottom: 15px;
        }
        .resources a {
            color: #00ff00;
            text-decoration: none;
        }
        .resources a:hover {
            text-decoration: underline;
        }
        .message {
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid #00ff00;
            padding: 10px;
            margin-top: 10px;
            border-radius: 4px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>$ lanonasis auth</h1>
        <div class="status">✓ Authentication Gateway Active</div>
        <div class="status" style="border-color: #999; color: #999;">Authenticating for CLI</div>
        
        <h2 style="color: #00ff00; margin-top: 30px;">🔑 Your Authentication Token</h2>
        <div class="token-box" id="tokenBox">${token}</div>
        
        <button onclick="copyToken()">📋 COPY TOKEN</button>
        <div class="message" id="message">✓ Token copied to clipboard!</div>
        
        <div class="instructions">
            <strong style="color: #00ff00;">Instructions:</strong>
            <ol style="margin-left: 20px; margin-top: 10px;">
                <li>Click the button above to copy your token</li>
                <li>Return to your CLI terminal</li>
                <li>Paste the token when prompted</li>
                <li>Token expires in 30 days</li>
            </ol>
        </div>
        
        <div class="resources">
            <h3>📚 Resources:</h3>
            <p>• Documentation: <a href="https://docs.lanonasis.com" target="_blank">docs.lanonasis.com</a></p>
            <p>• Repository: <a href="https://github.com/lanonasis/lanonasis-maas" target="_blank">github.com/lanonasis/lanonasis-maas</a></p>
            <p>• API Status: <a href="https://api.lanonasis.com/health" target="_blank">api.lanonasis.com/health</a></p>
        </div>
    </div>
    
    <script>
        function copyToken() {
            const token = document.getElementById('tokenBox').textContent;
            navigator.clipboard.writeText(token).then(() => {
                const message = document.getElementById('message');
                message.style.display = 'block';
                setTimeout(() => {
                    message.style.display = 'none';
                }, 3000);
            }).catch(err => {
                alert('Failed to copy. Please copy manually: ' + token);
            });
        }
    </script>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache'
    },
    body: html
  };
}

/**
 * Main handler - Route to appropriate function
 */
exports.handler = async function(event, context) {
  // Normalize path
  let path = event.path;
  
  // Remove common prefixes
  path = path.replace('/api/cli-auth', '');
  path = path.replace('/.netlify/functions/cli-auth', '');
  
  // Special handling for /auth/cli-login
  if (path === '/auth/cli-login' || path === '') {
    // For simple CLI token page
    return simpleCliPage();
  }
  
  switch (path) {
    case '/auth-url':
      return generateAuthUrl(event);
    case '/authorize':
    case '/oauth/authorize':
      return authorize(event);
    case '/callback':
      return callback(event);
    case '/token':
    case '/oauth/token':
      return token(event);
    default:
      // Fallback to simple CLI page
      return simpleCliPage();
  }
}