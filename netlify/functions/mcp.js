/**
 * MCP Authentication Landing Page
 * Entry point: https://mcp.lanonasis.com/
 * Handles authentication and automatic API key creation for CLI clients
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Main MCP landing page with authentication
 */
export default async function handler(event, context) {
  // Handle different HTTP methods
  switch (event.httpMethod) {
    case 'GET':
      return showAuthPage(event);
    case 'POST':
      return handleAuth(event);
    case 'OPTIONS':
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: ''
      };
    default:
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
  }
}

/**
 * Show authentication page
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
        }
        h1 {
            font-size: 28px;
            margin-bottom: 8px;
        }
        .subtitle {
            opacity: 0.9;
            font-size: 16px;
        }
        .tabs {
            display: flex;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
        }
        .tab {
            flex: 1;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            border: none;
            background: none;
            font-size: 16px;
            font-weight: 600;
            color: #64748b;
            transition: all 0.3s;
        }
        .tab.active {
            color: #667eea;
            background: white;
            border-bottom: 3px solid #667eea;
        }
        .content {
            padding: 30px;
        }
        .form-section {
            display: none;
        }
        .form-section.active {
            display: block;
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
        
        <div class="tabs">
            <button class="tab active" onclick="switchTab('signin')">Sign In</button>
            <button class="tab" onclick="switchTab('signup')">Create Account</button>
        </div>
        
        <div class="content">
            <!-- Sign In Form -->
            <div class="form-section active" id="signin-section">
                <div class="message error" id="signin-error"></div>
                <div class="message success" id="signin-success"></div>
                
                <form id="signin-form">
                    <div class="form-group">
                        <label for="signin-email">Email Address</label>
                        <input type="email" id="signin-email" required placeholder="you@example.com">
                    </div>
                    <div class="form-group">
                        <label for="signin-password">Password</label>
                        <input type="password" id="signin-password" required placeholder="••••••••">
                    </div>
                    <button type="submit" id="signin-btn">Sign In & Create API Key</button>
                </form>
                
                <div class="info">
                    <strong>Existing User?</strong> Sign in and we'll automatically create a new API key for your CLI client.
                </div>
            </div>
            
            <!-- Sign Up Form -->
            <div class="form-section" id="signup-section">
                <div class="message error" id="signup-error"></div>
                <div class="message success" id="signup-success"></div>
                
                <form id="signup-form">
                    <div class="form-group">
                        <label for="signup-name">Full Name</label>
                        <input type="text" id="signup-name" required placeholder="John Doe">
                    </div>
                    <div class="form-group">
                        <label for="signup-email">Email Address</label>
                        <input type="email" id="signup-email" required placeholder="you@example.com">
                    </div>
                    <div class="form-group">
                        <label for="signup-password">Password</label>
                        <input type="password" id="signup-password" required placeholder="••••••••" minlength="8">
                    </div>
                    <div class="form-group">
                        <label for="signup-org">Organization Name (Optional)</label>
                        <input type="text" id="signup-org" placeholder="Your Company">
                    </div>
                    <button type="submit" id="signup-btn">Create Account & First API Key</button>
                </form>
                
                <div class="info">
                    <strong>New to Onasis?</strong> Create your account and get your first API key instantly.
                </div>
            </div>
            
            <!-- API Key Display -->
            <div class="key-display" id="key-display">
                <h3 style="margin-bottom: 15px; color: #374151;">🎉 Your API Key is Ready!</h3>
                
                <div class="key-item">
                    <div class="key-label">API Key ID</div>
                    <div class="key-value" id="key-id">
                        <button class="copy-btn" onclick="copyToClipboard('key-id')">Copy</button>
                    </div>
                </div>
                
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
        
        function switchTab(tab) {
            // Update tab buttons
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelector(\`button[onclick="switchTab('\${tab}')"]\`).classList.add('active');
            
            // Update form sections
            document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
            document.getElementById(\`\${tab}-section\`).classList.add('active');
            
            // Hide key display
            document.getElementById('key-display').style.display = 'none';
        }
        
        // Sign In Handler
        document.getElementById('signin-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleAuth('signin', {
                email: document.getElementById('signin-email').value,
                password: document.getElementById('signin-password').value,
                client_id: clientId,
                source: source
            });
        });
        
        // Sign Up Handler
        document.getElementById('signup-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleAuth('signup', {
                name: document.getElementById('signup-name').value,
                email: document.getElementById('signup-email').value,
                password: document.getElementById('signup-password').value,
                organization: document.getElementById('signup-org').value || null,
                client_id: clientId,
                source: source
            });
        });
        
        async function handleAuth(type, data) {
            const btn = document.getElementById(\`\${type}-btn\`);
            const error = document.getElementById(\`\${type}-error\`);
            const success = document.getElementById(\`\${type}-success\`);
            
            btn.disabled = true;
            btn.textContent = type === 'signin' ? 'Signing In...' : 'Creating Account...';
            error.style.display = 'none';
            success.style.display = 'none';
            
            try {
                const response = await fetch('/api/mcp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: type, ...data })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    // Show success and API key
                    success.textContent = type === 'signin' ? 
                        'Signed in successfully!' : 'Account created successfully!';
                    success.style.display = 'block';
                    
                    showApiKey(result.apiKey);
                } else {
                    throw new Error(result.error || 'Authentication failed');
                }
            } catch (err) {
                error.textContent = err.message;
                error.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = type === 'signin' ? 'Sign In & Create API Key' : 'Create Account & First API Key';
            }
        }
        
        function showApiKey(apiKey) {
            document.getElementById('key-id').innerHTML = \`\${apiKey.key_id}<button class="copy-btn" onclick="copyToClipboard('key-id')">Copy</button>\`;
            document.getElementById('secret-key').innerHTML = \`\${apiKey.key_secret}<button class="copy-btn" onclick="copyToClipboard('secret-key')">Copy</button>\`;
            document.getElementById('key-display').style.display = 'block';
            
            // Hide forms
            document.querySelectorAll('.form-section').forEach(s => s.style.display = 'none');
        }
        
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
 * Handle authentication requests
 */
