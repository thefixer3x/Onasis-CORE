/**
 * Project List Edge Function
 * Lists projects for the authenticated user's organization
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

    // Parse params
    let limit = 50;
    let offset = 0;
    let requestedOrgId: string | undefined;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      requestedOrgId = url.searchParams.get('organization_id') || undefined;
      limit = parseInt(url.searchParams.get('limit') || '50', 10);
      offset = parseInt(url.searchParams.get('offset') || '0', 10);
    } else {
      try {
        const body = await req.json();
        requestedOrgId = body.organization_id;
        limit = body.limit || 50;
        offset = body.offset || 0;
      } catch {
        // Empty body is fine
      }
    }

    // Only master keys can list projects from other orgs
    if (requestedOrgId && requestedOrgId !== auth.organization_id && !auth.is_master) {
      return createErrorResponse(
        ErrorCode.AUTHORIZATION_ERROR,
        'Cannot list projects for other organizations',
        403
      );
    }

    // Use provided org_id or default to user's org (only for master keys)
    const targetOrgId = (auth.is_master && requestedOrgId) ? requestedOrgId : auth.organization_id;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Get total count
    const countQuery = supabase
      .from('projects')
      .select('*', { count: 'exact', head: true });

    // Scope to org via metadata->organization_id (unless master key with no filter)
    if (!auth.is_master || orgId) {
      countQuery.eq('metadata->>organization_id', targetOrgId);
    }

    const { count: total } = await countQuery;

    // Get projects - using actual table columns from control_room.projects facade view
    const listQuery = supabase
      .from('projects')
      .select('id, name, description, type, status, metadata, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Scope to org via metadata->organization_id
    if (!auth.is_master || orgId) {
      listQuery.eq('metadata->>organization_id', targetOrgId);
    }

    const { data: projects, error } = await listQuery;

    if (error) {
      console.error('Query error:', error);
      if (error.code === '42P01') {
        return new Response(JSON.stringify({
          data: [],
          total: 0,
          limit,
          offset,
          message: 'Projects feature not available',
        }), {
          status: 200,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
        });
      }
      return createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        `Failed to list projects: ${error.message || 'Unknown database error'}`,
        500
      );
    }

    // Enrich with memory counts per project
    const enrichedProjects = await Promise.all(
      (projects || []).map(async (project) => {
        const { count: memoryCount } = await supabase
          .from('memory_entries')
          .select('*', { count: 'exact', head: true })
          .eq('topic_id', project.id);

        return {
          ...project,
          organization_id: project.metadata?.organization_id || null,
          is_active: project.status === 'active',
          memory_count: memoryCount || 0,
        };
      })
    );

    return new Response(JSON.stringify({
      data: enrichedProjects,
      total: total || 0,
      limit,
      offset,
      has_more: (offset + limit) < (total || 0),
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
