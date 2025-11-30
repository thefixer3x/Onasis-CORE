const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();

// Initialize Supabase client using environment variables
const supabaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required Supabase environment variables');
}

if (!jwtSecret) {
  console.error('Missing JWT secret (SUPABASE_JWT_SECRET or JWT_SECRET)');
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

// Custom body parser middleware for serverless-http compatibility
// This handles cases where express.json() doesn't parse correctly
app.use((req, res, next) => {
  // Only process POST/PUT/PATCH requests with JSON content
  if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') 
      && req.headers['content-type']?.includes('application/json')) {
    
    // Check if body is already properly parsed (object with non-numeric keys)
    const hasValidKeys = req.body && typeof req.body === 'object' && !Array.isArray(req.body) 
        && !Buffer.isBuffer(req.body) && Object.keys(req.body).some(key => isNaN(parseInt(key)));
    
    if (hasValidKeys) {
      return next();
    }

    // Body is not properly parsed - try to fix it
    let rawBody = req.body;
    let needsParsing = false;
    
    // Case 1: Body is an array (character codes)
    if (Array.isArray(rawBody)) {
      console.log('[maas-api] Body is array, reconstructing from character codes');
      rawBody = String.fromCharCode(...rawBody);
      needsParsing = true;
    }
    // Case 2: Body is object with only numeric keys (array-like object)
    else if (rawBody && typeof rawBody === 'object' 
        && Object.keys(rawBody).length > 0
        && Object.keys(rawBody).every(key => !isNaN(parseInt(key)))) {
      console.log('[maas-api] Body has numeric keys, reconstructing from character codes');
      // Get values in order and convert to string
      const values = Object.keys(rawBody)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(key => rawBody[key]);
      rawBody = String.fromCharCode(...values);
      needsParsing = true;
    }
    // Case 3: Body is a Buffer
    else if (Buffer.isBuffer(rawBody)) {
      console.log('[maas-api] Body is Buffer, converting to string');
      rawBody = rawBody.toString('utf8');
      needsParsing = true;
    }
    // Case 4: Body is already a string
    else if (typeof rawBody === 'string') {
      needsParsing = true;
    }

    // Parse the reconstructed/raw body
    if (needsParsing && rawBody) {
      try {
        req.body = JSON.parse(rawBody);
        console.log('[maas-api] Successfully parsed body in middleware');
      } catch (e) {
        console.error('[maas-api] Failed to parse body in middleware:', e);
        console.error('[maas-api] Raw body (first 200 chars):', rawBody.substring(0, 200));
      }
    }
  }
  next();
});

// Body parsing middleware - must be before routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Debug middleware to log request body (remove in production)
if (process.env.DEBUG === 'true') {
  app.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT') {
      console.log('[maas-api] Request body:', JSON.stringify(req.body));
      console.log('[maas-api] Content-Type:', req.headers['content-type']);
      console.log('[maas-api] Body keys:', Object.keys(req.body || {}));
    }
    next();
  });
}

// Middleware to ensure JSON responses
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

const hashSecret = (value) => crypto.createHash('sha256').update(value || '').digest('hex');

/**
 * Resolve organization_id from vendor_org_id or return existing organization_id
 * For public.memory_entries, we need organization_id (from public.organizations)
 * Vendor API keys provide vendor_org_id (from vendor_organizations)
 * 
 * Strategy:
 * 1. If organization_id already exists, use it
 * 2. Check if vendor_org_id exists in public.organizations (same UUID)
 * 3. Check if vendor_organizations has an organization_id mapping
 * 4. Fallback: use vendor_org_id directly (if they're the same in your setup)
 */
