const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL=https://<project-ref>.supabase.co
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
const jwtSecret = process.env.SUPABASE_JWT_SECRET=REDACTED_JWT_SECRET

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}) : null;

/**
 * Dashboard Authentication Callback Handler
 * Processes authentication callbacks and redirects to dashboard with tokens
 */
exports.handler = async (event, context) => {
  console.log('Dashboard callback handler invoked');
  console.log('Query params:', event.queryStringParameters);
  
  // Only handle GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const { code, state, error, error_description, token, user_id } = event.queryStringParameters || {};
  const dashboardUrl = 'https://dashboard.lanonasis.com';

  try {
    // Handle errors
    if (error) {
      console.error('Auth error:', error, error_description);
      return {
        statusCode: 302,
        headers: {
          'Location': `${dashboardUrl}/?auth_error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || '')}`
        }
      };
    }

    // Handle direct token pass (from auth.html form submission)
    if (token) {
      console.log('Direct token received, validating...');
      
      // Validate token
      try {
        const decoded = jwt.verify(token, jwtSecret);
        console.log('Token valid, redirecting to dashboard');
        
        // Redirect to dashboard with token and set secure cookie
        return {
          statusCode: 302,
          headers: {
            'Location': `${dashboardUrl}/?auth_success=true&user_id=${decoded.sub || decoded.id}`,
            'Set-Cookie': `auth_token=${token}; Path=/; Domain=.lanonasis.com; Max-Age=86400; SameSite=Lax; Secure`
          }
        };
      } catch (err) {
        console.error('Token validation failed:', err);
        return {
          statusCode: 302,
          headers: {
            'Location': `${dashboardUrl}/?auth_error=invalid_token`
          }
        };
      }
    }

    // Handle OAuth authorization code
    if (code) {
      console.log('OAuth code received, exchanging for token...');
      
      // Exchange code for token
      // First, retrieve the OAuth session from Supabase
      if (supabase) {
        const { data: sessionData, error: sessionError } = await supabase
          .from('oauth_sessions')
          .select('*')
          .eq('state', code)
          .eq('is_used', false)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (sessionError || !sessionData) {
          console.error('OAuth session not found:', sessionError);
          
          // Try to retrieve from stored auth code
          const { data: authData } = await supabase
            .from('oauth_sessions')
            .select('session_data')
            .eq('state', state || code)
            .single();
          
          if (authData && authData.session_data) {
            const session = authData.session_data;
            
            // Generate token
            const accessToken = jwt.sign({
              sub: session.userId || session.vendorCode || 'dashboard-user',
              email: session.email || 'user@lanonasis.com',
              org: session.organizationId,
              vendor: session.vendorCode,
              scope: session.scope || 'dashboard',
              dashboard_access: true,
              cli_authenticated: false,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600 * 24 // 24 hours
            }, jwtSecret);

            // Mark session as used
            await supabase
              .from('oauth_sessions')
              .update({ is_used: true, used_at: new Date().toISOString() })
              .eq('state', state || code);

            // Redirect with token and set secure cookie
            return {
              statusCode: 302,
              headers: {
                'Location': `${dashboardUrl}/?auth_success=true`,
                'Set-Cookie': `auth_token=${accessToken}; Path=/; Domain=.lanonasis.com; Max-Age=86400; SameSite=Lax; Secure`
              }
            };
          }
        }

        if (sessionData) {
          const session = sessionData.session_data || sessionData;
          
          // Generate access token
          const accessToken = jwt.sign({
            sub: session.userId || session.vendorCode || 'dashboard-user',
            email: session.email || 'user@lanonasis.com',
            org: session.organizationId,
            vendor: session.vendorCode,
            scope: session.scope || 'dashboard',
            dashboard_access: true,
            cli_authenticated: false,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600 * 24 // 24 hours
          }, jwtSecret);

          // Mark OAuth state as used
          await supabase
            .from('oauth_sessions')
            .update({ is_used: true, used_at: new Date().toISOString() })
            .eq('state', code);

          console.log('Token generated, redirecting to dashboard');
          
          // Redirect to dashboard with token and set secure cookie
          return {
            statusCode: 302,
            headers: {
              'Location': `${dashboardUrl}/?auth_success=true`,
              'Set-Cookie': `auth_token=${accessToken}; Path=/; Domain=.lanonasis.com; Max-Age=86400; SameSite=Lax; Secure`
            }
          };
        }
      }
      
      // Fallback: Generate a temporary token for testing
      console.log('Using fallback token generation');
      const fallbackToken = jwt.sign({
        sub: user_id || 'temp-user',
        email: 'user@lanonasis.com',
        dashboard_access: true,
        temporary: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
      }, jwtSecret);

      return {
        statusCode: 302,
        headers: {
          'Location': `${dashboardUrl}/?auth_warning=temporary_token`,
          'Set-Cookie': `auth_token=${fallbackToken}; Path=/; Domain=.lanonasis.com; Max-Age=3600; SameSite=Lax; Secure`
        }
      };
    }

    // No valid parameters, redirect to auth page
    console.log('No valid auth parameters, redirecting to auth page');
    return {
      statusCode: 302,
      headers: {
        'Location': `${dashboardUrl}/?auth_error=missing_parameters`
      }
    };

  } catch (error) {
    console.error('Dashboard callback error:', error);
    return {
      statusCode: 302,
      headers: {
        'Location': `${dashboardUrl}/?auth_error=callback_error&error_message=${encodeURIComponent(error.message)}`
      }
    };
  }
};
