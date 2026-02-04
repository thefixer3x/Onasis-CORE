/**
 * Memory Delete Edge Function
 * Deletes a single memory by ID
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required. Provide a valid API key or Bearer token.',
        401
      );
    }

    // Get memory ID from URL, query param, or body
    let memoryId: string | null = null;

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 1) {
      memoryId = pathParts[pathParts.length - 1];
    }

    if (!memoryId) {
      memoryId = url.searchParams.get('id');
    }

    if (!memoryId && (req.method === 'POST' || req.method === 'DELETE')) {
      try {
        const body = await req.json();
        memoryId = body.id;
      } catch {
        // Body might be empty for DELETE
      }
    }

    if (!memoryId) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Memory ID is required. Provide via path, query param (?id=), or body.',
        400
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(memoryId)) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Invalid memory ID format. Must be a valid UUID.',
        400
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // First verify the memory exists and user has access
    const existingQuery = supabase
      .from('memory_entries')
      .select('id, title, user_id, organization_id')
      .eq('id', memoryId);

    if (!auth.is_master) {
      existingQuery.eq('organization_id', auth.organization_id);
    }

    const { data: existing, error: fetchError } = await existingQuery.single();

    if (fetchError || !existing) {
      return createErrorResponse(ErrorCode.NOT_FOUND, `Memory with ID ${memoryId} not found.`, 404);
    }

    // Check ownership (unless master key)
    if (!auth.is_master && existing.user_id !== auth.user_id) {
      return createErrorResponse(ErrorCode.AUTHORIZATION_ERROR, 'You can only delete your own memories', 403);
    }

    // Delete the memory
    const { error: deleteError } = await supabase
      .from('memory_entries')
      .delete()
      .eq('id', memoryId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to delete memory', 500);
    }

    // Audit log (fire and forget)
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'memory.deleted',
      resource_type: 'memory',
      resource_id: memoryId,
      metadata: { title: existing.title }
    }).then(() => {});

    return new Response(JSON.stringify({
      success: true,
      message: `Memory ${memoryId} deleted successfully`,
      deleted_id: memoryId
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