const resolveOrganizationId = async (vendorOrgId, existingOrgId, supabaseClient) => {
  // If we already have organization_id, use it
  if (existingOrgId) {
    return existingOrgId;
  }

  // If no vendor_org_id, can't resolve
  if (!vendorOrgId || !supabaseClient) {
    return null;
  }

  try {
    // Strategy 1: Check if vendor_org_id exists in public.organizations (same UUID)
    // This handles the case where vendor_org_id == organization_id
    const { data: orgData, error: orgError } = await supabaseClient
      .from('organizations')
      .select('id')
      .eq('id', vendorOrgId)
      .maybeSingle(); // Use maybeSingle to avoid error if not found

    if (!orgError && orgData?.id) {
      console.log('[maas-api] Found organization_id matching vendor_org_id:', orgData.id);
      return orgData.id;
    }

    // Strategy 2: Check if vendor_organizations table has organization_id column
    // Some setups might have a direct mapping
    const { data: vendorOrgData, error: vendorError } = await supabaseClient
      .from('vendor_organizations')
      .select('id, organization_id')
      .eq('id', vendorOrgId)
      .maybeSingle();

    if (!vendorError && vendorOrgData?.organization_id) {
      console.log('[maas-api] Found organization_id from vendor_organizations:', vendorOrgData.organization_id);
      return vendorOrgData.organization_id;
    }

    // Strategy 3: Fallback - use vendor_org_id as organization_id
    // This works if your setup uses the same UUID for both
    // OR if public.memory_entries.organization_id can accept vendor_org_id values
    console.log('[maas-api] Using vendor_org_id as organization_id (fallback):', vendorOrgId);
    return vendorOrgId;
  } catch (error) {
    console.error('[maas-api] Error resolving organization_id:', error);
    // Final fallback: use vendor_org_id as organization_id
    return vendorOrgId;
  }
};

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

        // Resolve organization_id if available from API key record
        // API keys might have organization_id directly, or we need to look it up
        let organizationId = apiKeyRecord.organization_id || null;
        
        console.log('[maas-api] API key record:', {
          id: apiKeyRecord.id,
          user_id: apiKeyRecord.user_id,
          organization_id: apiKeyRecord.organization_id,
          vendor_org_id: apiKeyRecord.vendor_org_id,
          allKeys: Object.keys(apiKeyRecord)
        });
        
        // If API key has vendor_org_id, resolve it
        if (!organizationId && apiKeyRecord.vendor_org_id) {
          console.log('[maas-api] Resolving organization_id from vendor_org_id:', apiKeyRecord.vendor_org_id);
          organizationId = await resolveOrganizationId(
            apiKeyRecord.vendor_org_id,
            null,
            supabase
          );
          console.log('[maas-api] Resolved organization_id:', organizationId);
        }
        
        // Fallback: Fetch user's organization_id from users table if still not found
        if (!organizationId && supabase && apiKeyRecord.user_id) {
          try {
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('organization_id, id')
              .eq('id', apiKeyRecord.user_id)
              .maybeSingle();
            
            if (userError) {
              console.warn('[maas-api] Error fetching user organization_id:', userError.message);
            } else if (userData?.organization_id) {
              organizationId = userData.organization_id;
              console.log('[maas-api] Found organization_id from users table:', organizationId);
            } else {
              console.warn('[maas-api] User found but has no organization_id:', apiKeyRecord.user_id);
            }
          } catch (userError) {
            console.warn('[maas-api] Could not fetch user organization_id:', userError.message);
          }
        }
        
        // DO NOT use user_id as organization_id - it violates foreign key constraint
        // If we still don't have organization_id, we'll need to handle it in the endpoint

        // Set user context with organization_id
        req.user = { 
          id: apiKeyRecord.user_id,
          user_id: apiKeyRecord.user_id,
          organization_id: organizationId,
          vendor_org_id: apiKeyRecord.vendor_org_id || organizationId, // Use vendor_org_id if available, otherwise use organizationId
          api_key_id: apiKeyRecord.id,
          api_key_name: apiKeyRecord.name,
          service: apiKeyRecord.service || 'all',
          project_scope: 'lanonasis-maas'
        };
        
        console.log('[maas-api] Set req.user:', {
          id: req.user.id,
          organization_id: req.user.organization_id,
          vendor_org_id: req.user.vendor_org_id
        });
        
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

      console.log('[maas-api] Vendor API key validation result (pk_ format):', {
        is_valid: data[0]?.is_valid,
        vendor_org_id: data[0]?.vendor_org_id,
        vendor_code: data[0]?.vendor_code
      });

      // Resolve organization_id from vendor_org_id for public.memory_entries compatibility
      const organizationId = await resolveOrganizationId(
        data[0].vendor_org_id,
        null,
        supabase
      );

      console.log('[maas-api] Resolved organization_id for vendor key (pk_ format):', organizationId);

      req.user = { 
        id: data[0].vendor_code || 'api-user', 
        vendor_org_id: data[0].vendor_org_id,
        organization_id: organizationId, // Add organization_id for public.memory_entries
        project_scope: 'lanonasis-maas'
      };
      
      console.log('[maas-api] Set req.user for vendor key (pk_ format):', {
        id: req.user.id,
        organization_id: req.user.organization_id,
        vendor_org_id: req.user.vendor_org_id
      });
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

      // Resolve organization_id from vendor_org_id for public.memory_entries compatibility
      const organizationId = await resolveOrganizationId(
        data[0].vendor_org_id,
        null,
        supabase
      );

      req.user = { 
        id: data[0].vendor_code || 'api-user', 
        vendor_org_id: data[0].vendor_org_id,
        organization_id: organizationId, // Add organization_id for public.memory_entries
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

    // Build query for memory entries using public.memory_entries schema
    // Resolve organization ID from multiple sources
    const organizationId = req.user?.organization_id 
      || req.user?.vendor_org_id 
      || req.user?.organizationId
      || req.user?.id; // Fallback to user ID
    
    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID',
        debug: {
          sources_checked: ['user.organization_id', 'user.vendor_org_id', 'user.id'],
          has_user: !!req.user,
          user_has_org_id: !!req.user?.organization_id,
          user_has_vendor_org_id: !!req.user?.vendor_org_id
        }
      });
    }
    
    let query = supabase
      .from('memory_entries')
      .select('*')
      .eq('organization_id', organizationId)
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

    const bodyData = req.body || {};
    const { title, content, memory_type = 'context', tags = [] } = bodyData;

    // Validate required fields
    if (!title || !content) {
      console.error('[maas-api] Validation failed - title:', title, 'content:', content);
      return res.status(400).json({
        error: 'Title and content are required',
        code: 'VALIDATION_ERROR',
        received: {
          hasTitle: !!title,
          hasContent: !!content,
          titleValue: title,
          contentValue: content,
          bodyKeys: Object.keys(bodyData)
        }
      });
    }

    // Debug: Log user context to see what we have
    console.log('[maas-api] User context:', {
      hasUser: !!req.user,
      userId: req.user?.id || req.user?.user_id,
      organizationId: req.user?.organization_id,
      vendorOrgId: req.user?.vendor_org_id,
      allUserKeys: req.user ? Object.keys(req.user) : []
    });

    // Resolve organization_id from multiple sources (in priority order):
    // 1. Request body (if provided and user has permission)
    // 2. User context from API key (organization_id)
    // 3. User context from API key (vendor_org_id, resolved)
    // 4. Fallback: try to resolve from vendor_org_id if available
    let organizationId = null;
    const bodyOrgId = bodyData.organization_id;

    if (bodyOrgId) {
      // If organization_id is provided in body, use it (user must have permission)
      // For now, we'll allow it if the user is authenticated
      if (req.user) {
        organizationId = bodyOrgId;
        console.log('[maas-api] Using organization_id from request body:', organizationId);
      }
    }
    
    if (!organizationId) {
      organizationId = req.user?.organization_id || req.user?.vendor_org_id;
    }
    
    // If still no organization_id and we have vendor_org_id, try to resolve it
    if (!organizationId && req.user?.vendor_org_id && supabase) {
      console.log('[maas-api] Attempting to resolve organization_id from vendor_org_id:', req.user.vendor_org_id);
      organizationId = await resolveOrganizationId(
        req.user.vendor_org_id,
        null,
        supabase
      );
      console.log('[maas-api] Resolved organization_id:', organizationId);
    }

    // Try to fetch organization_id from users table if still not found
    if (!organizationId && supabase && req.user?.id) {
      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('organization_id, id')
          .eq('id', req.user.id)
          .maybeSingle();
        
        if (userError) {
          console.warn('[maas-api] Error fetching user organization_id from users table:', userError.message);
        } else if (userData?.organization_id) {
          organizationId = userData.organization_id;
          console.log('[maas-api] Found organization_id from users table in endpoint:', organizationId);
        }
      } catch (userError) {
        console.warn('[maas-api] Exception fetching user organization_id:', userError.message);
      }
    }

    const userId = req.user?.user_id || req.user?.id;
    
    // DO NOT use user.id as organization_id - it violates foreign key constraint
    // organization_id must exist in the organizations table
    if (!organizationId) {
      console.error('[maas-api] Organization ID resolution failed:', {
        hasUser: !!req.user,
        userKeys: req.user ? Object.keys(req.user) : [],
        bodyOrgId: bodyOrgId,
        userOrgId: req.user?.organization_id,
        userVendorOrgId: req.user?.vendor_org_id,
        userId: userId
      });
      return res.status(400).json({
        error: 'Organization ID is required. User must be associated with an organization.',
        code: 'MISSING_ORG_ID',
        debug: {
          sources_checked: ['request_body', 'user.organization_id', 'user.vendor_org_id', 'users.organization_id'],
          has_user: !!req.user,
          user_has_org_id: !!req.user?.organization_id,
          user_has_vendor_org_id: !!req.user?.vendor_org_id,
          body_has_org_id: !!bodyOrgId,
          user_id: userId
        }
      });
    }

    // Insert memory entry
    const { data, error } = await supabase
      .from('memory_entries')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        title,
        content,
        memory_type: memory_type, // Use memory_type enum from public schema
        tags: tags || []
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

    const organizationId = req.user?.organization_id || req.user?.vendor_org_id;
    
    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID'
      });
    }

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
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
    const { title, content, memory_type, tags, metadata, organization_id: bodyOrgId } = req.body || {};

    let organizationId = bodyOrgId || req.user?.organization_id || req.user?.vendor_org_id;

    if (!organizationId && req.user?.vendor_org_id && supabase) {
      organizationId = await resolveOrganizationId(
        req.user.vendor_org_id,
        null,
        supabase
      );
    }

    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID'
      });
    }

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
      .eq('organization_id', organizationId)
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

    const organizationId = req.user?.organization_id || req.user?.vendor_org_id;
    
    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID'
      });
    }

    const { error } = await supabase
      .from('memory_entries')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

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

    const organizationId = req.user?.organization_id || req.user?.vendor_org_id;
    
    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID'
      });
    }

    const { count, error } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

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

    const organizationId = req.user?.organization_id || req.user?.vendor_org_id;
    
    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID'
      });
    }

    // Get total count and breakdown by type
    const { data: typeBreakdown, error: typeError } = await supabase
      .from('memory_entries')
      .select('memory_type')
      .eq('organization_id', organizationId);

    if (typeError) throw typeError;

    const memoriesByType = {};
    typeBreakdown?.forEach((item) => {
      memoriesByType[item.memory_type] = (memoriesByType[item.memory_type] || 0) + 1;
    });

    // Get recent memories
    const { data: recentMemories } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('organization_id', organizationId)
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

    const organizationId = req.user?.organization_id || req.user?.vendor_org_id;
    
    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID'
      });
    }

    // Use last_accessed (not last_accessed_at) for public schema
    // First, get current access_count
    const { data: currentData } = await supabase
      .from('memory_entries')
      .select('access_count')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    const newAccessCount = (currentData?.access_count || 0) + 1;

    const { error } = await supabase
      .from('memory_entries')
      .update({ 
        last_accessed: new Date().toISOString(),
        access_count: newAccessCount
      })
      .eq('id', id)
      .eq('organization_id', organizationId);

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

    const { memory_ids } = req.body || {};

    if (!Array.isArray(memory_ids) || memory_ids.length === 0) {
      return res.status(400).json({
        error: 'memory_ids must be a non-empty array',
        code: 'VALIDATION_ERROR'
      });
    }

    const organizationId = req.user?.organization_id || req.user?.vendor_org_id;
    
    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID'
      });
    }

    const { error } = await supabase
      .from('memory_entries')
      .delete()
      .in('id', memory_ids)
      .eq('organization_id', organizationId);

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
    if (!supabase) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid JSON payload',
          code: 'INVALID_JSON',
          details: error.message
        });
      }
    }

    const { query, limit = 10, memory_type, tags } = bodyData || {};

    if (!query) {
      return res.status(400).json({
        error: 'Query is required',
        code: 'VALIDATION_ERROR'
      });
    }

    const organizationId = req.user?.organization_id || req.user?.vendor_org_id;

    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID'
      });
    }

    const sanitizedQuery = query.replace(/%/g, '').replace(/_/g, '');
    let searchQuery = supabase
      .from('memory_entries')
      .select('*')
      .eq('organization_id', organizationId)
      .limit(limit);

    if (memory_type) {
      searchQuery = searchQuery.eq('memory_type', memory_type);
    }

    if (tags && tags.length) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      searchQuery = searchQuery.contains('tags', tagArray);
    }

    searchQuery = searchQuery.or(
      `title.ilike.%${sanitizedQuery}%,content.ilike.%${sanitizedQuery}%`
    );

    const { data, error } = await searchQuery;

    if (error) {
      return res.status(500).json({
        error: 'Search failed',
        code: 'DB_ERROR',
        details: error.message
      });
    }

    res.json({
      data: data || [],
      query,
      results_count: data?.length || 0,
      message: 'Search completed successfully'
    });
  } catch (error) {
    console.error('[maas-api] Memory search error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: error.message
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

exports.handler = serverless(app, {
  binary: false,
  request: (request, event) => {
    request.rawBody = event?.body;
    request.isBase64Encoded = event?.isBase64Encoded;

    if (event?.body && typeof event.body === 'string') {
      request.body = event.body;
    }

    return request;
  }
});

