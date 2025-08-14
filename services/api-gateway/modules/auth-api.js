#!/usr/bin/env node

/**
 * Onasis-CORE Auth API Module
 * Centralized authentication with project scope enforcement
 * Handles login, session management, and profile operations
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const winston = require('winston');
const crypto = require('crypto');
const router = express.Router();

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'onasis-auth-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize Supabase client with service role (server-side only)
const supabaseUrl = process.env.SUPABASE_URL=https://<project-ref>.supabase.co
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL=https://<project-ref>.supabase.co
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Audit logging function
const logAuditEvent = async (event) => {
  try {
    const { data, error } = await supabase
      .from('core.logs')
      .insert([event]);
    
    if (error) {
      logger.error('Failed to log audit event', { error: error.message });
    }
  } catch (error) {
    // Best-effort logging - don't break user flow
    logger.error('Audit logging failed', { error: error.message });
  }
};

// Generate correlation ID for request tracking
const generateCorrelationId = () => crypto.randomBytes(16).toString('hex');

// Audit logging middleware
const auditLog = (action) => async (req, res, next) => {
  const correlationId = generateCorrelationId();
  req.correlationId = correlationId;
  
  const startTime = Date.now();
  
  // Capture original res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const responseTime = Date.now() - startTime;
    
    // Log to Core audit system
    logAuditEvent({
      project: req.headers['x-project-scope'] || 'unknown',
      user_id: req.userId || null,
      service_id: 'onasis-core-auth',
      endpoint: req.path,
      method: req.method,
      action: action,
      status: res.statusCode >= 400 ? 'error' : 'allowed',
      response_time: responseTime,
      correlation_id: correlationId,
      error: res.statusCode >= 400 ? body.error : null,
      timestamp: new Date().toISOString(),
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });
    
    return originalJson.call(this, body);
  };
  
  next();
};

// Session validation middleware
const validateSession = async (req, res, next) => {
  try {
    // Extract session token from cookies or Authorization header
    const sessionToken = req.cookies?.session_token || 
                        req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return res.status(401).json({ 
        error: 'No session token provided',
        code: 'AUTH_REQUIRED'
      });
    }

    // Verify session with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);
    
    if (error || !user) {
      return res.status(401).json({ 
        error: 'Invalid session token',
        code: 'AUTH_INVALID'
      });
    }

    // Add user info to request
    req.user = user;
    req.userId = user.id;
    req.userRole = user.user_metadata?.role || 'user';
    
    next();
  } catch (error) {
    logger.error('Session validation failed', {
      error: error.message,
      correlationId: req.correlationId
    });
    return res.status(401).json({ 
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

// Auth Routes

// POST /v1/auth/login - User login with project scope
router.post('/login', auditLog('login'), async (req, res) => {
  try {
    const { email, password, project_scope } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR'
      });
    }

    if (!project_scope) {
      return res.status(400).json({
        error: 'Project scope is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      logger.warn('Login failed', { 
        email, 
        project_scope, 
        error: error.message,
        correlationId: req.correlationId
      });
      return res.status(401).json({
        error: error.message,
        code: 'LOGIN_FAILED'
      });
    }

    // Create session with project scope
    const sessionData = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'user',
        project_scope: project_scope,
        created_at: data.user.created_at
      }
    };

    // Set secure session cookie
    res.cookie('session_token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    req.userId = data.user.id;
    
    res.json(sessionData);
  } catch (error) {
    logger.error('Login error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /v1/auth/register - User registration
router.post('/register', auditLog('register'), async (req, res) => {
  try {
    const { email, password, project_scope, user_metadata } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR'
      });
    }

    if (!project_scope) {
      return res.status(400).json({
        error: 'Project scope is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Register with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...user_metadata,
          project_scope: project_scope
        }
      }
    });

    if (error) {
      logger.warn('Registration failed', { 
        email, 
        project_scope, 
        error: error.message,
        correlationId: req.correlationId
      });
      return res.status(400).json({
        error: error.message,
        code: 'REGISTRATION_FAILED'
      });
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        email_confirmed_at: data.user?.email_confirmed_at
      }
    });
  } catch (error) {
    logger.error('Registration error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /v1/auth/session - Session validation
router.get('/session', auditLog('session_check'), validateSession, async (req, res) => {
  try {
    const sessionData = {
      access_token: req.cookies?.session_token,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.user_metadata?.role || 'user',
        project_scope: req.user.user_metadata?.project_scope,
        created_at: req.user.created_at
      }
    };

    res.json(sessionData);
  } catch (error) {
    logger.error('Session check error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /v1/auth/logout - User logout
router.post('/logout', auditLog('logout'), async (req, res) => {
  try {
    const sessionToken = req.cookies?.session_token;
    
    if (sessionToken) {
      // Revoke session with Supabase
      await supabase.auth.admin.signOut(sessionToken);
    }

    // Clear session cookie
    res.clearCookie('session_token');
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    // Still clear cookie even if logout fails
    res.clearCookie('session_token');
    res.json({ message: 'Logout completed' });
  }
});

// GET /v1/auth/oauth - OAuth initiation
router.get('/oauth', auditLog('oauth_initiate'), async (req, res) => {
  try {
    const { provider = 'google', redirect_uri, project_scope, response_type = 'code' } = req.query;
    
    if (!redirect_uri) {
      return res.status(400).json({
        error: 'redirect_uri is required',
        code: 'VALIDATION_ERROR'
      });
    }

    if (!project_scope) {
      return res.status(400).json({
        error: 'project_scope is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Initiate OAuth with Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: redirect_uri,
        scopes: 'openid email profile',
        queryParams: {
          project_scope: project_scope,
          state: crypto.randomBytes(16).toString('hex')
        }
      }
    });

    if (error) {
      logger.warn('OAuth initiation failed', { 
        provider, 
        project_scope, 
        error: error.message,
        correlationId: req.correlationId
      });
      return res.status(400).json({
        error: error.message,
        code: 'OAUTH_INITIATION_FAILED'
      });
    }

    // Redirect to OAuth provider
    res.redirect(data.url);
  } catch (error) {
    logger.error('OAuth initiation error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /v1/auth/callback - OAuth callback handling
router.post('/callback', auditLog('oauth_callback'), async (req, res) => {
  try {
    const { code, state, project_scope } = req.body;
    
    if (!code) {
      return res.status(400).json({
        error: 'Authorization code is required',
        code: 'VALIDATION_ERROR'
      });
    }

    if (!project_scope) {
      return res.status(400).json({
        error: 'Project scope is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Exchange code for session with Supabase
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.warn('OAuth callback failed', { 
        code: code.substring(0, 10) + '...', 
        project_scope, 
        error: error.message,
        correlationId: req.correlationId
      });
      return res.status(400).json({
        error: error.message,
        code: 'OAUTH_FAILED'
      });
    }

    // Update user metadata with project scope
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      data.user.id,
      {
        user_metadata: {
          ...data.user.user_metadata,
          project_scope: project_scope
        }
      }
    );

    if (updateError) {
      logger.warn('Failed to update user project scope', {
        userId: data.user.id,
        project_scope,
        error: updateError.message
      });
    }

    // Create session with project scope
    const sessionData = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'user',
        project_scope: project_scope,
        created_at: data.user.created_at
      }
    };

    // Set secure session cookie
    res.cookie('session_token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    req.userId = data.user.id;
    
    res.json(sessionData);
  } catch (error) {
    logger.error('OAuth callback error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /v1/auth/profile - Get user profile
router.get('/profile', auditLog('profile_get'), validateSession, async (req, res) => {
  try {
    const profile = {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.user_metadata?.full_name,
      avatar_url: req.user.user_metadata?.avatar_url,
      role: req.user.user_metadata?.role || 'user',
      project_scope: req.user.user_metadata?.project_scope,
      created_at: req.user.created_at,
      updated_at: req.user.updated_at
    };

    res.json(profile);
  } catch (error) {
    logger.error('Profile fetch error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /v1/auth/update-profile - Update user profile
router.post('/update-profile', auditLog('profile_update'), validateSession, async (req, res) => {
  try {
    const { full_name, avatar_url } = req.body;
    
    const updates = {
      user_metadata: {
        ...req.user.user_metadata,
        ...(full_name && { full_name }),
        ...(avatar_url && { avatar_url })
      }
    };

    const { data, error } = await supabase.auth.admin.updateUserById(
      req.user.id,
      updates
    );

    if (error) {
      logger.warn('Profile update failed', { 
        userId: req.user.id,
        error: error.message,
        correlationId: req.correlationId
      });
      return res.status(400).json({
        error: error.message,
        code: 'UPDATE_FAILED'
      });
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name,
        avatar_url: data.user.user_metadata?.avatar_url
      }
    });
  } catch (error) {
    logger.error('Profile update error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /v1/auth/update-password - Update user password
router.post('/update-password', auditLog('password_update'), validateSession, async (req, res) => {
  try {
    const { new_password, current_password } = req.body;
    
    if (!new_password) {
      return res.status(400).json({
        error: 'New password is required',
        code: 'VALIDATION_ERROR'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters',
        code: 'VALIDATION_ERROR'
      });
    }

    // Update password with Supabase
    const { data, error } = await supabase.auth.admin.updateUserById(
      req.user.id,
      { password: new_password }
    );

    if (error) {
      logger.warn('Password update failed', { 
        userId: req.user.id,
        error: error.message,
        correlationId: req.correlationId
      });
      return res.status(400).json({
        error: error.message,
        code: 'UPDATE_FAILED'
      });
    }

    res.json({
      message: 'Password updated successfully'
    });
  } catch (error) {
    logger.error('Password update error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /v1/auth/reset-password - Password reset request
router.post('/reset-password', auditLog('password_reset'), async (req, res) => {
  try {
    const { email, redirect_url } = req.body;
    
    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
        code: 'VALIDATION_ERROR'
      });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirect_url
    });

    if (error) {
      logger.warn('Password reset failed', { 
        email,
        error: error.message,
        correlationId: req.correlationId
      });
      return res.status(400).json({
        error: error.message,
        code: 'RESET_FAILED'
      });
    }

    res.json({
      message: 'Password reset email sent'
    });
  } catch (error) {
    logger.error('Password reset error', { 
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Health check for Auth module
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Onasis-CORE Auth API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    capabilities: [
      'user_authentication',
      'session_management',
      'oauth_callback',
      'profile_management',
      'password_reset',
      'audit_logging'
    ]
  });
});

module.exports = router;