async function handleAuth(event) {
  try {
    const body = JSON.parse(event.body);
    const { action, email, password, name, organization, client_id, source } = body;

    if (action === 'signin') {
      return await handleSignIn(email, password, client_id, source);
    } else if (action === 'signup') {
      return await handleSignUp(name, email, password, organization, client_id, source);
    } else {
      throw new Error('Invalid action');
    }
  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
}

/**
 * Handle user sign in and create API key
 */
async function handleSignIn(email, password, clientId, source) {
  // Authenticate user
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    throw new Error('Invalid email or password');
  }

  const userId = authData.user.id;

  // Get user's organization
  const { data: userOrg } = await supabase
    .from('maas.users')
    .select('organization_id')
    .eq('user_id', userId)
    .single();

  if (!userOrg) {
    throw new Error('User organization not found');
  }

  // Get vendor organization for API key creation
  const { data: vendorOrg } = await supabase
    .from('vendor_organizations')
    .select('id, vendor_code')
    .eq('vendor_code', 'ADMIN_ORG') // Default to admin org for now
    .single();

  if (!vendorOrg) {
    throw new Error('Vendor organization not found');
  }

  // Create API key for this client
  const apiKey = await createApiKeyForClient(vendorOrg.id, clientId, source, email);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: true,
      userId,
      organizationId: userOrg.organization_id,
      apiKey
    })
  };
}

/**
 * Handle user sign up and create first API key
 */
async function handleSignUp(name, email, password, organizationName, clientId, source) {
  // Create user account
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name
      }
    }
  });

  if (authError) {
    throw new Error(authError.message);
  }

  const userId = authData.user.id;

  // Create organization if provided, otherwise use personal
  const orgName = organizationName || \`\${name}'s Organization\`;
  
  const { data: newOrg, error: orgError } = await supabase
    .from('maas.organizations')
    .insert({
      name: orgName,
      slug: generateSlug(orgName),
      plan: 'free'
    })
    .select()
    .single();

  if (orgError) {
    throw new Error('Failed to create organization');
  }

  // Add user to organization
  const { error: userOrgError } = await supabase
    .from('maas.users')
    .insert({
      user_id: userId,
      organization_id: newOrg.id,
      email,
      role: 'admin'
    });

  if (userOrgError) {
    throw new Error('Failed to setup user organization');
  }

  // Get or create vendor organization
  let { data: vendorOrg } = await supabase
    .from('vendor_organizations')
    .select('id, vendor_code')
    .eq('vendor_code', 'ADMIN_ORG')
    .single();

  if (!vendorOrg) {
    // Create vendor org if it doesn't exist
    const { data: newVendorOrg } = await supabase
      .from('vendor_organizations')
      .insert({
        vendor_code: 'ADMIN_ORG',
        organization_name: 'Onasis Admin Organization',
        organization_type: 'enterprise',
        contact_email: 'admin@lanonasis.com',
        billing_tier: 'enterprise',
        status: 'active'
      })
      .select()
      .single();
    
    vendorOrg = newVendorOrg;
  }

  // Create first API key
  const apiKey = await createApiKeyForClient(vendorOrg.id, clientId, source, email);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: true,
      userId,
      organizationId: newOrg.id,
      apiKey,
      isNewUser: true
    })
  };
}

/**
 * Create API key for client
 */
async function createApiKeyForClient(vendorOrgId, clientId, source, email) {
  const keyName = \`\${source === 'cli' ? 'CLI' : 'MCP'} Key - \${clientId.substring(0, 8)}\`;
  
  // Generate API key using the onasis-core function
  const { data, error } = await supabase.rpc('generate_vendor_api_key', {
    p_vendor_org_id: vendorOrgId,
    p_key_name: keyName,
    p_key_type: 'live',
    p_environment: 'production'
  });

  if (error || !data || !data[0]) {
    throw new Error('Failed to create API key');
  }

  return {
    key_id: data[0].key_id,
    key_secret: data[0].key_secret,
    name: keyName,
    created_for: email,
    client_id: clientId,
    source
  };
}

/**
 * Generate URL-friendly slug
 */
function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 50);
}