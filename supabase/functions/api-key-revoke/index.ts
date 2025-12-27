/**
 * API Key Revoke Edge Function
 * Soft-deletes an API key by setting is_active to false
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use POST or DELETE.', 405);
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

    // Get key_id from body or query
    let keyId: string | undefined;

    if (req.method === 'POST') {
      const body = await req.json();
      keyId = body.key_id;
    } else {
      const url = new URL(req.url);
      keyId = url.searchParams.get('key_id') || undefined;
    }

    if (!keyId || typeof keyId !== 'string') {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'key_id is required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify key exists
    const { data: existing, error: fetchError } = await supabase
      .from('api_keys')
      .select('id, name, is_active')
      .eq('id', keyId)
      .eq('user_id', auth.user_id)
      .single();

    if (fetchError || !existing) {
      return createErrorResponse(ErrorCode.NOT_FOUND, 'API key not found', 404);
    }

    if (!existing.is_active) {
      return new Response(JSON.stringify({
        success: true,
        message: 'API key was already revoked',
        key_id: keyId,
      }), {
        status: 200,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    // Revoke (soft delete)
    const { error: updateError } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('user_id', auth.user_id);

    if (updateError) {
      console.error('Update error:', updateError);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to revoke API key', 500);
    }

    // Audit log
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'api_key.revoked',
      resource_type: 'api_key',
      resource_id: keyId,
      metadata: {
        name: existing.name,
      }
    }).then(() => {});

    return new Response(JSON.stringify({
      success: true,
      message: 'API key revoked successfully',
      key_id: keyId,
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
