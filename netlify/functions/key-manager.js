const { Handler } = require('@netlify/functions');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL=https://<project-ref>.supabase.co
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('SUPABASE_URL=https://<project-ref>.supabase.co
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Encryption setup
const ENCRYPTION_KEY = process.env.KEY_ENCRYPTION_SECRET || 'default-key-change-in-production';
const ALGORITHM = 'aes-256-gcm';

// Encryption utilities
const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  try {
    const authTag = cipher.getAuthTag();
    return {
      encrypted: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    // Fallback for environments without GCM support
    return {
      encrypted: encrypted,
      iv: iv.toString('hex'),
      authTag: 'fallback'
    };
  }
};

const decrypt = (encryptedData) => {
  try {
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
    if (encryptedData.authTag !== 'fallback') {
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    }
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

// Authentication helper
const authenticate = async (headers) => {
  const token = headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return { error: 'Invalid authentication token', code: 'AUTH_INVALID' };
    }

    // Check if user has admin role
    if (user.user_metadata?.role !== 'admin') {
      return { error: 'Admin access required', code: 'ACCESS_DENIED' };
    }

    return { user };
  } catch (error) {
    return { error: 'Authentication failed', code: 'AUTH_FAILED' };
  }
};

// Main handler
exports.handler = async (event, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const { httpMethod, path, headers, body } = event;
    const requestBody = body ? JSON.parse(body) : {};
    
    // Extract path after /v1/keys/
    const pathParts = path.replace('/v1/keys/', '').split('/');
    const resource = pathParts[0]; // 'vendors'
    const id = pathParts[1]; // key ID if present
    const action = pathParts[2]; // 'rotate' if present

    // Health check endpoint
    if (path.includes('/health')) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          status: 'ok',
          service: 'Onasis-CORE Key Manager',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          capabilities: [
            'vendor_key_storage',
            'key_encryption', 
            'key_rotation',
            'admin_access_control'
          ]
        })
      };
    }

    // Authenticate for all non-health endpoints
    const authResult = await authenticate(headers);
    if (authResult.error) {
      return {
        statusCode: authResult.code === 'ACCESS_DENIED' ? 403 : 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: authResult.error,
          code: authResult.code
        })
      };
    }

    // Route vendor key operations
    if (resource === 'vendors') {
      switch (httpMethod) {
        case 'GET':
          if (id) {
            // Get specific vendor key
            const { data: keyData, error } = await supabase
              .from('vendor_api_keys')
              .select('*')
              .eq('id', id)
              .eq('is_active', true)
              .single();

            if (error || !keyData) {
              return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({
                  error: 'Vendor key not found',
                  code: 'KEY_NOT_FOUND'
                })
              };
            }

            // Decrypt the key for admin access
            const decryptedKey = decrypt(JSON.parse(keyData.encrypted_key));

            // Update last accessed time
            await supabase
              .from('vendor_api_keys')
              .update({ last_used_at: new Date().toISOString() })
              .eq('id', id);

            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify({
                success: true,
                data: {
                  ...keyData,
                  decrypted_key: decryptedKey,
                  encrypted_key: undefined
                }
              })
            };
          } else {
            // List all vendor keys
            const { data: keys, error } = await supabase
              .from('vendor_api_keys')
              .select('id, vendor_name, key_name, created_at, updated_at, last_used_at, is_active, description')
              .eq('is_active', true)
              .order('vendor_name');

            if (error) {
              throw error;
            }

            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify({
                success: true,
                data: keys || [],
                count: keys?.length || 0
              })
            };
          }

        case 'POST':
          if (id && action === 'rotate') {
            // Rotate vendor key
            const { new_api_key } = requestBody;

            if (!new_api_key) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                  error: 'new_api_key is required',
                  code: 'VALIDATION_ERROR'
                })
              };
            }

            const encryptedData = encrypt(new_api_key);

            const { data, error } = await supabase
              .from('vendor_api_keys')
              .update({
                encrypted_key: JSON.stringify(encryptedData),
                updated_at: new Date().toISOString()
              })
              .eq('id', id)
              .select()
              .single();

            if (error || !data) {
              return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({
                  error: 'Vendor key not found',
                  code: 'KEY_NOT_FOUND'
                })
              };
            }

            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify({
                success: true,
                message: 'Vendor key rotated successfully',
                data: {
                  ...data,
                  encrypted_key: undefined
                }
              })
            };
          } else {
            // Create new vendor key
            const { vendor_name, key_name, api_key, description } = requestBody;

            if (!vendor_name || !key_name || !api_key) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                  error: 'vendor_name, key_name, and api_key are required',
                  code: 'VALIDATION_ERROR'
                })
              };
            }

            const encryptedData = encrypt(api_key);

            const keyRecord = {
              id: crypto.randomUUID(),
              vendor_name,
              key_name,
              encrypted_key: JSON.stringify(encryptedData),
              description: description || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              is_active: true
            };

            const { data, error } = await supabase
              .from('vendor_api_keys')
              .insert([keyRecord])
              .select()
              .single();

            if (error) {
              throw error;
            }

            return {
              statusCode: 201,
              headers: corsHeaders,
              body: JSON.stringify({
                success: true,
                data: {
                  ...data,
                  encrypted_key: undefined
                }
              })
            };
          }

        case 'PUT':
          if (id) {
            // Update vendor key
            const { key_name, api_key, description, is_active } = requestBody;

            const updates = {
              updated_at: new Date().toISOString()
            };

            if (key_name) updates.key_name = key_name;
            if (description !== undefined) updates.description = description;
            if (is_active !== undefined) updates.is_active = is_active;

            if (api_key) {
              const encryptedData = encrypt(api_key);
              updates.encrypted_key = JSON.stringify(encryptedData);
            }

            const { data, error } = await supabase
              .from('vendor_api_keys')
              .update(updates)
              .eq('id', id)
              .select()
              .single();

            if (error || !data) {
              return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({
                  error: 'Vendor key not found',
                  code: 'KEY_NOT_FOUND'
                })
              };
            }

            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify({
                success: true,
                data: {
                  ...data,
                  encrypted_key: undefined
                }
              })
            };
          }
          break;

        case 'DELETE':
          if (id) {
            // Soft delete vendor key
            const { data, error } = await supabase
              .from('vendor_api_keys')
              .update({ 
                is_active: false,
                updated_at: new Date().toISOString()
              })
              .eq('id', id)
              .select()
              .single();

            if (error || !data) {
              return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({
                  error: 'Vendor key not found',
                  code: 'KEY_NOT_FOUND'
                })
              };
            }

            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify({
                success: true,
                message: 'Vendor key deactivated successfully'
              })
            };
          }
          break;
      }
    }

    // Default 404 response
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Endpoint not found',
        code: 'NOT_FOUND'
      })
    };

  } catch (error) {
    console.error('Key Manager error:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal key manager error',
        code: 'KEY_MANAGER_ERROR',
        details: error.message
      })
    };
  }
};