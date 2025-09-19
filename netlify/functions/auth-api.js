const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Initialize Supabase client
// Use the Supabase project URL, not the direct database URL
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mxtsdgkwzjzlttpotole.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || 'default_jwt_secret';

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

    // Fix path parsing - handle both direct function calls and redirected paths
    let path = event.path;
    // Remove the function path if present
    path = path.replace('/.netlify/functions/auth-api', '');
    // Remove the API prefix paths
    path = path.replace('/api/v1/auth', '').replace('/v1/auth', '') || '/';
    
    const method = event.httpMethod;
    const headers = event.headers;
    const body = event.body ? JSON.parse(event.body) : {};
    
    console.log(`Auth API: ${method} ${path} (original: ${event.path})`);

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

    console.log('Signup attempt:', { email, hasPassword: !!password, name, projectScope });

    if (!email || !password || !name) {
      return {
        statusCode: 400,
        body: { error: 'Email, password, and name are required', code: 'MISSING_FIELDS' }
      };
    }

    if (!supabase) {
      console.error('Supabase client not initialized');
      return {
        statusCode: 503,
        body: { error: 'Database service unavailable', code: 'SERVICE_UNAVAILABLE' }
      };
    }

    console.log('Using simple auth system for basic PostgreSQL database...');
    
    // Try simple approach first - create a basic users table if needed
    return await handleSimpleSignup(email, password, name, projectScope);

    // Check if user already exists in MaaS schema
    const { data: existingUser } = await supabase
      .from('maas.users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return {
        statusCode: 409,
        body: { error: 'User already exists', code: 'USER_EXISTS' }
      };
    }

    // Get or create default organization for individual users
    let orgId;
    const { data: defaultOrg } = await supabase
      .from('maas.organizations')
      .select('id')
      .eq('slug', 'individual-users')
      .single();
      
    if (defaultOrg) {
      orgId = defaultOrg.id;
    } else {
      // Create default organization for individual signups
      const { data: newOrg, error: orgError } = await supabase
        .from('maas.organizations')
        .insert({
          name: 'Individual Users',
          slug: 'individual-users',
          description: 'Default organization for individual user signups',
          plan: 'free'
        })
        .select()
        .single();
        
      if (orgError) {
        console.error('Error creating default organization:', orgError);
        return {
          statusCode: 500,
          body: { error: 'Failed to set up user organization', code: 'ORG_ERROR' }
        };
      }
      orgId = newOrg.id;
    }

    console.log('Using organization ID:', orgId);

    // Create user in Core auth (using Supabase Auth)
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        full_name: name,
        project_scope: projectScope
      },
      email_confirm: true
    });

    if (authError) {
      console.error('Core auth user creation failed:', authError);
      return {
        statusCode: 500,
        body: { 
          error: 'Failed to create authentication', 
          code: 'AUTH_ERROR',
          details: authError.message
        }
      };
    }

    console.log('Core auth user created:', authUser.user.id);

    // Create MaaS user record
    const { data: newUser, error } = await supabase
      .from('maas.users')
      .insert({
        user_id: authUser.user.id,
        organization_id: orgId,
        email,
        role: 'admin' // First user in org becomes admin
      })
      .select()
      .single();

    if (error) {
      console.error('Database error creating user:', error);
      return {
        statusCode: 500,
        body: { 
          error: 'Failed to create user', 
          code: 'DB_ERROR',
          details: error.message || 'Unknown database error',
          hint: error.hint || null
        }
      };
    }

    console.log('MaaS user created successfully:', newUser.id);

    // Create JWT tokens using the Core auth user data
    const userForToken = {
      id: authUser.user.id,
      email: email,
      full_name: name,
      role: 'user',
      maas_user_id: newUser.id,
      organization_id: orgId
    };
    
    const tokens = generateTokens(userForToken);

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

    console.log('Login attempt for:', email);

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
    
    console.log('Using simple auth system for login...');
    return await handleSimpleLogin(email, password, projectScope);

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      console.log('Auth failed:', authError?.message);
      return {
        statusCode: 401,
        body: { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }
      };
    }

    console.log('Core auth successful, finding MaaS user...');

    // Find MaaS user record
    const { data: maasUser, error: maasError } = await supabase
      .from('maas.users')
      .select('*, organization:maas.organizations(id, name, plan)')
      .eq('user_id', authData.user.id)
      .eq('status', 'active')
      .single();

    if (maasError || !maasUser) {
      console.log('MaaS user not found:', maasError?.message);
      return {
        statusCode: 401,
        body: { error: 'User account not found or inactive', code: 'USER_NOT_FOUND' }
      };
    }

    console.log('MaaS user found:', maasUser.id);

    // Update last login
    await supabase
      .from('maas.users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', maasUser.id);

    // Prepare user data for token
    const userForToken = {
      id: authData.user.id,
      email: authData.user.email,
      full_name: authData.user.user_metadata?.full_name || maasUser.email,
      role: maasUser.role || 'user',
      maas_user_id: maasUser.id,
      organization_id: maasUser.organization_id,
      organization: maasUser.organization
    };

    // Generate JWT tokens
    const tokens = generateTokens(userForToken);

    return {
      statusCode: 200,
      body: tokens
    };

  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      body: { error: 'Internal server error', code: 'SERVER_ERROR', details: error.message }
    };
  }
}

