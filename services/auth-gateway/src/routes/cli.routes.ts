import express from "express";
import crypto from "crypto";
import * as mcpController from "../controllers/mcp.controller.js";

const router = express.Router();

// CLI authentication - GET route serves the login page
router.get("/cli-login", (req, res) => {
  const { platform: platformParam = "cli", redirect_url, return_to } = req.query;
  const platform: string = typeof platformParam === "string" ? platformParam : Array.isArray(platformParam) && typeof platformParam[0] === "string" ? platformParam[0] : "cli";
  const redirectUri = redirect_url || return_to || "cli://auth/callback";

  // Generate nonce for CSP
  const nonce = crypto.randomBytes(16).toString("base64");
  res.setHeader(
    "Content-Security-Policy",
    `script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'`
  );

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Lanonasis CLI Authentication</title>
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
          overflow: hidden;
        }

        .terminal {
          background: #1a1a1a;
          border: 2px solid #333;
          border-radius: 8px;
          padding: 20px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
          position: relative;
        }

        .terminal-header {
          border-bottom: 1px solid #333;
          padding-bottom: 10px;
          margin-bottom: 20px;
          color: #888;
          display: flex;
          align-items: center;
          gap: 10px;
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
          font-size: 12px;
        }

        .terminal-content {
          font-size: 14px;
          line-height: 1.6;
        }

        .prompt {
          color: #00ff00;
          font-weight: bold;
        }

        .command {
          color: #fff;
        }

        .output {
          color: #888;
          margin-left: 20px;
        }

        .success {
          color: #00ff00;
        }

        .info {
          color: #00ffff;
        }

        .error {
          color: #ff5f56;
        }

        .section-title {
          color: #ffbd2e;
          margin-top: 15px;
          margin-bottom: 10px;
          font-weight: bold;
        }

        .form-group {
          margin: 10px 0;
        }

        .form-label {
          color: #888;
          font-size: 12px;
          margin-bottom: 5px;
          display: block;
        }

        .form-input {
          background: #0a0a0a;
          border: 1px solid #333;
          border-radius: 4px;
          color: #00ff00;
          font-family: inherit;
          font-size: 14px;
          padding: 8px 12px;
          width: 100%;
          outline: none;
          transition: border-color 0.3s;
        }

        .form-input:focus {
          border-color: #00ff00;
          box-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
        }

        .form-input::placeholder {
          color: #555;
        }

        .btn {
          background: #333;
          border: 1px solid #555;
          border-radius: 4px;
          color: #00ff00;
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
          padding: 10px 20px;
          transition: all 0.3s;
          width: 100%;
          margin-top: 15px;
        }

        .btn:hover {
          background: #555;
          border-color: #00ff00;
          box-shadow: 0 0 10px rgba(0, 255, 0, 0.2);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mode-toggle {
          display: flex;
          background: #0a0a0a;
          border-radius: 4px;
          border: 1px solid #333;
          margin-bottom: 20px;
        }

        .mode-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
          padding: 8px;
          transition: all 0.3s;
        }

        .mode-btn.active {
          background: #333;
          color: #00ff00;
        }

        .hidden {
          display: none;
        }

        .blink {
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        .loading {
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        a {
          color: #00ffff;
          text-decoration: none;
        }

        a:hover {
          text-decoration: underline;
        }

        /* OAuth Styles */
        .oauth-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 20px 0 15px 0;
        }

        .divider-line {
          flex: 1;
          height: 1px;
          background: #333;
        }

        .divider-text {
          color: #888;
          font-size: 10px;
          letter-spacing: 1px;
          white-space: nowrap;
        }

        .oauth-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 15px;
        }

        .oauth-btn {
          background: #0a0a0a;
          border: 1px solid #333;
          border-radius: 4px;
          color: #888;
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          padding: 10px 8px;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .oauth-btn:hover {
          background: #1a1a1a;
          border-color: #00ff00;
          color: #00ff00;
          box-shadow: 0 0 10px rgba(0, 255, 0, 0.2);
        }

        .oauth-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .oauth-icon {
          width: 16px;
          height: 16px;
          fill: currentColor;
        }

        .oauth-text {
          font-size: 10px;
          letter-spacing: 0.5px;
        }

        /* CLI-specific styles */
        .token-display {
          background: #0a0a0a;
          padding: 15px;
          border: 1px solid #333;
          border-radius: 4px;
          margin: 15px 0;
          word-break: break-all;
          font-size: 12px;
          color: #00ff00;
        }

        .copy-btn {
          width: auto;
          padding: 8px 16px;
          margin: 10px auto 0;
          display: block;
          font-size: 12px;
        }

        @media (max-width: 480px) {
          .oauth-grid {
            grid-template-columns: 1fr;
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
          <span class="title">cli.lanonasis.com</span>
        </div>

        <div class="terminal-content">
          <div>
            <span class="prompt">$</span>
            <span class="command">lanonasis auth --platform=${platform}</span>
          </div>

          <br />

          <div class="output success">✓ Authentication Gateway Active</div>
          <div class="output">Authenticating for ${platform.toUpperCase()}</div>

          <div class="section-title">🔐 Authentication Required</div>

          <!-- Mode Toggle -->
          <div class="mode-toggle">
            <button class="mode-btn active" id="login-btn" onclick="setMode('login')">
              SIGN IN
            </button>
            <button class="mode-btn" id="signup-btn" onclick="setMode('signup')">
              SIGN UP
            </button>
          </div>

          <!-- Auth Form -->
          <form id="auth-form" onsubmit="handleSubmit(event)">
            <!-- Name Field (Sign Up Only) -->
            <div class="form-group hidden" id="name-group">
              <label class="form-label">FULL NAME:</label>
              <input
                type="text"
                id="name"
                class="form-input"
                placeholder="Enter your full name"
              />
            </div>

            <!-- Email Field -->
            <div class="form-group">
              <label class="form-label">EMAIL:</label>
              <input
                type="email"
                id="email"
                class="form-input"
                placeholder="user@domain.com"
                required
                autocomplete="email"
              />
            </div>

            <!-- Password Field -->
            <div class="form-group">
              <label class="form-label">PASSWORD:</label>
              <input
                type="password"
                id="password"
                class="form-input"
                placeholder="••••••••"
                required
                autocomplete="current-password"
              />
            </div>

            <!-- Submit Button -->
            <button type="submit" class="btn" id="submit-btn">
              <span id="submit-text">AUTHENTICATE</span>
            </button>

            <!-- Error/Success Message -->
            <div id="message" class="output" style="margin-top: 15px; margin-left: 0"></div>
          </form>

          <!-- OAuth Divider -->
          <div class="oauth-divider">
            <span class="divider-line"></span>
            <span class="divider-text">OR AUTHENTICATE WITH</span>
            <span class="divider-line"></span>
          </div>

          <!-- OAuth Providers -->
          <div class="oauth-grid">
            <button type="button" class="oauth-btn" data-provider="google">
              <svg class="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span class="oauth-text">GOOGLE</span>
            </button>

            <button type="button" class="oauth-btn" data-provider="github">
              <svg class="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              <span class="oauth-text">GITHUB</span>
            </button>

            <button type="button" class="oauth-btn" data-provider="linkedin_oidc">
              <svg class="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              <span class="oauth-text">LINKEDIN</span>
            </button>

            <button type="button" class="oauth-btn" data-provider="discord">
              <svg class="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span class="oauth-text">DISCORD</span>
            </button>

            <button type="button" class="oauth-btn" data-provider="apple">
              <svg class="oauth-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <span class="oauth-text">APPLE</span>
            </button>
          </div>

          <br />

          <div class="section-title">📚 Resources:</div>
          <div class="output">
            • Documentation: <a href="https://docs.lanonasis.com">docs.lanonasis.com</a>
          </div>
          <div class="output">
            • Repository: <a href="https://github.com/lanonasis/lanonasis-maas">github.com/lanonasis/lanonasis-maas</a>
          </div>

          <br />

          <div><span class="prompt">$</span> <span class="blink">_</span></div>
        </div>
      </div>

      <script nonce="${nonce}">
        // Auth state
        let currentMode = 'login';
        const platform = '${platform}';
        const redirectUri = '${redirectUri}';

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
          document.getElementById('email').focus();
          initializeOAuthButtons();
        });

        function setMode(mode) {
          currentMode = mode;
          const loginBtn = document.getElementById('login-btn');
          const signupBtn = document.getElementById('signup-btn');
          const nameGroup = document.getElementById('name-group');
          const submitText = document.getElementById('submit-text');

          if (mode === 'signup') {
            loginBtn.classList.remove('active');
            signupBtn.classList.add('active');
            nameGroup.classList.remove('hidden');
            submitText.textContent = 'CREATE ACCOUNT';
          } else {
            loginBtn.classList.add('active');
            signupBtn.classList.remove('active');
            nameGroup.classList.add('hidden');
            submitText.textContent = 'AUTHENTICATE';
          }

          clearMessage();
        }

        function showMessage(text, type = 'info') {
          const message = document.getElementById('message');
          message.innerHTML = text;
          message.className = \`output \${type}\`;
        }

        function clearMessage() {
          const message = document.getElementById('message');
          message.textContent = '';
        }

        function setLoading(loading) {
          const submitBtn = document.getElementById('submit-btn');
          const submitText = document.getElementById('submit-text');

          submitBtn.disabled = loading;

          if (loading) {
            submitText.textContent = 'PROCESSING...';
            submitBtn.classList.add('loading');
          } else {
            submitBtn.classList.remove('loading');
            submitText.textContent = currentMode === 'signup' ? 'CREATE ACCOUNT' : 'AUTHENTICATE';
          }
        }

        function copyToClipboard(text) {
          navigator.clipboard.writeText(text).then(() => {
            showMessage('✓ Token copied to clipboard!', 'success');
          }).catch(() => {
            showMessage('Failed to copy. Please copy manually.', 'error');
          });
        }

        async function handleSubmit(event) {
          event.preventDefault();
          clearMessage();
          setLoading(true);

          const email = document.getElementById('email').value;
          const password = document.getElementById('password').value;
          const name = document.getElementById('name').value;

          try {
            const endpoint = currentMode === 'signup' ? '/auth/cli-register' : '/auth/cli-login';
            const body = currentMode === 'signup'
              ? { email, password, confirm_password: password, name }
              : { email, password, platform };

            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.error || 'Authentication failed');
            }

            // CLI-specific: Display token for copying
            if (data.access_token || data.api_key) {
              const token = data.api_key || data.access_token;
              
              showMessage(
                '<strong>✅ Authentication Successful!</strong><br><br>' +
                '<div class="token-display">' + token + '</div>' +
                '<button class="copy-btn btn" onclick="copyToClipboard(\\'' + token + '\\')">📋 COPY TOKEN</button>' +
                '<br><br>' +
                '<small>Copy this token and paste it into your CLI when prompted.</small>',
                'success'
              );

              // Clear password fields
              document.getElementById('password').value = '';
              if (currentMode === 'signup') {
                document.getElementById('name').value = '';
              }
            } else {
              showMessage('✓ Authentication successful!', 'success');
            }
          } catch (error) {
            console.error('Auth error:', error);
            showMessage(\`✗ \${error.message}\`, 'error');
          } finally {
            setLoading(false);
          }
        }

        // OAuth functionality
        function initializeOAuthButtons() {
          const oauthButtons = document.querySelectorAll('.oauth-btn');

          oauthButtons.forEach((button) => {
            button.addEventListener('click', function() {
              const provider = this.getAttribute('data-provider');
              handleOAuthLogin(provider, this);
            });
          });
        }

        function handleOAuthLogin(provider, button) {
          try {
            // Disable button
            button.disabled = true;
            const textElement = button.querySelector('.oauth-text');
            const originalText = textElement.textContent;
            textElement.textContent = 'CONNECTING...';

            // Build OAuth URL for CLI
            const oauthUrl = \`/v1/auth/oauth?provider=\${provider}&project_scope=lanonasis-maas&platform=\${platform}&redirect_uri=\${encodeURIComponent(redirectUri)}\`;

            // Redirect after brief delay
            setTimeout(() => {
              window.location.href = oauthUrl;
            }, 500);
          } catch (error) {
            console.error('OAuth error:', error);
            button.disabled = false;
            const textElement = button.querySelector('.oauth-text');
            textElement.textContent = originalText;
            showMessage(\`✗ OAuth connection failed: \${error.message}\`, 'error');
          }
        }
      </script>
    </body>
    </html>
  `);
});

// CLI authentication - POST route processes the login
router.post("/cli-login", mcpController.cliLogin);

// CLI registration - POST route for new user signup
router.post("/cli-register", async (req, res) => {
  const { email, password, confirm_password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required",
      success: false,
    });
  }

  if (password !== confirm_password) {
    return res.status(400).json({
      error: "Passwords do not match",
      success: false,
    });
  }

  try {
    const { supabaseAdmin } = await import("../../db/client.js");

    // Sign up with Supabase
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for CLI users
    });

    if (error) {
      return res.status(400).json({
        error: error.message,
        success: false,
      });
    }

    // Generate API key/token for the new user
    const { generateTokenPair } = await import("../utils/jwt.js");
    const { createSession } = await import("../services/session.service.js");

    const tokens = generateTokenPair({
      sub: data.user!.id,
      email: data.user!.email!,
      role: data.user!.role || "authenticated",
      platform: "cli",
    });

    // Create session
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await createSession({
      user_id: data.user!.id,
      platform: "cli",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      expires_at: expiresAt,
    });

    res.json({
      success: true,
      api_key: tokens.access_token,
      access_token: tokens.access_token,
      user: {
        id: data.user!.id,
        email: data.user!.email,
      },
      message: "Registration successful!",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
});

export default router;
