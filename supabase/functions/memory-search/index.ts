/**
 * Memory Search Edge Function
 * POST /functions/v1/memory-search
 *
 * Performs semantic vector search on memories using pgvector
 * Supports multiple embedding providers (OpenAI, Voyage AI)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, createSupabaseClient } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode, successResponse } from '../_shared/errors.ts';

// Embedding provider configuration
type EmbeddingProvider = 'openai' | 'voyage';

const PROVIDER_CONFIG = {
  openai: {
    model: 'text-embedding-3-small',
    url: 'https://api.openai.com/v1/embeddings',
    rpcFunction: 'search_memories',
  },
  voyage: {
    model: 'voyage-4',
    url: 'https://api.voyageai.com/v1/embeddings',
    rpcFunction: 'search_memories_voyage',
  },
} as const;

function getProvider(): EmbeddingProvider {
  const provider = Deno.env.get('EMBEDDING_PROVIDER')?.toLowerCase();
  return provider === 'voyage' ? 'voyage' : 'openai';
}

function getApiKey(provider: EmbeddingProvider): string | undefined {
  return provider === 'voyage'
    ? Deno.env.get('VOYAGE_API_KEY')
    : Deno.env.get('OPENAI_API_KEY');
}

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

    // Parse request - support both GET (query params) and POST (body)
    let body: SearchRequest;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      body = {
        query: url.searchParams.get('query') || url.searchParams.get('q') || '',
        memory_type: url.searchParams.get('type') || url.searchParams.get('memory_type') || undefined,
        threshold: url.searchParams.has('threshold') ? Number(url.searchParams.get('threshold')) : undefined,
        limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
        tags: url.searchParams.has('tags') ? url.searchParams.get('tags')!.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      };
    } else if (req.method === 'POST') {
      body = await req.json();
    } else {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Method not allowed. Use GET or POST.',
        405
      );
      return new Response(response.body, {
        status: 405,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

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

    // Determine embedding provider
    const provider = getProvider();
    const providerConfig = PROVIDER_CONFIG[provider];
    const apiKey = getApiKey(provider);

    if (!apiKey) {
      console.error(`${provider.toUpperCase()} API key not configured`);
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

    // Generate embedding using configured provider
    const embeddingBody = provider === 'voyage'
      ? { input: [body.query], model: Deno.env.get('VOYAGE_MODEL') || providerConfig.model, input_type: 'query' }
      : { model: providerConfig.model, input: body.query };

    const embeddingRes = await fetch(providerConfig.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(embeddingBody),
    });

    if (!embeddingRes.ok) {
      const error = await embeddingRes.text();
      console.error(`${provider} embedding error:`, error);
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

    // Search via provider-specific RPC function
    const supabase = createSupabaseClient();
    const threshold = body.threshold ?? 0.7;
    const limit = Math.min(body.limit ?? 10, 100);

    const { data: results, error } = await supabase.rpc(providerConfig.rpcFunction, {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_organization_id: auth.organization_id,
      filter_type: body.memory_type ?? null,
    });

    if (error) {
      if (provider === 'voyage') {
        console.error('Voyage search RPC missing or misconfigured:', error);
        const response = createErrorResponse(
          ErrorCode.DATABASE_ERROR,
          'Voyage vector search is not configured. Apply the voyage search migration.',
          500,
          error.message
        );
        return new Response(response.body, {
          status: 500,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
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

    // Build response (no vendor details exposed per vendor-abstraction guideline)
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
