/**
 * Memory Get Edge Function
 * Retrieves a single memory by ID
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
    // Authenticate
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required. Provide a valid API key or Bearer token.',
        401
      );
    }

    // Get memory ID from URL or body
    let memoryId: string | null = null;

    // Try URL path first (e.g., /memory-get/uuid)
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 1) {
      memoryId = pathParts[pathParts.length - 1];
    }

    // Try query parameter
    if (!memoryId) {
      memoryId = url.searchParams.get('id');
    }

    // Try request body for POST
    if (!memoryId && req.method === 'POST') {
      const body = await req.json();
      memoryId = body.id;
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
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    // Fetch memory with organization scope
    const query = supabase
      .from('memory_entries')
      .select('id, title, content, memory_type, tags, metadata, user_id, organization_id, topic_id, created_at, updated_at, last_accessed, access_count')
      .eq('id', memoryId);

    // Apply org scope unless master key
    if (!auth.is_master) {
      query.eq('organization_id', auth.organization_id);
    }

    const { data: memory, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Memory with ID ${memoryId} not found.`,
          404
        );
      }
      console.error('Database error:', error);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to retrieve memory', 500);
    }

    // Update access tracking (fire and forget)
    supabase
      .from('memory_entries')
      .update({
        last_accessed: new Date().toISOString(),
        access_count: (memory.access_count || 0) + 1
      })
      .eq('id', memoryId)
      .then(() => {});

    return new Response(JSON.stringify({
      data: memory,
      message: 'Memory retrieved successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
