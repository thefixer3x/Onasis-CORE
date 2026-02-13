/**
 * Supabase OAuth 2.1 Provider - Consent Routes
 *
 * Authorization path for Supabase OAuth Server feature.
 * Handles the complete authorization flow: login + consent.
 *
 * Supabase Dashboard Config:
 * - Site URL: https://auth.lanonasis.com
 * - Authorization Path: /oauth/consent
 * - Preview URL: https://auth.lanonasis.com/oauth/consent
 *
 * Flow:
 * 1. MCP Client -> Supabase /oauth/authorize (with PKCE)
 * 2. Supabase validates -> redirects to /oauth/consent?authorization_id=xxx
 * 3. User logs in (if needed) via this page
 * 4. Page calls getAuthorizationDetails() to fetch client info
 * 5. User reviews scopes and approves/denies
 * 6. Page calls approveAuthorization() or denyAuthorization()
 * 7. Supabase redirects back to client with auth code
 *
 * @see https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
 */

import express from 'express'
import crypto from 'crypto'
import { env } from '../../config/env.js'

const router = express.Router()

// Supabase project configuration (ptnrwrgzrsbocgxlpvhd - auth gateway project)
const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY

/**
 * GET /oauth/consent
 *
 * Main authorization consent endpoint.
 * This is the authorization_path configured in Supabase dashboard.
 */
router.get('/consent', (req, res) => {
  const { authorization_id } = req.query

  if (!authorization_id) {
    return res.status(400).send(renderErrorPage('Missing authorization_id parameter'))
  }

  // Generate nonce for CSP
  const nonce = crypto.randomBytes(16).toString('base64')
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self' ${SUPABASE_URL};`
  )

  res.send(renderConsentPage(authorization_id as string, nonce))
})

/**
 * Renders the terminal-style consent page
 */
