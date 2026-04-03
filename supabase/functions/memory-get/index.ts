/**
 * Memory Get Edge Function
 * Retrieves a single memory by ID
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PREFIX_LENGTH = 8;
const PREFIX_MATCH_PREVIEW_LIMIT = 5;
const PREFIX_SCAN_PAGE_SIZE = 500;

function parseBooleanParam(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

async function resolveMemoryIdOrPrefix(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          range: (
            from: number,
            to: number,
          ) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
        };
        eq: (column: string, value: string) => unknown;
        is: (column: string, value: null) => unknown;
      };
    };
  } | any,
  auth: { is_master: boolean; organization_id: string } | null,
  idOrPrefix: string,
  includeDeleted: boolean,
): Promise<{ id?: string; response?: Response }> {
  const candidate = idOrPrefix.trim();
  if (!candidate) {
    return {
      response: createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Memory ID is required. Provide via path, query param (?id=), or body.',
        400,
      ),
    };
  }

  if (UUID_REGEX.test(candidate)) {
    return { id: candidate };
  }

  if (candidate.length < MIN_PREFIX_LENGTH) {
    return {
      response: createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Memory ID prefix must be at least 8 characters or a full UUID.',
        400,
      ),
    };
  }

  const matches: string[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from('memory_entries')
      .select('id')
      .order('id', { ascending: true })
      .range(offset, offset + PREFIX_SCAN_PAGE_SIZE - 1);

    if (auth && !auth.is_master) {
      query = query.eq('organization_id', auth.organization_id);
    }

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error resolving memory ID prefix:', error);
      return {
        response: createErrorResponse(
          ErrorCode.DATABASE_ERROR,
          'Failed to resolve memory ID prefix.',
          500,
        ),
      };
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data as Array<{ id?: string }>) {
      if (typeof row.id === 'string' && row.id.startsWith(candidate)) {
        matches.push(row.id);
        if (matches.length > PREFIX_MATCH_PREVIEW_LIMIT) {
          break;
        }
      }
    }

    if (matches.length > PREFIX_MATCH_PREVIEW_LIMIT || data.length < PREFIX_SCAN_PAGE_SIZE) {
      break;
    }

    offset += PREFIX_SCAN_PAGE_SIZE;
  }

  if (matches.length === 0) {
    return {
      response: createErrorResponse(
        ErrorCode.NOT_FOUND,
        `Memory with ID/prefix ${candidate} not found.`,
        404,
      ),
    };
  }

  if (matches.length > 1) {
    return {
      response: createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        `Memory ID prefix is ambiguous: ${candidate}. Matches: ${matches
          .slice(0, PREFIX_MATCH_PREVIEW_LIMIT)
          .join(', ')}`,
        400,
      ),
    };
  }

  return { id: matches[0] };
}

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

    let includeDeleted = parseBooleanParam(url.searchParams.get('include_deleted'));

    // Try request body for POST
    if (!memoryId && req.method === 'POST') {
      const body = await req.json();
      memoryId = body.id;
      includeDeleted = includeDeleted || parseBooleanParam(body.include_deleted);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const resolved = await resolveMemoryIdOrPrefix(supabase, auth, memoryId ?? '', includeDeleted);
    if (resolved.response) {
      return resolved.response;
    }

    const resolvedMemoryId = resolved.id!;

    // Fetch memory with organization scope
    const query = supabase
      .from('memory_entries')
      .select('id, title, content, memory_type, tags, metadata, user_id, organization_id, topic_id, created_at, updated_at, last_accessed, access_count, deleted_at')
      .eq('id', resolvedMemoryId);

    // Apply org scope unless master key
    if (!auth.is_master) {
      query.eq('organization_id', auth.organization_id);
    }

    if (!includeDeleted) {
      query.is('deleted_at', null);
    }

    const { data: memory, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Memory with ID/prefix ${memoryId} not found.`,
          404
        );
      }
      console.error('Database error:', error);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to retrieve memory', 500);
    }

    // Update access tracking (fire and forget)
    if (!memory.deleted_at) {
      supabase
        .from('memory_entries')
        .update({
          last_accessed: new Date().toISOString(),
          access_count: (memory.access_count || 0) + 1
        })
        .eq('id', resolvedMemoryId)
        .then(() => {});
    }

    const { deleted_at: _deletedAt, ...responseMemory } = memory;

    return new Response(JSON.stringify({
      data: responseMemory,
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
