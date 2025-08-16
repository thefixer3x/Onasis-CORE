const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
const jwtSecret = process.env.SUPABASE_JWT_SECRET=REDACTED_JWT_SECRET

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}) : null;

// Helper function to generate JWT tokens
const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || 'user',
    project_scope: 'lanonasis-maas'
  };

  const access_token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
  const refresh_token = jwt.sign({ id: user.id }, jwtSecret, { expiresIn: '7d' });

  return {
    access_token,
    refresh_token,
    expires_in: 3600,
    user: payload
  };
};

// Netlify function handler for auth API
exports.handler = async (event, context) => {
  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-Scope',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: ''
      };
    }

    const path = event.path.replace('/v1/auth', '') || '/';
    const method = event.httpMethod;
    const headers = event.headers;
    const body = event.body ? JSON.parse(event.body) : {};
    
    console.log(`Auth API: ${method} ${path}`);

    // Route requests
    let response;
    switch (true) {
      case path === '/health' && method === 'GET':
        response = await handleHealth();
        break;
      case path === '/signup' && method === 'POST':
        response = await handleSignup(body, headers);
        break;
      case path === '/login' && method === 'POST':
        response = await handleLogin(body, headers);
        break;
      case path === '/external' && method === 'POST':
        response = await handleExternalAuth(body, headers);
        break;
      case path === '/callback' && method === 'POST':
        response = await handleAuthCallback(body, headers);
        break;
      case path === '/refresh' && method === 'POST':
        response = await handleRefreshToken(body);
        break;
      case path === '/session' && method === 'GET':
        response = await handleSession(headers);
        break;
      case path === '/logout' && method === 'POST':
        response = await handleLogout();
        break;
      default:
        response = {
          statusCode: 404,
          body: { error: 'Auth endpoint not found', code: 'NOT_FOUND', path }
        };
    }

    return {
      statusCode: response.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-Scope',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify(response.body)
    };

  } catch (error) {
    console.error('Auth API error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        code: 'FUNCTION_ERROR'
      })
    };
  }
};

// Handler functions
async function handleHealth() {
  return {
    statusCode: 200,
    body: {
      status: 'healthy',
      service: 'onasis-core-auth',
      timestamp: new Date().toISOString()
    }
  };
}

