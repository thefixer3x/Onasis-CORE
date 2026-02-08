/**
 * Config Set Edge Function
 * Updates configuration settings for the authenticated user
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

// Valid configuration keys and their types
const CONFIG_SCHEMA: Record<string, { type: string; values?: any[] }> = {
  'memory.auto_embedding': { type: 'boolean' },
  'memory.embedding_model': { type: 'string', values: ['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'] },
  'memory.default_type': { type: 'string', values: ['context', 'project', 'knowledge', 'reference', 'personal', 'workflow'] },
  'memory.retention_days': { type: 'number' },
  'search.default_limit': { type: 'number' },
  'search.similarity_threshold': { type: 'number' },
  'search.include_metadata': { type: 'boolean' },
  'api.rate_limit': { type: 'number' },
  'api.timeout_ms': { type: 'number' },
  'notifications.email_enabled': { type: 'boolean' },
  'notifications.webhook_enabled': { type: 'boolean' },
  'ui.theme': { type: 'string', values: ['light', 'dark', 'system'] },
  'ui.language': { type: 'string', values: ['en', 'es', 'fr', 'de', 'ja', 'zh'] },
};

interface SetConfigRequest {
  key: string;
  value: any;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use POST or PUT.', 405);
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

    const body: SetConfigRequest = await req.json();

    // Validate required fields
    if (!body.key || typeof body.key !== 'string') {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'key is required', 400);
    }

    if (body.value === undefined) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'value is required', 400);
    }

    // Validate key exists in schema
    const schema = CONFIG_SCHEMA[body.key];
    if (!schema) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        `Invalid config key '${body.key}'. Valid keys: ${Object.keys(CONFIG_SCHEMA).join(', ')}`,
        400
      );
    }

    // Validate value type
    const valueType = typeof body.value;
    if (schema.type === 'boolean' && valueType !== 'boolean') {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, `${body.key} must be a boolean`, 400);
    }
    if (schema.type === 'number' && valueType !== 'number') {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, `${body.key} must be a number`, 400);
    }
    if (schema.type === 'string' && valueType !== 'string') {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, `${body.key} must be a string`, 400);
    }

    // Validate value against allowed values
    if (schema.values && !schema.values.includes(body.value)) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        `Invalid value for ${body.key}. Allowed: ${schema.values.join(', ')}`,
        400
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Upsert user config
    const { error } = await supabase
      .from('user_config')
      .upsert({
        user_id: auth.user_id,
        key: body.key,
        value: body.value,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,key',
      });

    if (error) {
      console.error('Upsert error:', error);
      // Check if table exists
      if (error.code === '42P01') {
        // Table doesn't exist - create it
        const { error: createError } = await supabase.rpc('create_user_config_table');
        if (createError) {
          console.error('Create table error:', createError);
          return createErrorResponse(
            ErrorCode.DATABASE_ERROR,
            'Config storage not available. Please contact support.',
            500
          );
        }
        // Retry insert
        const { error: retryError } = await supabase
          .from('user_config')
          .upsert({
            user_id: auth.user_id,
            key: body.key,
            value: body.value,
            updated_at: new Date().toISOString(),
          });
        if (retryError) {
          return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to save configuration', 500);
        }
      } else {
        return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to save configuration', 500);
      }
    }

    // Audit log
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'config.updated',
      resource_type: 'config',
      resource_id: null,
      metadata: {
        key: body.key,
        value: body.value,
      }
    }).then(() => {});

    return new Response(JSON.stringify({
      success: true,
      key: body.key,
      value: body.value,
      message: 'Configuration updated successfully',
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
