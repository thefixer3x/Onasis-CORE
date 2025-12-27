/**
 * API Key List Edge Function
 * Lists API keys for the authenticated user
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

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

    // Parse query params or body
    let activeOnly = true;
    let projectId: string | undefined;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      activeOnly = url.searchParams.get('active_only') !== 'false';
      projectId = url.searchParams.get('project_id') || undefined;
    } else {
      try {
        const body = await req.json();
        activeOnly = body.active_only !== false;
        projectId = body.project_id;
      } catch {
        // Empty body is fine
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    // Build query
    let query = supabase
      .from('api_keys')
      .select('id, name, user_id, access_level, permissions, expires_at, last_used_at, created_at, is_active')
      .eq('user_id', auth.user_id);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    // Note: project_id filtering would require join if keys are project-scoped
    // For now, we filter by user only

    const { data: keys, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Query error:', error);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to list API keys', 500);
    }

    // Format response (never include key or key_hash)
    const formattedKeys = (keys || []).map(key => ({
      id: key.id,
      name: key.name,
      user_id: key.user_id,
      access_level: key.access_level,
      permissions: key.permissions || [],
      expires_at: key.expires_at,
      last_used_at: key.last_used_at,
      created_at: key.created_at,
      is_active: key.is_active,
      is_expired: key.expires_at ? new Date(key.expires_at) < new Date() : false,
    }));

    return new Response(JSON.stringify({
      data: formattedKeys,
      total: formattedKeys.length,
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
