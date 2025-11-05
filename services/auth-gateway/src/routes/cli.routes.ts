import express from 'express'
import crypto from 'crypto'
import * as mcpController from '../controllers/mcp.controller.js'

const router = express.Router()

// CLI authentication - GET route serves the login page
router.get('/cli-login', (req, res) => {
  const { platform = 'cli', redirect_url, return_to } = req.query;
  
  // Generate nonce for CSP
  const nonce = crypto.randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'`);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Lanonasis CLI Authentication</title>
      <style>
        body {
          background: #0a0a0a;
          color: #00ff00;
          font-family: 'Courier New', monospace;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .container {
          background: #1a1a1a;
          border: 1px solid #00ff00;
          border-radius: 8px;
          padding: 40px;
          width: 100%;
          max-width: 500px;
          box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
        }
        h1 {
          color: #00ff00;
          text-align: center;
          margin-bottom: 10px;
          font-size: 24px;
        }
        .status {
          color: #00ff00;
          text-align: center;
          margin-bottom: 20px;
          font-size: 14px;
        }
        .platform-badge {
          color: #999;
          text-align: center;
          font-size: 12px;
          margin-bottom: 30px;
        }
        input {
          width: 100%;
          padding: 12px;
          margin: 10px 0;
          background: #0a0a0a;
          border: 1px solid #333;
          color: #fff;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          box-sizing: border-box;
        }
        input:focus {
          outline: none;
          border-color: #00ff00;
        }
        input::placeholder {
          color: #666;
        }
        button {
          width: 100%;
          padding: 12px;
          margin-top: 20px;
          background: transparent;
          border: 1px solid #00ff00;
          color: #00ff00;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          font-family: 'Courier New', monospace;
          text-transform: uppercase;
          transition: all 0.3s ease;
        }
        button:hover {
          background: #00ff00;
          color: #0a0a0a;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .message {
          margin-top: 20px;
          padding: 15px;
          border-radius: 4px;
          display: none;
          font-size: 14px;
        }
        .message.success {
          background: rgba(0, 255, 0, 0.1);
          color: #00ff00;
          border: 1px solid #00ff00;
        }
        .message.error {
          background: rgba(255, 0, 0, 0.1);
          color: #ff4444;
          border: 1px solid #ff4444;
        }
        .token-display {
          background: #0a0a0a;
          padding: 15px;
          border: 1px solid #333;
          border-radius: 4px;
          margin: 15px 0;
          word-break: break-all;
          font-size: 12px;
        }
        .copy-btn {
          width: auto;
          padding: 8px 16px;
          margin: 10px auto 0;
          display: block;
          font-size: 14px;
        }
        .toggle-link {
          text-align: center;
          margin-top: 20px;
          color: #666;
          font-size: 14px;
        }
        .toggle-link a {
          color: #00ff00;
          text-decoration: none;
          cursor: pointer;
        }
        .toggle-link a:hover {
          text-decoration: underline;
        }
        .spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid rgba(0, 255, 0, 0.3);
          border-top-color: #00ff00;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-left: 8px;
          vertical-align: middle;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Lanonasis CLI Auth</h1>
        <div class="status">● SECURE CONNECTION</div>
        <div class="platform-badge">Platform: ${platform}</div>
        
        <form id="loginForm">
          <div id="loginFields">
            <input
              type="email"
              id="email"
              placeholder="email@example.com"
              required
              autocomplete="email"
            />
            <input
              type="password"
              id="password"
              placeholder="password"
              required
              autocomplete="current-password"
            />
          </div>
          
          <div id="signupFields" style="display: none;">
            <input
              type="email"
              id="signupEmail"
              placeholder="email@example.com"
              autocomplete="email"
            />
            <input
              type="password"
              id="signupPassword"
              placeholder="password (min 8 chars)"
              autocomplete="new-password"
            />
            <input
              type="password"
              id="confirmPassword"
              placeholder="confirm password"
              autocomplete="new-password"
            />
          </div>
          
          <button type="submit" id="submitBtn">AUTHENTICATE</button>
        </form>
        
        <div class="toggle-link">
          <span id="toggleText">Need an account? <a id="toggleLink">Sign Up</a></span>
        </div>
        
        <div class="message" id="message"></div>
      </div>
      
      <script nonce="${nonce}">
        let isSignUp = false;
        
        function toggleMode() {
          isSignUp = !isSignUp;
          const loginFields = document.getElementById('loginFields');
          const signupFields = document.getElementById('signupFields');
          const submitBtn = document.getElementById('submitBtn');
          const toggleText = document.getElementById('toggleText');
          const toggleLink = document.getElementById('toggleLink');
          
          if (isSignUp) {
            loginFields.style.display = 'none';
            signupFields.style.display = 'block';
            submitBtn.innerHTML = 'CREATE ACCOUNT';
            toggleLink.textContent = 'Sign In';
            toggleText.innerHTML = 'Have an account? ';
            toggleText.appendChild(toggleLink);
          } else {
            loginFields.style.display = 'block';
            signupFields.style.display = 'none';
            submitBtn.innerHTML = 'AUTHENTICATE';
            toggleLink.textContent = 'Sign Up';
            toggleText.innerHTML = 'Need an account? ';
            toggleText.appendChild(toggleLink);
          }
          hideMessage();
        }
        
        function showMessage(text, type) {
          const messageEl = document.getElementById('message');
          messageEl.innerHTML = text;
          messageEl.className = 'message ' + type;
          messageEl.style.display = 'block';
          
          // Attach event listeners to any copy buttons in the message
          const copyBtns = messageEl.querySelectorAll('.copy-btn');
          copyBtns.forEach(btn => {
            btn.addEventListener('click', function() {
              const token = this.getAttribute('data-token');
              copyToClipboard(token);
            });
          });
        }
        
        function hideMessage() {
          const messageEl = document.getElementById('message');
          messageEl.style.display = 'none';
        }
        
        function copyToClipboard(text) {
          navigator.clipboard.writeText(text).then(() => {
            showMessage('✓ Token copied to clipboard!', 'success');
          }).catch(() => {
            showMessage('Failed to copy. Please copy manually.', 'error');
          });
        }
        
        async function handleAuth(event) {
          event.preventDefault();
          hideMessage();
          
          const submitBtn = document.getElementById('submitBtn');
          const originalText = submitBtn.innerHTML;
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'PROCESSING<span class="spinner"></span>';
          
          try {
            let data, endpoint;
            
            if (isSignUp) {
              const password = document.getElementById('signupPassword').value;
              const confirmPassword = document.getElementById('confirmPassword').value;
              
              if (password !== confirmPassword) {
                showMessage('❌ Passwords do not match', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
                return;
              }
              
              if (password.length < 8) {
                showMessage('❌ Password must be at least 8 characters', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
                return;
              }
              
              endpoint = '/auth/cli-register';
              data = {
                email: document.getElementById('signupEmail').value,
                password: password,
                confirm_password: confirmPassword
              };
            } else {
              endpoint = '/auth/cli-login';
              data = {
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
                platform: '${platform}'
              };
            }
            
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok && result.access_token) {
              const token = result.api_key || result.access_token;
              
              showMessage(
                '<strong>✅ Authentication Successful!</strong><br><br>' +
                '<div class="token-display" id="tokenDisplay">' + token + '</div>' +
                '<button class="copy-btn" data-token="' + token + '">📋 COPY TOKEN</button>' +
                '<br><br>' +
                '<small>Copy this token and paste it into your CLI when prompted.</small>',
                'success');
              
              // Clear password fields
              document.getElementById('password').value = '';
              document.getElementById('signupPassword').value = '';
              document.getElementById('confirmPassword').value = '';
            } else {
              showMessage('❌ ' + (result.error || 'Authentication failed. Please try again.'), 'error');
            }
          } catch (error) {
            console.error('Auth error:', error);
            showMessage('❌ Network error. Please check your connection and try again.', 'error');
          } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
          }
        }
        
        // Setup event listeners on page load
        window.addEventListener('load', () => {
          document.getElementById('email').focus();
          document.getElementById('loginForm').addEventListener('submit', handleAuth);
          document.getElementById('toggleLink').addEventListener('click', toggleMode);
        });
      </script>
    </body>
    </html>
  `);
})

// CLI authentication - POST route processes the login
router.post('/cli-login', mcpController.cliLogin)

// CLI registration - POST route for new user signup
router.post('/cli-register', async (req, res) => {
  const { email, password, confirm_password } = req.body

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required',
      success: false,
    })
  }

  if (password !== confirm_password) {
    return res.status(400).json({
      error: 'Passwords do not match',
      success: false,
    })
  }

  try {
    const { supabaseAdmin } = await import('../../db/client.js')
    
    // Sign up with Supabase
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for CLI users
    })

    if (error) {
      return res.status(400).json({
        error: error.message,
        success: false,
      })
    }

    // Generate API key/token for the new user
    const { generateTokenPair } = await import('../utils/jwt.js')
    const { createSession } = await import('../services/session.service.js')
    
    const tokens = generateTokenPair({
      sub: data.user!.id,
      email: data.user!.email!,
      role: data.user!.role || 'authenticated',
      platform: 'cli',
    })

    // Create session
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await createSession({
      user_id: data.user!.id,
      platform: 'cli',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      expires_at: expiresAt,
    })

    res.json({
      success: true,
      api_key: tokens.access_token,
      user: {
        id: data.user!.id,
        email: data.user!.email,
      },
      message: 'Registration successful!',
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({
      error: 'Internal server error',
      success: false,
    })
  }
})

export default router