async function handleSignup(body, headers) {
  try {
    const { email, password, name } = body;
    const projectScope = headers['x-project-scope'] || 'lanonasis-maas';

    if (!email || !password || !name) {
      return {
        statusCode: 400,
        body: { error: 'Email, password, and name are required', code: 'MISSING_FIELDS' }
      };
    }

    if (!supabase) {
      return {
        statusCode: 503,
        body: { error: 'Database service unavailable', code: 'SERVICE_UNAVAILABLE' }
      };
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .eq('project_scope', projectScope)
      .single();

    if (existingUser) {
      return {
        statusCode: 409,
        body: { error: 'User already exists', code: 'USER_EXISTS' }
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: hashedPassword,
        full_name: name,
        project_scope: projectScope,
        role: 'user',
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return {
        statusCode: 500,
        body: { error: 'Failed to create user', code: 'DB_ERROR' }
      };
    }

    // Generate default API key for the user
    const apiKeyValue = `lmk_${crypto.randomBytes(16).toString('hex')}`;
    
    await supabase
      .from('vendor_api_keys')
      .insert({
        vendor_name: projectScope,
        key_value: apiKeyValue,
        is_active: true,
        user_id: newUser.id,
        created_at: new Date().toISOString()
      });

    // Generate JWT tokens
    const tokens = generateTokens(newUser);

    return {
      statusCode: 201,
      body: tokens
    };

  } catch (error) {
    console.error('Signup error:', error);
    return {
      statusCode: 500,
      body: { error: 'Internal server error', code: 'SERVER_ERROR' }
    };
  }
}

async function handleLogin(body, headers) {
  try {
    const { email, password } = body;
    const projectScope = headers['x-project-scope'] || 'lanonasis-maas';

    if (!email || !password) {
      return {
        statusCode: 400,
        body: { error: 'Email and password are required', code: 'MISSING_CREDENTIALS' }
      };
    }

    if (!supabase) {
      return {
        statusCode: 503,
        body: { error: 'Database service unavailable', code: 'SERVICE_UNAVAILABLE' }
      };
    }

    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('project_scope', projectScope)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return {
        statusCode: 401,
        body: { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }
      };
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return {
        statusCode: 401,
        body: { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }
      };
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Generate JWT tokens
    const tokens = generateTokens(user);

    return {
      statusCode: 200,
      body: tokens
    };

  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      body: { error: 'Internal server error', code: 'SERVER_ERROR' }
    };
  }
}

async function handleExternalAuth(body, headers) {
  try {
    const { platform, redirect_url } = body;
    const projectScope = headers['x-project-scope'] || 'lanonasis-maas';

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state and redirect info temporarily
    const authData = {
      platform,
      redirect_url,
      project_scope: projectScope,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    };

    if (supabase) {
      await supabase
        .from('auth_states')
        .insert({
          state,
          auth_data: authData,
          created_at: new Date().toISOString()
        });
    }

    // Return auth URL for external platform to redirect to
    const authUrl = `${process.env.VITE_DASHBOARD_URL || 'https://dashboard.lanonasis.com'}/auth/external?state=${state}&platform=${platform}`;

    return {
      statusCode: 200,
      body: {
        auth_url: authUrl,
        state: state
      }
    };

  } catch (error) {
    console.error('External auth initiation error:', error);
    return {
      statusCode: 500,
      body: { error: 'Failed to initiate external auth', code: 'EXTERNAL_AUTH_FAILED' }
    };
  }
}

async function handleAuthCallback(body, headers) {
  try {
    const { code, state } = body;

    if (!code || !state) {
      return {
        statusCode: 400,
        body: { error: 'Code and state are required', code: 'MISSING_PARAMS' }
      };
    }

    if (!supabase) {
      return {
        statusCode: 503,
        body: { error: 'Database service unavailable', code: 'SERVICE_UNAVAILABLE' }
      };
    }

    // Verify state and get auth data
    const { data: authState, error } = await supabase
      .from('auth_states')
      .select('*')
      .eq('state', state)
      .single();

    if (error || !authState) {
      return {
        statusCode: 401,
        body: { error: 'Invalid or expired auth state', code: 'INVALID_STATE' }
      };
    }

    // Clean up used state
    await supabase
      .from('auth_states')
      .delete()
      .eq('state', state);

    // For now, create a temporary session for the callback
    const tempUser = {
      id: 'external_user',
      email: 'external@user.com',
      role: 'user'
    };

    const tokens = generateTokens(tempUser);

    return {
      statusCode: 200,
      body: tokens
    };

  } catch (error) {
    console.error('Auth callback error:', error);
    return {
      statusCode: 500,
      body: { error: 'Auth callback failed', code: 'CALLBACK_FAILED' }
    };
  }
}

async function handleRefreshToken(body) {
  try {
    const { refresh_token } = body;

    if (!refresh_token) {
      return {
        statusCode: 400,
        body: { error: 'Refresh token is required', code: 'MISSING_TOKEN' }
      };
    }

    // Verify refresh token
    const decoded = jwt.verify(refresh_token, jwtSecret);
    
    if (!supabase) {
      return {
        statusCode: 503,
        body: { error: 'Database service unavailable', code: 'SERVICE_UNAVAILABLE' }
      };
    }

    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return {
        statusCode: 401,
        body: { error: 'Invalid refresh token', code: 'INVALID_TOKEN' }
      };
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    return {
      statusCode: 200,
      body: tokens
    };

  } catch (error) {
    console.error('Token refresh error:', error);
    return {
      statusCode: 401,
      body: { error: 'Invalid refresh token', code: 'INVALID_TOKEN' }
    };
  }
}

async function handleSession(headers) {
  try {
    const authHeader = headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        body: { error: 'No token provided', code: 'NO_TOKEN' }
      };
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, jwtSecret);
    
    return {
      statusCode: 200,
      body: {
        access_token: token,
        user: decoded,
        expires_in: decoded.exp - Math.floor(Date.now() / 1000)
      }
    };

  } catch (error) {
    return {
      statusCode: 401,
      body: { error: 'Invalid token', code: 'INVALID_TOKEN' }
    };
  }
}

async function handleLogout() {
  return {
    statusCode: 200,
    body: { message: 'Logged out successfully' }
  };
}