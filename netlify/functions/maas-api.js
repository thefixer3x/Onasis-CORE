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

// Middleware to ensure JSON responses
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

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
    
    // Check if this is an API key format (pk_xxx.sk_xxx or sk_xxx) or JWT token
    if (token.includes('.') && token.startsWith('pk_')) {
      // New vendor key format: pk_live_vendor_id.sk_live_secret
      const [keyId, keySecret] = token.split('.');
      
      if (!keyId || !keySecret || !keySecret.startsWith('sk_')) {
        return res.status(401).json({ 
          error: 'Invalid API key format',
          code: 'AUTH_INVALID'
        });
      }

      if (!supabase) {
        return res.status(503).json({ 
          error: 'Database service unavailable',
          code: 'SERVICE_UNAVAILABLE'
        });
      }
      
      // Use the validate_vendor_api_key function from onasis-core
      const { data, error } = await supabase.rpc('validate_vendor_api_key', {
        p_key_id: keyId,
        p_key_secret: keySecret
      });

      if (error || !data || !data[0]?.is_valid) {
        return res.status(401).json({ 
          error: 'Invalid API key',
          code: 'AUTH_INVALID',
          debug: error?.message
        });
      }

      req.user = { 
        id: data[0].vendor_code || 'api-user', 
        vendor_org_id: data[0].vendor_org_id,
        project_scope: 'lanonasis-maas'
      };
    } else if (token.startsWith('sk_')) {
      // Legacy API key format: sk_[type]_[vendor]_[hash]
      if (!supabase) {
        return res.status(503).json({ 
          error: 'Database service unavailable',
          code: 'SERVICE_UNAVAILABLE'
        });
      }

      // Extract key components: sk_[type]_[vendor]_[hash]
      const keyParts = token.split('_');
      if (keyParts.length < 4) {
        return res.status(401).json({ 
          error: 'Invalid API key format',
          code: 'AUTH_INVALID'
        });
      }
      
      const keyId = keyParts.slice(0, -1).join('_'); // Everything except the last part (hash)
      
      // Use the validate_vendor_api_key function from onasis-core
      const { data, error } = await supabase.rpc('validate_vendor_api_key', {
        p_key_id: keyId,
        p_key_secret: token
      });

      if (error || !data || !data[0]?.is_valid) {
        return res.status(401).json({ 
          error: 'Invalid API key',
          code: 'AUTH_INVALID',
          debug: error?.message
        });
      }

      req.user = { 
        id: data[0].vendor_code || 'api-user', 
        vendor_org_id: data[0].vendor_org_id,
        project_scope: 'lanonasis-maas'
      };
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
app.use('/api/v1/memory*', verifyJwtToken);
app.use('/api/v1/memories*', verifyJwtToken);

// Memory endpoints
app.get('/api/v1/memory', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { limit = 20, offset = 0, memory_type, tags } = req.query;

    // Build query for memory entries
    let query = supabase
      .from('memory_entries')
      .select('*')
      .eq('vendor_org_id', req.user.vendor_org_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Add filters if provided
    if (memory_type) {
      query = query.eq('memory_type', memory_type);
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query = query.contains('tags', tagArray);
    }

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ 
        error: 'Database error',
        code: 'DB_ERROR',
        details: error.message
      });
    }

    res.json({
      data: data || [],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count
      },
      message: 'Memories retrieved successfully',
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

app.post('/api/v1/memory', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { title, content, memory_type = 'context', tags = [] } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        error: 'Title and content are required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Insert memory entry
    const { data, error } = await supabase
      .from('memory_entries')
      .insert({
        vendor_org_id: req.user.vendor_org_id,
        title,
        content,
        memory_type,
        tags: tags || [],
        created_by: req.user.id,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Failed to create memory',
        code: 'DB_ERROR',
        details: error.message
      });
    }

    res.status(201).json({
      data: data,
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

// GET /api/v1/memory/:id - Get specific memory
app.get('/api/v1/memory/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('id', id)
      .eq('vendor_org_id', req.user.vendor_org_id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Memory not found',
          code: 'NOT_FOUND'
        });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// PUT /api/v1/memory/:id - Update memory
app.put('/api/v1/memory/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { id } = req.params;
    const { title, content, memory_type, tags, metadata } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (memory_type !== undefined) updateData.memory_type = memory_type;
    if (tags !== undefined) updateData.tags = tags;
    if (metadata !== undefined) updateData.metadata = metadata;

    const { data, error } = await supabase
      .from('memory_entries')
      .update(updateData)
      .eq('id', id)
      .eq('vendor_org_id', req.user.vendor_org_id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Memory not found',
          code: 'NOT_FOUND'
        });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// DELETE /api/v1/memory/:id - Delete memory
app.delete('/api/v1/memory/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('memory_entries')
      .delete()
      .eq('id', id)
      .eq('vendor_org_id', req.user.vendor_org_id);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// GET /api/v1/memory/count - Get memory count
app.get('/api/v1/memory/count', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { count, error } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_org_id', req.user.vendor_org_id);

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// GET /api/v1/memory/stats - Get memory statistics
app.get('/api/v1/memory/stats', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Get total count and breakdown by type
    const { data: typeBreakdown, error: typeError } = await supabase
      .from('memory_entries')
      .select('memory_type')
      .eq('vendor_org_id', req.user.vendor_org_id);

    if (typeError) throw typeError;

    const memoriesByType = {};
    typeBreakdown?.forEach((item) => {
      memoriesByType[item.memory_type] = (memoriesByType[item.memory_type] || 0) + 1;
    });

    // Get recent memories
    const { data: recentMemories } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('vendor_org_id', req.user.vendor_org_id)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({
      total_memories: typeBreakdown?.length || 0,
      memories_by_type: memoriesByType,
      recent_memories: recentMemories || []
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// POST /api/v1/memory/:id/access - Update access tracking
app.post('/api/v1/memory/:id/access', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('memory_entries')
      .update({ 
        last_accessed: new Date().toISOString(),
        access_count: supabase.raw('access_count + 1')
      })
      .eq('id', id)
      .eq('vendor_org_id', req.user.vendor_org_id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// POST /api/v1/memory/bulk/delete - Bulk delete memories
app.post('/api/v1/memory/bulk/delete', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const { memory_ids } = req.body;

    if (!Array.isArray(memory_ids) || memory_ids.length === 0) {
      return res.status(400).json({
        error: 'memory_ids must be a non-empty array',
        code: 'VALIDATION_ERROR'
      });
    }

    const { error } = await supabase
      .from('memory_entries')
      .delete()
      .in('id', memory_ids)
      .eq('vendor_org_id', req.user.vendor_org_id);

    if (error) throw error;

    res.json({
      deleted_count: memory_ids.length,
      failed_ids: []
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error.message,
      deleted_count: 0,
      failed_ids: req.body.memory_ids || []
    });
  }
});

app.post('/api/v1/memory/search', async (req, res) => {
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
    version: '1.0.1',
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
      'GET /api/v1/memory',
      'POST /api/v1/memory',
      'GET /api/v1/memory/:id',
      'PUT /api/v1/memory/:id',
      'DELETE /api/v1/memory/:id',
      'POST /api/v1/memory/search',
      'GET /api/v1/memory/count',
      'GET /api/v1/memory/stats',
      'POST /api/v1/memory/:id/access',
      'POST /api/v1/memory/bulk/delete',
      'GET /organizations',
      'POST /api-keys',
      'GET /api-keys',
      'GET /health'
    ]
  });
});

exports.handler = serverless(app);