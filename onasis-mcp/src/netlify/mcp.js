/**
 * MCP Proxy to Onasis-Core via Supabase
 * Entry point: https://mcp.lanonasis.com/
 * Routes all MCP requests to Supabase Edge Functions for centralized handling
 */

const ONASIS_CORE_URL = process.env.ONASIS_CORE_URL || 'https://api.lanonasis.com';

/**
 * Main MCP proxy handler
 */
export default async function handler(event, context) {
  // Handle different HTTP methods
  switch (event.httpMethod) {
    case 'GET':
      return showAuthPage(event);
    case 'POST':
      return proxyToOnasisCore(event, '/api/v1/mcp/auth');
    case 'OPTIONS':
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: ''
      };
    default:
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
  }
}

/**
 * Show authentication page that calls Supabase edge functions
 */
function showAuthPage(event) {
  const params = event.queryStringParameters || {};
  const clientId = params.client_id || 'anonymous';
  const source = params.source || 'cli';

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Onasis MCP Authentication</title>
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
            border-radius: 16px;
            box-shadow: 0 25px 80px rgba(0,0,0,0.3);
            max-width: 450px;
            width: 100%;
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .logo {
            width: 60px;
            height: 60px;
            margin: 0 auto 15px;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        h1 {
            font-size: 28px;
            margin-bottom: 8px;
        }
        .subtitle {
            opacity: 0.9;
            font-size: 16px;
        }
        .content {
            padding: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            color: #374151;
            margin-bottom: 8px;
            font-weight: 500;
        }
        input {
            width: 100%;
            padding: 14px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
        }
        button:disabled {
            opacity: 0.7;
            transform: none;
            cursor: not-allowed;
        }
        .message {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }
        .error {
            background: #fef2f2;
            color: #dc2626;
            border: 1px solid #fecaca;
        }
        .success {
            background: #f0fdf4;
            color: #16a34a;
            border: 1px solid #bbf7d0;
        }
        .info {
            background: #eff6ff;
            color: #2563eb;
            border: 1px solid #dbeafe;
            margin-top: 20px;
            display: block;
        }
        .key-display {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            margin-top: 20px;
            display: none;
        }
        .key-item {
            margin-bottom: 15px;
        }
        .key-label {
            font-size: 12px;
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
        }
        .key-value {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 14px;
            background: white;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            word-break: break-all;
            position: relative;
        }
        .copy-btn {
            position: absolute;
            right: 8px;
            top: 8px;
            background: #f3f4f6;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            width: auto;
        }
        .instructions {
            background: #fefce8;
            border: 1px solid #fde047;
            color: #a16207;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
            font-size: 14px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🔐</div>
            <h1>MCP Authentication</h1>
            <p class="subtitle">Connect your CLI to Onasis Memory Platform</p>
        </div>
        
        <div class="content">
            <div class="message error" id="error"></div>
            <div class="message success" id="success"></div>
            
            <form id="auth-form">
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input type="email" id="email" required placeholder="you@example.com">
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" required placeholder="••••••••">
                </div>
                <button type="submit" id="auth-btn">Sign In & Create API Key</button>
            </form>
            
            <div class="info">
                <strong>Need an account?</strong> Contact support for enterprise access or use the dashboard to create an account first.
            </div>
            
            <!-- API Key Display -->
            <div class="key-display" id="key-display">
                <h3 style="margin-bottom: 15px; color: #374151;">🎉 Your API Key is Ready!</h3>
                
                <div class="key-item">
                    <div class="key-label">Secret Key</div>
                    <div class="key-value" id="secret-key">
                        <button class="copy-btn" onclick="copyToClipboard('secret-key')">Copy</button>
                    </div>
                </div>
                
                <div class="instructions">
                    <strong>Setup Instructions:</strong><br>
                    1. Copy your secret key (keep it secure!)<br>
                    2. Run: <code>memory config set apiKey YOUR_SECRET_KEY</code><br>
                    3. Run: <code>memory config set apiUrl https://api.lanonasis.com</code><br>
                    4. Test: <code>memory create -t "Test" -c "Hello Onasis!"</code>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const clientId = '${clientId}';
        const source = '${source}';
        
        document.getElementById('auth-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('auth-btn');
            const error = document.getElementById('error');
            const success = document.getElementById('success');
            
            btn.disabled = true;
            btn.textContent = 'Authenticating...';
            error.style.display = 'none';
            success.style.display = 'none';
            
            try {
                // Call Onasis-Core API for MCP authentication
                const response = await fetch('${ONASIS_CORE_URL}/api/v1/mcp/auth', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action: 'signin',
                        email: document.getElementById('email').value,
                        password: document.getElementById('password').value,
                        client_id: clientId,
                        source: source
                    })
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    success.textContent = 'Authenticated successfully!';
                    success.style.display = 'block';
                    
                    // Show API key
                    document.getElementById('secret-key').innerHTML = 
                        result.apiKey.key_secret + '<button class="copy-btn" onclick="copyToClipboard(\\'secret-key\\')">Copy</button>';
                    document.getElementById('key-display').style.display = 'block';
                    
                    // Hide form
                    document.getElementById('auth-form').style.display = 'none';
                } else {
                    throw new Error(result.error || 'Authentication failed');
                }
            } catch (err) {
                error.textContent = err.message;
                error.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = 'Sign In & Create API Key';
            }
        });
        
        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent.replace('Copy', '').trim();
            navigator.clipboard.writeText(text).then(() => {
                const btn = element.querySelector('.copy-btn');
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = originalText, 2000);
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
 * Proxy requests to Onasis-Core for centralized authentication and routing
 */
async function proxyToOnasisCore(event, endpoint) {
  try {
    const url = `${ONASIS_CORE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'],
        'X-Real-IP': event.headers['x-real-ip'] || event.headers['X-Real-IP'],
        ...event.headers
      },
      body: event.body
    });

    const data = await response.text();
    
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: data
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Proxy error to onasis-core',
        message: error.message,
        endpoint: endpoint
      })
    };
  }
}