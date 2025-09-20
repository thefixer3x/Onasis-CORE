/**
 * Authentication Callback Handler
 * Handles redirects from auth.lanonasis.com to dashboard.lanonasis.com
 */

const express = require('express');
const router = express.Router();

// Handle authentication callback
router.get('/auth/callback', (req, res) => {
  const { token, platform, error } = req.query;
  
  if (error) {
    // Redirect to login with error
    return res.redirect(`https://auth.lanonasis.com/auth/login?error=${encodeURIComponent(error)}`);
  }
  
  if (!token) {
    // No token, redirect to login
    return res.redirect('https://auth.lanonasis.com/auth/login?error=no_token');
  }
  
  // Return HTML that stores the token and redirects
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication Successful - Redirecting...</title>
      <style>
        body {
          background: #0a0a0a;
          color: #00ff00;
          font-family: 'Courier New', monospace;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          text-align: center;
        }
        .spinner {
          border: 3px solid #333;
          border-top: 3px solid #00ff00;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✓ Authentication Successful</h1>
        <div class="spinner"></div>
        <p>Redirecting to ${platform || 'dashboard'}...</p>
      </div>
      
      <script>
        // Store the token in localStorage
        const token = '${token}';
        const platform = '${platform || 'dashboard'}';
        
        if (token) {
          // Store token for the dashboard
          localStorage.setItem('lanonasis_token', token);
          localStorage.setItem('lanonasis_platform', platform);
          
          // Also store in sessionStorage for immediate use
          sessionStorage.setItem('lanonasis_token', token);
          
          // Set cookie for cross-domain access
          document.cookie = 'lanonasis_token=' + token + '; domain=.lanonasis.com; path=/; secure; samesite=none; max-age=604800';
          
          // Determine redirect URL based on platform
          let redirectUrl = 'https://dashboard.lanonasis.com';
          
          switch(platform) {
            case 'mcp':
              redirectUrl = 'https://mcp.lanonasis.com';
              break;
            case 'docs':
              redirectUrl = 'https://docs.lanonasis.com';
              break;
            case 'api':
              redirectUrl = 'https://api.lanonasis.com/dashboard';
              break;
            default:
              redirectUrl = 'https://dashboard.lanonasis.com';
          }
          
          // Redirect after a short delay
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 1000);
        } else {
          // No token, redirect to login
          window.location.href = 'https://auth.lanonasis.com/auth/login?error=no_token';
        }
      </script>
    </body>
    </html>
  `);
});

// Verify token endpoint
router.post('/auth/verify', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET=REDACTED_JWT_SECRET
    
    res.json({
      valid: true,
      userId: decoded.userId,
      timestamp: decoded.timestamp
    });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

module.exports = router;