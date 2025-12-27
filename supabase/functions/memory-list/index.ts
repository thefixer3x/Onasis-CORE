/**
 * Memory List Edge Function
 * Lists memories with pagination, filtering, and sorting
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

interface ListParams {
  limit?: number;
  offset?: number;
  type?: string;
  tags?: string[];
  sortBy?: 'created_at' | 'updated_at' | 'title';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

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

    // Parse parameters from query string or body
    const url = new URL(req.url);
    let params: ListParams = {};

    if (req.method === 'POST') {
      params = await req.json();
    } else {
      params = {
        limit: parseInt(url.searchParams.get('limit') || '20'),
        offset: parseInt(url.searchParams.get('offset') || '0'),
        type: url.searchParams.get('type') || undefined,
        tags: url.searchParams.get('tags')?.split(',').filter(Boolean) || undefined,
        sortBy: (url.searchParams.get('sortBy') as ListParams['sortBy']) || 'updated_at',
        sortOrder: (url.searchParams.get('sortOrder') as ListParams['sortOrder']) || 'desc',
        search: url.searchParams.get('search') || undefined
      };
    }

    // Validate and set defaults
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const offset = Math.max(params.offset || 0, 0);
    const sortBy = params.sortBy || 'updated_at';
    const sortOrder = params.sortOrder || 'desc';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Build query
    let query = supabase
      .from('memory_entries')
      .select('id, title, content, memory_type, tags, metadata, user_id, organization_id, created_at, updated_at, last_accessed, access_count', { count: 'exact' });

    // Apply organization scope (unless master key)
    if (!auth.is_master) {
      query = query.eq('organization_id', auth.organization_id);
    }

    // Apply filters
    if (params.type) {
      query = query.eq('memory_type', params.type);
    }

    if (params.tags && params.tags.length > 0) {
      // Filter memories that contain ANY of the specified tags
      query = query.overlaps('tags', params.tags);
    }

    if (params.search) {
      // Simple text search on title and content
      query = query.or(`title.ilike.%${params.search}%,content.ilike.%${params.search}%`);
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: memories, error, count } = await query;

    if (error) {
      console.error('List error:', error);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to list memories', 500);
    }

    // Calculate pagination info
    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(offset / limit) + 1;
    const hasNext = offset + limit < totalCount;
    const hasPrev = offset > 0;

    return new Response(JSON.stringify({
      data: memories || [],
      pagination: {
        total: totalCount,
        limit,
        offset,
        page: currentPage,
        total_pages: totalPages,
        has_next: hasNext,
        has_prev: hasPrev
      },
      filters: {
        type: params.type || null,
        tags: params.tags || null,
        search: params.search || null,
        sort_by: sortBy,
        sort_order: sortOrder
      },
      organization_id: auth.organization_id
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