// Simple signup for basic PostgreSQL database
async function handleSimpleSignup(email, password, name, projectScope) {
  try {
    // First, ensure we have a basic users table
    await ensureUsersTable();
    
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('simple_users')
      .select('id')
      .eq('email', email)
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
      .from('simple_users')
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
      console.error('Error creating user:', error);
      return {
        statusCode: 500,
        body: { error: 'Failed to create user', code: 'DB_ERROR', details: error.message }
      };
    }
    
    console.log('User created successfully:', newUser.id);
    
    // Generate tokens
    const tokens = generateTokens(newUser);
    
    return {
      statusCode: 201,
      body: tokens
    };
    
  } catch (error) {
    console.error('Simple signup error:', error);
    return {
      statusCode: 500,
      body: { error: 'Signup failed', code: 'SIGNUP_ERROR', details: error.message }
    };
  }
}

// Simple login for basic PostgreSQL database
async function handleSimpleLogin(email, password, projectScope) {
  try {
    console.log('Attempting simple login for:', email);
    
    // Find user
    const { data: user, error } = await supabase
      .from('simple_users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();
      
    if (error || !user) {
      console.log('User not found or error:', error?.message);
      return {
        statusCode: 401,
        body: { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }
      };
    }
    
    console.log('User found, verifying password...');
    
    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      console.log('Invalid password');
      return {
        statusCode: 401,
        body: { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }
      };
    }
    
    console.log('Password valid, updating last login...');
    
    // Update last login
    await supabase
      .from('simple_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);
      
    // Generate tokens
    const tokens = generateTokens(user);
    
    console.log('Login successful for user:', user.id);
    
    return {
      statusCode: 200,
      body: tokens
    };
    
  } catch (error) {
    console.error('Simple login error:', error);
    return {
      statusCode: 500,
      body: { error: 'Login failed', code: 'LOGIN_ERROR', details: error.message }
    };
  }
}

// Ensure basic users table exists
async function ensureUsersTable() {
  try {
    // Try to select from the table to see if it exists
    const { error } = await supabase
      .from('simple_users')
      .select('count')
      .limit(1);
      
    if (error && error.code === 'PGRST116') {
      console.log('simple_users table does not exist, but cannot create it via Supabase client');
      throw new Error('Database schema not set up. Please run migrations manually.');
    }
    
    console.log('simple_users table verified');
  } catch (error) {
    console.error('Error checking users table:', error);
    throw error;
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