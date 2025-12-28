/**
 * Memory Search Edge Function
 * POST /functions/v1/memory-search
 *
 * Performs semantic vector search on memories using pgvector
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, createSupabaseClient } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode, successResponse } from '../_shared/errors.ts';

interface SearchRequest {
  query: string;
  memory_type?: string;
  threshold?: number;
  limit?: number;
  tags?: string[];
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate
    const auth = await authenticate(req);
    if (!auth) {
      const response = createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required. Provide a valid API key or Bearer token.',
        401
      );
      return new Response(response.body, {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Only allow POST
    if (req.method !== 'POST') {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Method not allowed. Use POST.',
        405
      );
      return new Response(response.body, {
        status: 405,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body: SearchRequest = await req.json();

    // Validate required fields
    if (!body.query || body.query.trim().length === 0) {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Query is required and cannot be empty',
        400
      );
      return new Response(response.body, {
        status: 400,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Generate embedding via OpenAI
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('OPENAI_API_KEY not configured');
      const response = createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Search service temporarily unavailable',
        503
      );
      return new Response(response.body, {
        status: 503,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: body.query,
      }),
    });

    if (!embeddingRes.ok) {
      const error = await embeddingRes.text();
      console.error('OpenAI embedding error:', error);
      const response = createErrorResponse(
        ErrorCode.EMBEDDING_ERROR,
        'Failed to process search query',
        502
      );
      return new Response(response.body, {
        status: 502,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const embeddingData = await embeddingRes.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Search via RPC function
    const supabase = createSupabaseClient();
    const threshold = body.threshold ?? 0.7;
    const limit = Math.min(body.limit ?? 10, 100);

    const { data: results, error } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_organization_id: auth.organization_id,
      filter_type: body.memory_type ?? null,
    });

    if (error) {
      console.error('Search RPC error:', error);
      const response = createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        'Search query failed',
        500,
        error.message
      );
      return new Response(response.body, {
        status: 500,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Filter by tags if provided
    let filteredResults = results || [];
    if (body.tags && body.tags.length > 0) {
      filteredResults = filteredResults.filter((memory: { tags: string[] }) =>
        body.tags!.some((tag) => memory.tags?.includes(tag))
      );
    }

    // Build response
    const responseBody = {
      data: filteredResults,
      query: body.query,
      threshold,
      total: filteredResults.length,
      organization_id: auth.organization_id,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in memory-search:', error);
    const response = createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
    return new Response(response.body, {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
