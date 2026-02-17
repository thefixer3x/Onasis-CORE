/**
 * Config Get Edge Function
 * Retrieves configuration settings for the authenticated user/organization
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

// Default configuration values
const DEFAULT_CONFIG: Record<string, any> = {
  // Memory settings
  'memory.auto_embedding': true,
  'memory.embedding_model': 'text-embedding-ada-002',
  'memory.default_type': 'context',
  'memory.retention_days': 365,

  // Search settings
  'search.default_limit': 10,
  'search.similarity_threshold': 0.7,
  'search.include_metadata': true,

  // API settings
  'api.rate_limit': 1000,
  'api.timeout_ms': 30000,

  // Notification settings
  'notifications.email_enabled': true,
  'notifications.webhook_enabled': false,

  // UI preferences
  'ui.theme': 'system',
  'ui.language': 'en',
};

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use GET or POST.', 405);
  }

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required. Provide a valid API key or Bearer token.',
        401
      );
    }

    // Get specific key if provided
    let key: string | undefined;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      key = url.searchParams.get('key') || undefined;
    } else {
      try {
        const body = await req.json();
        key = body.key;
      } catch {
        // Empty body is fine
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Try to get config from database
    const dbConfig: Record<string, any> = {};

    try {
      // First try user-level config
      const { data: userConfig } = await supabase
        .from('user_config')
        .select('key, value')
        .eq('user_id', auth.user_id);

      if (userConfig) {
        for (const item of userConfig) {
          dbConfig[item.key] = item.value;
        }
      }

      // Then get org-level config (user config takes precedence)
      const { data: orgConfig } = await supabase
        .from('organization_config')
        .select('key, value')
        .eq('organization_id', auth.organization_id);

      if (orgConfig) {
        for (const item of orgConfig) {
          if (!(item.key in dbConfig)) {
            dbConfig[item.key] = item.value;
          }
        }
      }
    } catch {
      // Config tables might not exist - use defaults
    }

    // Merge with defaults (db config takes precedence)
    const config = { ...DEFAULT_CONFIG, ...dbConfig };

    // Return specific key or all config
    if (key) {
      if (key in config) {
        return new Response(JSON.stringify({
          key,
          value: config[key],
          source: key in dbConfig ? 'custom' : 'default',
        }), {
          status: 200,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
        });
      } else {
        return createErrorResponse(ErrorCode.NOT_FOUND, `Config key '${key}' not found`, 404);
      }
    }

    // Return all config
    const formattedConfig: Record<string, { value: any; source: string }> = {};
    for (const [k, v] of Object.entries(config)) {
      formattedConfig[k] = {
        value: v,
        source: k in dbConfig ? 'custom' : 'default',
      };
    }

    return new Response(JSON.stringify({
      data: formattedConfig,
      available_keys: Object.keys(DEFAULT_CONFIG),
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
