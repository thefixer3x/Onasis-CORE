/**
 * Token Verification Endpoint
 * Verifies authentication tokens for CLI and other clients
 */

const { createClient } = require('@supabase/supabase-js');
const { jwtDecode } = require('jwt-decode');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Verify token endpoint
 * POST /auth/verify
 * Body: { token: string }
 * Returns: { valid: boolean, user?: object }
 */
exports.handler = async function(event) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { token } = body;

    if (!token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Token is required'
        })
      };
    }

    // Verify CLI tokens (format: cli_timestamp_random)
    if (token.startsWith('cli_')) {
      const parts = token.split('_');
      if (parts.length >= 3) {
        const timestamp = parseInt(parts[1]);
        if (!isNaN(timestamp)) {
          // CLI tokens valid for 30 days
          const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
          const isValid = (Date.now() - timestamp) < thirtyDaysInMs;
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              valid: isValid,
              type: 'cli_token',
              expires_at: new Date(timestamp + thirtyDaysInMs).toISOString()
            })
          };
        }
      }
      
      // Invalid CLI token format
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Invalid CLI token format'
        })
      };
    }

    // Verify JWT tokens
    try {
      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      
      if (decoded.exp && decoded.exp < now) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            valid: false,
            error: 'Token expired'
          })
        };
      }

      // Optional: Verify with Supabase if it's a Supabase token
      if (process.env.SUPABASE_URL
        try {
          const { data: user, error } = await supabase.auth.getUser(token);
          
          if (error || !user) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                valid: false,
                error: 'Invalid or revoked token'
              })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              valid: true,
              type: 'jwt',
              user: {
                id: user.user.id,
                email: user.user.email
              },
              expires_at: new Date(decoded.exp * 1000).toISOString()
            })
          };
        } catch (supabaseError) {
          // Fall back to local JWT validation if Supabase check fails
          console.warn('Supabase verification failed, using local validation');
        }
      }

      // Local JWT validation (fallback)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          type: 'jwt',
          expires_at: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null
        })
      };

    } catch (jwtError) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Invalid JWT token'
        })
      };
    }

  } catch (error) {
    console.error('Token verification error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        valid: false,
        error: 'Internal server error'
      })
    };
  }
};
