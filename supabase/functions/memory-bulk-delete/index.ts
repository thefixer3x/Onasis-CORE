/**
 * Memory Bulk Delete Edge Function
 * Deletes multiple memories by IDs
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

interface BulkDeleteRequest {
  ids: string[];
  confirm?: boolean;
}

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

    const body: BulkDeleteRequest = await req.json();

    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'ids array is required and must not be empty',
        400
      );
    }

    // Limit bulk operations
    const MAX_BULK_DELETE = 100;
    if (body.ids.length > MAX_BULK_DELETE) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        `Maximum ${MAX_BULK_DELETE} memories can be deleted at once. You provided ${body.ids.length}.`,
        400
      );
    }

    // Validate all UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidIds = body.ids.filter(id => !uuidRegex.test(id));
    if (invalidIds.length > 0) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        `Invalid UUID format for IDs: ${invalidIds.join(', ')}`,
        400
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // First, verify which memories exist and user has access to
    let verifyQuery = supabase
      .from('memory_entries')
      .select('id, title, user_id, organization_id')
      .in('id', body.ids);

    if (!auth.is_master) {
      verifyQuery = verifyQuery.eq('organization_id', auth.organization_id);
    }

    const { data: existing, error: verifyError } = await verifyQuery;

    if (verifyError) {
      console.error('Verify error:', verifyError);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to verify memories', 500);
    }

    const existingIds = new Set((existing || []).map(m => m.id));
    const notFoundIds = body.ids.filter(id => !existingIds.has(id));

    // Filter to only memories the user owns (unless master key)
    let deletableIds: string[] = [];
    const notAuthorizedIds: string[] = [];

    if (auth.is_master) {
      deletableIds = body.ids.filter(id => existingIds.has(id));
    } else {
      for (const memory of existing || []) {
        if (memory.user_id === auth.user_id) {
          deletableIds.push(memory.id);
        } else {
          notAuthorizedIds.push(memory.id);
        }
      }
    }

    if (deletableIds.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No memories were deleted',
        deleted_count: 0,
        deleted_ids: [],
        not_found: notFoundIds,
        not_authorized: notAuthorizedIds
      }), {
        status: 200,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    // Perform bulk delete
    const { error: deleteError, count: deletedCount } = await supabase
      .from('memory_entries')
      .delete({ count: 'exact' })
      .in('id', deletableIds);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to delete memories', 500);
    }

    // Audit log (fire and forget)
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'memory.bulk_deleted',
      resource_type: 'memory',
      metadata: {
        deleted_ids: deletableIds,
        count: deletedCount,
        not_found: notFoundIds,
        not_authorized: notAuthorizedIds
      }
    }).then(() => {});

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully deleted ${deletedCount} memories`,
      deleted_count: deletedCount,
      deleted_ids: deletableIds,
      not_found: notFoundIds.length > 0 ? notFoundIds : undefined,
      not_authorized: notAuthorizedIds.length > 0 ? notAuthorizedIds : undefined
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
