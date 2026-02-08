/**
 * API Key Rotate Edge Function
 * Generates a new key value for an existing API key
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

/**
 * Generate a secure API key with lano_ prefix
 */
function generateSecureApiKey(): string {
  const prefix = 'lano_';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const randomHex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${randomHex}`;
}

/**
 * Hash an API key using SHA-256
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use POST.', 405);
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

    const body = await req.json();

    if (!body.key_id || typeof body.key_id !== 'string') {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'key_id is required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify key exists and user owns it
    const { data: existing, error: fetchError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('id', body.key_id)
      .eq('user_id', auth.user_id)
      .single();

    if (fetchError || !existing) {
      return createErrorResponse(ErrorCode.NOT_FOUND, 'API key not found', 404);
    }

    if (!existing.is_active) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Cannot rotate an inactive API key', 400);
    }

    // Generate new key
    const newApiKey = generateSecureApiKey();
    const newKeyHash = await hashApiKey(newApiKey);

    // Update with new key hash
    const { data: updated, error: updateError } = await supabase
      .from('api_keys')
      .update({
        key_hash: newKeyHash,
        // Optionally reset created_at for rotation tracking
        // created_at: new Date().toISOString(),
      })
      .eq('id', body.key_id)
      .eq('user_id', auth.user_id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('Update error:', updateError);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to rotate API key', 500);
    }

    // Audit log
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'api_key.rotated',
      resource_type: 'api_key',
      resource_id: updated.id,
      metadata: {
        name: updated.name,
        access_level: updated.access_level,
      }
    }).then(() => {});

    return new Response(JSON.stringify({
      data: {
        id: updated.id,
        name: updated.name,
        key: newApiKey, // Return new key
        user_id: updated.user_id,
        access_level: updated.access_level,
        permissions: updated.permissions || [],
        expires_at: updated.expires_at,
        created_at: updated.created_at,
        is_active: updated.is_active,
      },
      message: 'API key rotated successfully. Save the new key now - it will not be shown again.',
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
