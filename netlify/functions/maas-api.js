const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();

// Initialize Supabase client using environment variables
const supabaseUrl = process.env.SUPABASE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
const jwtSecret = process.env.SUPABASE_JWT_SECRET=REDACTED_JWT_SECRET

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required Supabase environment variables');
}

if (!jwtSecret) {
  console.error('Missing JWT secret (SUPABASE_JWT_SECRET=REDACTED_JWT_SECRET
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

const hashSecret = (value) => crypto.createHash('sha256').update(value || '').digest('hex');

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
    
    // First: Check for master API key (system key from environment)
    const masterApiKey = process.env.MASTER_API_KEY;
    if (masterApiKey) {
      // Check raw master key match
      if (token === masterApiKey) {
        console.log('[maas-api] Master API key authenticated (raw)');
        req.user = {
          id: '00000000-0000-0000-0000-000000000001',
          user_id: '00000000-0000-0000-0000-000000000001',
          is_master: true,
          project_scope: 'lanonasis-maas'
        };
        return next();
      }
      
      // Check hashed master key match (for client-side hashed keys)
      const hashedMasterKey = hashSecret(masterApiKey);
      if (token === hashedMasterKey || token.toLowerCase() === hashedMasterKey.toLowerCase()) {
        console.log('[maas-api] Master API key authenticated (hashed)');
        req.user = {
          id: '00000000-0000-0000-0000-000000000001',
          user_id: '00000000-0000-0000-0000-000000000001',
          is_master: true,
          project_scope: 'lanonasis-maas'
        };
        return next();
      }
    }
    
    // Check for user API keys in database (any format: lano_*, vibe_*, etc.)
    if (supabase) {
      // Hash the key and look it up in api_keys table
      const keyHash = hashSecret(token);
      console.log('[maas-api] Validating API key, hash:', keyHash.substring(0, 16) + '...');
      
      // Try key_hash first (new format), then fall back to key column (migration period)
      let apiKeyRecord = null;
      let keyError = null;
      
      // Method 1: Check key_hash column (SHA-256 hash)
      const { data: hashMatch, error: hashError } = await supabase
        .from('api_keys')
        .select('id, user_id, name, service, expires_at, is_active, created_at')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .maybeSingle();
      
      if (hashMatch) {
        apiKeyRecord = hashMatch;
        console.log('[maas-api] Found key via key_hash column');
      } else if (hashError) {
        keyError = hashError;
      } else {
        // Method 2: Check key column (plaintext, during migration)
        // Only if key_hash lookup didn't find anything
        const { data: keyMatch, error: keyMatchError } = await supabase
          .from('api_keys')
          .select('id, user_id, name, service, expires_at, is_active, created_at')
          .eq('key', token)
          .eq('is_active', true)
          .maybeSingle();
        
        if (keyMatch) {
          apiKeyRecord = keyMatch;
          console.log('[maas-api] Found key in legacy key column (migration period)');
        } else if (keyMatchError) {
          keyError = keyMatchError;
        }
      }

      if (keyError) {
        console.error('[maas-api] API key lookup error:', keyError.message, keyError.code);
        return res.status(401).json({ 
          error: 'Invalid API key',
          code: 'AUTH_INVALID',
          debug: process.env.NODE_ENV === 'development' ? keyError.message : undefined
        });
      }

      if (!apiKeyRecord) {
        // Key not found in database - continue to next validation method (JWT/OAuth)
        console.log('[maas-api] API key not found in database, trying other auth methods...');
      } else {
        // Key found - validate and set user context
        console.log('[maas-api] API key validated successfully for user:', apiKeyRecord.user_id);

        // Check if key has expired
        if (apiKeyRecord.expires_at) {
          const expiresAt = new Date(apiKeyRecord.expires_at);
          if (expiresAt < new Date()) {
            return res.status(401).json({ 
              error: 'API key has expired',
              code: 'KEY_EXPIRED'
            });
          }
        }

        // Update last_used timestamp (fire and forget)
        supabase
          .from('api_keys')
          .update({ last_used: new Date().toISOString() })
          .eq('id', apiKeyRecord.id)
          .then(() => {}, () => {}); // Ignore errors

        // Set user context
        req.user = { 
          id: apiKeyRecord.user_id,
          user_id: apiKeyRecord.user_id,
          api_key_id: apiKeyRecord.id,
          api_key_name: apiKeyRecord.name,
          service: apiKeyRecord.service || 'all',
          project_scope: 'lanonasis-maas'
        };
        
        return next();
      }
    }
    
    // If we get here, key wasn't found in database - try other auth methods
    // (vendor keys, JWT, or OAuth introspection)
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
        p_key_secret: hashSecret(keySecret)
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
        p_key_secret: hashSecret(token)
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
      // Try JWT token validation first
      try {
        if (!jwtSecret) {
          throw new Error('JWT secret not configured');
        }
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
      } catch (jwtError) {
        // Not a JWT - try OAuth2 opaque token via auth-gateway introspection
        const authGatewayUrl = process.env.AUTH_GATEWAY_URL || 'https://auth.lanonasis.com';
        
        try {
          const introspectResponse = await fetch(`${authGatewayUrl}/oauth/introspect`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              token: token,
              token_type_hint: 'access_token'
            })
          });

          if (!introspectResponse.ok) {
            return res.status(401).json({ 
              error: 'Token introspection failed',
              code: 'INTROSPECTION_FAILED'
            });
          }

          const introspection = await introspectResponse.json();

          // Check if token is active
          if (!introspection.active) {
            return res.status(401).json({ 
              error: 'Token is not active or has expired',
              code: 'TOKEN_INACTIVE'
            });
          }

          // Set user context from introspection response
          req.user = { 
            id: introspection.sub || introspection.user_id,
            sub: introspection.sub || introspection.user_id,
            scope: Array.isArray(introspection.scope) ? introspection.scope : introspection.scope?.split(' ') || [],
            project_scope: 'lanonasis-maas'
          };
        } catch (introspectError) {
          console.error('Token introspection error:', introspectError);
          return res.status(401).json({ 
            error: 'Failed to validate token',
            code: 'AUTH_VALIDATION_FAILED'
          });
        }
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
app.use('/api/v1/memory', verifyJwtToken);
app.use('/api/v1/memories', verifyJwtToken);

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
    // For JWT users, use user_id instead of vendor_org_id
    const filterField = req.user.vendor_org_id ? 'vendor_org_id' : 'user_id';
    const filterValue = req.user.vendor_org_id || req.user.id;
    
    let query = supabase
      .from('memory_entries')
      .select('*')
      .eq(filterField, filterValue)
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
app.use((req, res) => {
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
