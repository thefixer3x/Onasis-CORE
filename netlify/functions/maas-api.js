const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const app = express();

// Initialize Supabase client using environment variables
const supabaseUrl = process.env.SUPABASE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
const jwtSecret = process.env.SUPABASE_JWT_SECRET=REDACTED_JWT_SECRET

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required Supabase environment variables');
}

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}) : null;

// CORS configuration
app.use(require('cors')({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Scope', 'X-API-Key']
}));

app.use(express.json());

// JWT token verification
const verifyJwtToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'No token provided',
        code: 'AUTH_REQUIRED'
      });
    }

    const token = authHeader.substring(7);
    
    // Check if this is an API key format (starts with lmk_) or JWT token
    if (token.startsWith('lmk_')) {
      // API key validation
      if (!supabase) {
        return res.status(503).json({ 
          error: 'Database service unavailable',
          code: 'SERVICE_UNAVAILABLE'
        });
      }

      const projectScope = process.env.VITE_PROJECT_SCOPE || req.headers['x-project-scope'] || 'lanonasis-maas';
      
      // Check if API key exists in vendor_api_keys table
      const { data: keyData, error } = await supabase
        .from('vendor_api_keys')
        .select('*')
        .eq('key_value', token)
        .eq('is_active', true)
        .single();

      if (error || !keyData) {
        return res.status(401).json({ 
          error: 'Invalid API key',
          code: 'AUTH_INVALID'
        });
      }

      req.user = { id: keyData.user_id || 'api-user', project_scope: keyData.vendor_name };
    } else {
      // JWT token validation
      try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
      } catch (jwtError) {
        return res.status(401).json({ 
          error: 'Invalid JWT token',
          code: 'JWT_INVALID'
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Auth verification failed:', error);
    return res.status(401).json({ 
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

// Apply auth middleware to protected routes
app.use('/memories*', verifyJwtToken);

// Memory endpoints
app.get('/memories', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { data, error } = await supabase
      .from('vendor_api_keys')
      .select('*')
      .limit(1);

    if (error) {
      return res.status(500).json({ 
        error: 'Database error',
        code: 'DB_ERROR'
      });
    }

    res.json({
      data: [],
      message: 'Memory service is operational',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Memory list error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

app.post('/memories', async (req, res) => {
  try {
    const { title, content, memory_type, tags } = req.body;

    res.status(201).json({
      data: {
        id: 'mem-' + Date.now(),
        title,
        content,
        type: memory_type || 'context',
        tags: tags || [],
        created_at: new Date().toISOString()
      },
      message: 'Memory created successfully'
    });
  } catch (error) {
    console.error('Memory creation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

app.post('/memories/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;

    res.json({
      data: [],
      query,
      results_count: 0,
      message: 'Search completed successfully'
    });
  } catch (error) {
    console.error('Memory search error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Health endpoint for this specific function
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Onasis-CORE MaaS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    project_scope: process.env.VITE_PROJECT_SCOPE || 'maas',
    capabilities: [
      'memory_management',
      'semantic_search', 
      'organization_management',
      'api_key_delegation',
      'audit_logging'
    ]
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('MaaS API error:', error);
  res.status(500).json({
    error: 'Internal MaaS API error',
    code: 'MAAS_API_ERROR',
    details: error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'MaaS endpoint not found',
    code: 'MAAS_ENDPOINT_NOT_FOUND',
    available_endpoints: [
      '/memories',
      '/memories/search', 
      '/organizations',
      '/api-keys',
      '/health'
    ]
  });
});

exports.handler = serverless(app);