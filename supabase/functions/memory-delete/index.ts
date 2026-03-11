/**
 * Memory Delete Edge Function
 * Soft deletes a single memory by ID
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate, createSupabaseClient } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';
import { extractRequestContext, writeAudit } from '../_shared/audit.ts';

function parseBooleanParam(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const reqCtx = extractRequestContext(req);

  try {
    const auth = await authenticate(req);
    if (!auth) {
      writeAudit(createSupabaseClient(), {
        action: 'memory.deleted',
        resource_type: 'memory',
        metadata: {
          reason: 'authentication_required',
        },
        result: 'denied',
        failure_reason: 'authentication_required',
        route_source: 'edge_function',
        actor_type: 'anonymous',
        auth_source: 'anonymous',
        ...reqCtx,
      });
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

    let body: { id?: string; include_deleted?: unknown } | null = null;

    if (!memoryId && (req.method === 'POST' || req.method === 'DELETE')) {
      try {
        const parsedBody = await req.json() as { id?: string; include_deleted?: unknown };
        body = parsedBody;
        if (typeof parsedBody.id === 'string') {
          memoryId = parsedBody.id;
        }
      } catch {
        // Body might be empty for DELETE
      }
    }

    const includeDeleted =
      parseBooleanParam(url.searchParams.get('include_deleted')) ||
      parseBooleanParam(body?.include_deleted);

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
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // First verify the memory exists and user has access
    const existingQuery = supabase
      .from('memory_entries')
      .select('id, title, user_id, organization_id, deleted_at')
      .eq('id', memoryId);

    if (!auth.is_master) {
      existingQuery.eq('organization_id', auth.organization_id);
    }

    if (!includeDeleted) {
      existingQuery.is('deleted_at', null);
    }

    const { data: existing, error: fetchError } = await existingQuery.single();

    if (fetchError || !existing) {
      return createErrorResponse(ErrorCode.NOT_FOUND, `Memory with ID ${memoryId} not found.`, 404);
    }

    // Check ownership (unless master key)
    if (!auth.is_master && existing.user_id !== auth.user_id) {
      writeAudit(supabase, {
        user_id: auth.user_id,
        organization_id: auth.organization_id,
        action: 'memory.deleted',
        resource_type: 'memory',
        resource_id: memoryId,
        metadata: {
          owner_user_id: existing.user_id,
          title: existing.title,
        },
        result: 'denied',
        failure_reason: 'not_owner',
        route_source: 'edge_function',
        auth_source: auth.auth_source,
        actor_id: auth.user_id,
        actor_type: 'user',
        api_key_id: auth.api_key_id,
        project_scope: auth.project_scope,
        ...reqCtx,
      });
      return createErrorResponse(ErrorCode.AUTHORIZATION_ERROR, 'You can only delete your own memories', 403);
    }

    if (!existing.deleted_at) {
      const { error: deleteError } = await supabase
        .from('memory_entries')
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoryId);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        writeAudit(supabase, {
          user_id: auth.user_id,
          organization_id: auth.organization_id,
          action: 'memory.deleted',
          resource_type: 'memory',
          resource_id: memoryId,
          metadata: { title: existing.title },
          result: 'failure',
          failure_reason: 'delete_failed',
          route_source: 'edge_function',
          auth_source: auth.auth_source,
          actor_id: auth.user_id,
          actor_type: 'user',
          api_key_id: auth.api_key_id,
          project_scope: auth.project_scope,
          ...reqCtx,
        });
        return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to delete memory', 500);
      }
    }

    // Audit log (fire and forget)
    writeAudit(supabase, {
      user_id: auth.user_id,
      organization_id: auth.organization_id,
      action: 'memory.deleted',
      resource_type: 'memory',
      resource_id: memoryId,
      metadata: {
        title: existing.title,
        soft_deleted: true,
        already_deleted: Boolean(existing.deleted_at),
      },
      result: 'success',
      route_source: 'edge_function',
      auth_source: auth.auth_source,
      actor_id: auth.user_id,
      actor_type: 'user',
      api_key_id: auth.api_key_id,
      project_scope: auth.project_scope,
      ...reqCtx,
    });

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