function renderConsentPage(authorizationId: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize Application - Lanonasis</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      background: #0a0a0a;
      color: #00ff00;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
      padding: 20px;
    }

    .terminal {
      background: #1a1a1a;
      border: 2px solid #333;
      border-radius: 8px;
      padding: 20px;
      max-width: 560px;
      width: 100%;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.15);
      position: relative;
    }

    .terminal-header {
      border-bottom: 1px solid #333;
      padding-bottom: 10px;
      margin-bottom: 15px;
      color: #888;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .red { background: #ff5f56; }
    .yellow { background: #ffbd2e; }
    .green { background: #27c93f; }

    .title {
      margin-left: auto;
      font-size: 11px;
      color: #666;
    }

    .terminal-content {
      font-size: 13px;
      line-height: 1.5;
    }

    .line {
      margin: 4px 0;
      display: flex;
      align-items: flex-start;
    }

    .prompt {
      color: #00ff00;
      font-weight: bold;
      margin-right: 8px;
      flex-shrink: 0;
    }

    .command {
      color: #fff;
    }

    .output {
      color: #888;
      padding-left: 20px;
    }

    .success { color: #27c93f; }
    .info { color: #00ffff; }
    .error { color: #ff5f56; }
    .warning { color: #ffbd2e; }
    .muted { color: #555; }

    .section {
      margin: 15px 0;
      padding: 12px;
      background: #0d0d0d;
      border: 1px solid #2a2a2a;
      border-radius: 4px;
    }

    .section-header {
      color: #ffbd2e;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .form-group {
      margin: 12px 0;
    }

    .form-label {
      color: #888;
      font-size: 11px;
      margin-bottom: 4px;
      display: block;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .form-input {
      background: #0a0a0a;
      border: 1px solid #333;
      border-radius: 4px;
      color: #00ff00;
      font-family: inherit;
      font-size: 13px;
      padding: 10px 12px;
      width: 100%;
      outline: none;
      transition: all 0.2s;
    }

    .form-input:focus {
      border-color: #00ff00;
      box-shadow: 0 0 3px rgba(0, 255, 0, 0.15);
    }

    .form-input::placeholder {
      color: #444;
    }

    .btn {
      background: #222;
      border: 1px solid #444;
      border-radius: 4px;
      color: #00ff00;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      padding: 10px 16px;
      transition: all 0.2s;
      width: 100%;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .btn:hover:not(:disabled) {
      background: #333;
      border-color: #00ff00;
      box-shadow: none;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #1a3a1a;
      border-color: #00ff00;
    }

    .btn-primary:hover:not(:disabled) {
      background: #2a5a2a;
    }

    .btn-danger {
      background: #3a1a1a;
      border-color: #ff5f56;
      color: #ff5f56;
    }

    .btn-danger:hover:not(:disabled) {
      background: #5a2a2a;
    }

    .btn-group {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }

    .btn-group .btn {
      flex: 1;
    }

    .client-row {
      display: flex;
      margin: 6px 0;
      font-size: 12px;
    }

    .client-label {
      color: #666;
      width: 100px;
      flex-shrink: 0;
    }

    .client-value {
      color: #00ffff;
      word-break: break-all;
    }

    .scope-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .scope-tag {
      background: #1a2a1a;
      border: 1px solid #27c93f;
      border-radius: 3px;
      color: #27c93f;
      font-size: 10px;
      padding: 4px 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .oauth-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 12px;
    }

    .oauth-btn {
      background: #0a0a0a;
      border: 1px solid #333;
      border-radius: 4px;
      color: #888;
      cursor: pointer;
      font-family: inherit;
      font-size: 10px;
      padding: 10px 8px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .oauth-btn:hover:not(:disabled) {
      background: #1a1a1a;
      border-color: #00ff00;
      color: #00ff00;
    }

    .oauth-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .oauth-icon {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 15px 0;
    }

    .divider-line {
      flex: 1;
      height: 1px;
      background: #333;
    }

    .divider-text {
      color: #555;
      font-size: 10px;
      letter-spacing: 1px;
    }

    .hidden { display: none; }

    .blink {
      animation: blink 1.2s ease-in-out infinite;
    }

    @keyframes blink {
      0%, 45% { opacity: 1; }
      50%, 95% { opacity: 0.3; }
      100% { opacity: 1; }
    }

    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid #333;
      border-top-color: #00ff00;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .typing {
      overflow: hidden;
      white-space: nowrap;
      animation: typing 0.5s steps(20);
    }

    @keyframes typing {
      from { width: 0; }
      to { width: 100%; }
    }

    .log-entry {
      font-size: 11px;
      margin: 3px 0;
      padding-left: 20px;
    }

    .log-time {
      color: #555;
      margin-right: 8px;
    }

    @media (max-width: 480px) {
      .oauth-grid {
        grid-template-columns: 1fr;
      }
      .btn-group {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="terminal">
    <div class="terminal-header">
      <span class="dot red"></span>
      <span class="dot yellow"></span>
      <span class="dot green"></span>
      <span class="title">auth.connectionpoint.tech ~ oauth/consent</span>
    </div>

    <div class="terminal-content">
      <!-- Command Line -->
      <div class="line">
        <span class="prompt">$</span>
        <span class="command">lanonasis oauth consent --authorize</span>
      </div>

      <!-- Initial Output -->
      <div class="log-entry success" id="log-init">
        <span class="log-time">[init]</span> OAuth 2.1 Authorization Server Active
      </div>
      <div class="log-entry" id="log-request">
        <span class="log-time">[recv]</span> <span class="muted">Authorization request received</span>
      </div>

      <!-- ============================================ -->
      <!-- LOADING STATE -->
      <!-- ============================================ -->
      <div id="state-loading">
        <div class="log-entry info">
          <span class="log-time">[auth]</span> <span class="spinner"></span>Checking session...
        </div>
      </div>

      <!-- ============================================ -->
      <!-- ERROR STATE -->
      <!-- ============================================ -->
      <div id="state-error" class="hidden">
        <div class="log-entry error">
          <span class="log-time">[fail]</span> <span id="error-msg">An error occurred</span>
        </div>
        <br>
        <div class="output muted">Close this window and try again.</div>
      </div>

      <!-- ============================================ -->
      <!-- LOGIN STATE -->
      <!-- ============================================ -->
      <div id="state-login" class="hidden">
        <div class="log-entry warning">
          <span class="log-time">[auth]</span> Authentication required
        </div>

        <div class="section">
          <div class="section-header">
            <span>&#128274;</span> Sign In to Continue
          </div>

          <form id="login-form">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="email" class="form-input" placeholder="user@domain.com" required autocomplete="email">
            </div>

            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="password" class="form-input" placeholder="Enter password" required autocomplete="current-password">
            </div>

            <button type="submit" class="btn btn-primary" id="login-btn">
              Authenticate
            </button>

            <div id="login-error" class="log-entry error hidden" style="margin-top: 10px;"></div>
          </form>

          <div class="divider">
            <span class="divider-line"></span>
            <span class="divider-text">OR</span>
            <span class="divider-line"></span>
          </div>

          <div class="oauth-grid">
            <button type="button" class="oauth-btn" data-provider="google">
              <svg class="oauth-icon" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </button>
            <button type="button" class="oauth-btn" data-provider="github">
              <svg class="oauth-icon" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
              GitHub
            </button>
          </div>
        </div>
      </div>

      <!-- ============================================ -->
      <!-- CONSENT STATE -->
      <!-- ============================================ -->
      <div id="state-consent" class="hidden">
        <div class="log-entry success">
          <span class="log-time">[auth]</span> Session verified
        </div>
        <div class="log-entry">
          <span class="log-time">[user]</span> <span class="info" id="user-email">user@domain.com</span>
        </div>
        <div class="log-entry">
          <span class="log-time">[fetch]</span> Loading authorization details...
        </div>

        <div class="section">
          <div class="section-header">
            <span>&#128279;</span> Application Requesting Access
          </div>

          <div class="client-row">
            <span class="client-label">Client:</span>
            <span class="client-value" id="client-name">Loading...</span>
          </div>
          <div class="client-row">
            <span class="client-label">Client ID:</span>
            <span class="client-value" id="client-id">Loading...</span>
          </div>
          <div class="client-row" id="redirect-row">
            <span class="client-label">Redirect:</span>
            <span class="client-value" id="redirect-uri">Loading...</span>
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <span>&#128203;</span> Requested Permissions
          </div>
          <div class="output" style="padding-left: 0; font-size: 11px; margin-bottom: 8px;">
            This application will be able to:
          </div>
          <div class="scope-list" id="scope-list">
            <!-- Scopes rendered here -->
          </div>
        </div>

        <div class="btn-group">
          <button type="button" class="btn btn-danger" id="deny-btn">
            Deny
          </button>
          <button type="button" class="btn btn-primary" id="approve-btn">
            Authorize
          </button>
        </div>

        <div id="consent-error" class="log-entry error hidden" style="margin-top: 10px;"></div>
      </div>

      <!-- ============================================ -->
      <!-- SUCCESS STATE -->
      <!-- ============================================ -->
      <div id="state-success" class="hidden">
        <div class="log-entry success">
          <span class="log-time">[done]</span> Authorization granted
        </div>
        <div class="log-entry info">
          <span class="log-time">[redir]</span> <span class="spinner"></span>Redirecting to application...
        </div>
      </div>

      <!-- ============================================ -->
      <!-- DENIED STATE -->
      <!-- ============================================ -->
      <div id="state-denied" class="hidden">
        <div class="log-entry error">
          <span class="log-time">[deny]</span> Authorization denied by user
        </div>
        <div class="log-entry muted">
          <span class="log-time">[info]</span> You can close this window
        </div>
      </div>

      <!-- Footer prompt -->
      <br>
      <div class="line">
        <span class="prompt">$</span>
        <span class="blink">_</span>
      </div>
    </div>
  </div>

  <!-- Supabase JS SDK -->
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

  <script nonce="${nonce}">
    // Configuration
    const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
    const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
    const SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};

    // Initialize Supabase
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // State refs
    let authDetails = null;

    // DOM helpers
    const $ = (id) => document.getElementById(id);
    const show = (id) => $(id).classList.remove('hidden');
    const hide = (id) => $(id).classList.add('hidden');

    function showState(state) {
      ['loading', 'error', 'login', 'consent', 'success', 'denied'].forEach(s => {
        hide('state-' + s);
      });
      show('state-' + state);
    }

    function showError(msg) {
      $('error-msg').textContent = msg;
      showState('error');
    }

    // Scope descriptions for display
    const scopeLabels = {
      'read': 'Read your data',
      'write': 'Create and modify data',
      'offline_access': 'Maintain access when offline',
      'memories:read': 'Read your memories',
      'memories:write': 'Create and update memories',
      'memories:delete': 'Delete memories',
      'mcp:full': 'Full MCP server access',
      'mcp:connect': 'Connect to MCP servers',
      'mcp:tools': 'Use MCP tools',
      'mcp:resources': 'Access MCP resources',
      'api:access': 'Access platform APIs',
      'profile': 'Read your profile info',
      'email': 'Access your email address'
    };

    // Initialize on load
    document.addEventListener('DOMContentLoaded', async () => {
      try {
        // Check session
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          $('user-email').textContent = session.user.email;
          await loadAuthorizationDetails();
        } else {
          showState('login');
          initLoginForm();
          initOAuthButtons();
          $('email').focus();
        }
      } catch (err) {
        console.error('Init error:', err);
        showError(err.message || 'Failed to initialize');
      }
    });

    // Auth state listener
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        $('user-email').textContent = session.user.email;
        await loadAuthorizationDetails();
      }
    });

    // Load authorization details from Supabase
    async function loadAuthorizationDetails() {
      try {
        showState('consent');

        const { data, error } = await supabase.auth.getAuthorizationDetails(AUTHORIZATION_ID);

        if (error) throw error;

        authDetails = data;

        // Populate client info
        $('client-name').textContent = data.client?.name || data.client_id || 'Unknown App';
        $('client-id').textContent = data.client_id || '-';

        if (data.redirect_uri) {
          $('redirect-uri').textContent = data.redirect_uri;
        } else {
          $('redirect-row').style.display = 'none';
        }

        // Populate scopes
        const scopeList = $('scope-list');
        scopeList.innerHTML = '';

        const scopes = data.scope ? data.scope.split(' ') : ['read'];
        scopes.forEach(scope => {
          const tag = document.createElement('span');
          tag.className = 'scope-tag';
          tag.textContent = scopeLabels[scope] || scope;
          tag.title = scope;
          scopeList.appendChild(tag);
        });

        initConsentButtons();

      } catch (err) {
        console.error('Auth details error:', err);
        showError(err.message || 'Failed to load authorization details');
      }
    }

    // Login form
    function initLoginForm() {
      $('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = $('login-btn');
        const email = $('email').value;
        const password = $('password').value;

        btn.disabled = true;
        btn.textContent = 'Authenticating...';
        hide('login-error');

        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });

          if (error) throw error;

          // Auth state listener will handle the rest
        } catch (err) {
          $('login-error').textContent = err.message || 'Login failed';
          show('login-error');
          btn.disabled = false;
          btn.textContent = 'Authenticate';
        }
      });
    }

    // OAuth buttons
    function initOAuthButtons() {
      document.querySelectorAll('.oauth-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const provider = btn.dataset.provider;
          btn.disabled = true;

          try {
            const redirectTo = window.location.href;

            const { error } = await supabase.auth.signInWithOAuth({
              provider,
              options: { redirectTo }
            });

            if (error) throw error;
          } catch (err) {
            console.error('OAuth error:', err);
            btn.disabled = false;
          }
        });
      });
    }

    // Consent buttons
    function initConsentButtons() {
      $('approve-btn').addEventListener('click', async () => {
        const btn = $('approve-btn');
        btn.disabled = true;
        btn.textContent = 'Authorizing...';
        $('deny-btn').disabled = true;
        hide('consent-error');

        try {
          const { data, error } = await supabase.auth.approveAuthorization(AUTHORIZATION_ID);

          if (error) throw error;

          showState('success');

          if (data?.redirect_to) {
            setTimeout(() => {
              window.location.href = data.redirect_to;
            }, 800);
          }
        } catch (err) {
          console.error('Approve error:', err);
          $('consent-error').textContent = err.message || 'Authorization failed';
          show('consent-error');
          btn.disabled = false;
          btn.textContent = 'Authorize';
          $('deny-btn').disabled = false;
        }
      });

      $('deny-btn').addEventListener('click', async () => {
        const btn = $('deny-btn');
        btn.disabled = true;
        btn.textContent = 'Denying...';
        $('approve-btn').disabled = true;

        try {
          // Try to deny via API if available, otherwise just show denied
          if (typeof supabase.auth.denyAuthorization === 'function') {
            await supabase.auth.denyAuthorization(AUTHORIZATION_ID);
          }
        } catch (err) {
          console.error('Deny error:', err);
        }

        showState('denied');
      });
    }
  </script>
</body>
</html>`;
}

/**
 * Renders error page
 */
function renderErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Lanonasis</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      background: #0a0a0a;
      color: #00ff00;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .terminal {
      background: #1a1a1a;
      border: 2px solid #333;
      border-radius: 8px;
      padding: 20px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 0 10px rgba(255, 95, 86, 0.15);
    }
    .terminal-header {
      border-bottom: 1px solid #333;
      padding-bottom: 10px;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .red { background: #ff5f56; }
    .yellow { background: #ffbd2e; }
    .green { background: #27c93f; }
    .prompt { color: #00ff00; font-weight: bold; }
    .command { color: #fff; }
    .error { color: #ff5f56; margin-top: 10px; font-size: 13px; }
    .muted { color: #555; font-size: 12px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="terminal">
    <div class="terminal-header">
      <span class="dot red"></span>
      <span class="dot yellow"></span>
      <span class="dot green"></span>
    </div>
    <div>
      <span class="prompt">$</span>
      <span class="command">lanonasis oauth consent</span>
    </div>
    <div class="error">[error] ${message}</div>
    <div class="muted">Close this window and try again.</div>
  </div>
</body>
</html>`;
}

export default router
