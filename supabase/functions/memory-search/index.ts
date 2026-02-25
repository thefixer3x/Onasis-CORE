/**
 * Memory Search Edge Function
 * POST /functions/v1/memory-search
 *
 * Performs semantic vector search on memories using pgvector
 * Supports multiple embedding providers (OpenAI, Voyage AI)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, createSupabaseClient } from "../_shared/auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createErrorResponse, ErrorCode } from "../_shared/errors.ts";

// Embedding provider configuration
type EmbeddingProvider = "openai" | "voyage";

const PROVIDER_CONFIG = {
  openai: {
    model: "text-embedding-3-small",
    url: "https://api.openai.com/v1/embeddings",
    rpcFunction: "search_memories",
  },
  voyage: {
    model: "voyage-4",
    url: "https://api.voyageai.com/v1/embeddings",
    rpcFunction: "search_memories_voyage",
  },
} as const;

function getProvider(): EmbeddingProvider {
  const provider = Deno.env.get("EMBEDDING_PROVIDER")?.toLowerCase();
  return provider === "voyage" ? "voyage" : "openai";
}

function getApiKey(provider: EmbeddingProvider): string | undefined {
  return provider === "voyage"
    ? Deno.env.get("VOYAGE_API_KEY")
    : Deno.env.get("OPENAI_API_KEY");
}

interface SearchRequest {
  query: string;
  memory_type?: string;
  memory_types?: string[];
  threshold?: number;
  limit?: number;
  tags?: string[];
}

function normalizeThreshold(input: number | undefined): number {
  const fallback = Number(Deno.env.get("SEARCH_DEFAULT_THRESHOLD") || "0.55");
  const value = Number.isFinite(input) ? input as number : fallback;
  return Math.min(1, Math.max(0, value));
}

function relaxedThreshold(current: number): number {
  // Keep a minimum semantic bar while avoiding empty-result dead ends.
  return Math.max(0.45, Number((current - 0.15).toFixed(2)));
}

function normalizeTypes(memoryType?: string, memoryTypes?: string[]): string[] {
  const set = new Set<string>();
  if (memoryType) set.add(memoryType);
  if (Array.isArray(memoryTypes)) {
    for (const t of memoryTypes) {
      if (typeof t === "string" && t.trim()) set.add(t.trim());
    }
  }
  return Array.from(set);
}

function tokenizeQuery(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function lexicalSimilarity(
  query: string,
  memory: { title?: string; content?: string; tags?: string[] },
): number {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return 0;

  const haystack = `${memory.title || ""} ${memory.content || ""} ${
    (memory.tags || []).join(" ")
  }`.toLowerCase();
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  if (hits === 0) return 0;
  const ratio = hits / tokens.length;

  // Keep lexical fallback scores below high-confidence semantic scores.
  return Math.max(0.35, Math.min(0.69, Number((ratio * 0.65).toFixed(3))));
}

function tagOverlapScore(memoryTags: string[] | undefined, filterTags: string[] | undefined): number {
  if (!Array.isArray(memoryTags) || !Array.isArray(filterTags) || filterTags.length === 0) {
    return 0;
  }

  const normalizedMemoryTags = new Set(memoryTags.map((tag) => tag.toLowerCase()));
  const overlapCount = filterTags.filter((tag) => normalizedMemoryTags.has(tag.toLowerCase())).length;
  if (overlapCount === 0) return 0;

  // Give tag-filter matches a moderate lexical score floor when semantic search is empty.
  return Math.min(0.62, Number((0.38 + overlapCount * 0.08).toFixed(3)));
}

async function runSemanticSearch(
  supabase: ReturnType<typeof createSupabaseClient>,
  rpcFunction: string,
  queryEmbedding: number[],
  threshold: number,
  limit: number,
  organizationId: string,
  filterType: string | null,
) {
  return await supabase.rpc(rpcFunction, {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    filter_organization_id: organizationId,
    filter_type: filterType,
  });
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
        "Authentication required. Provide a valid API key or Bearer token.",
        401,
      );
      return new Response(response.body, {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Parse request - support both GET (query params) and POST (body)
    let body: SearchRequest;

    if (req.method === "GET") {
      const url = new URL(req.url);
      body = {
        query: url.searchParams.get("query") || url.searchParams.get("q") || "",
        memory_type: url.searchParams.get("type") ||
          url.searchParams.get("memory_type") || undefined,
        memory_types: url.searchParams.has("memory_types")
          ? url.searchParams.get("memory_types")!.split(",").map((t) =>
            t.trim()
          ).filter(Boolean)
          : undefined,
        threshold: url.searchParams.has("threshold")
          ? Number(url.searchParams.get("threshold"))
          : undefined,
        limit: url.searchParams.has("limit")
          ? Number(url.searchParams.get("limit"))
          : undefined,
        tags: url.searchParams.has("tags")
          ? url.searchParams.get("tags")!.split(",").map((t) => t.trim())
            .filter(Boolean)
          : undefined,
      };
    } else if (req.method === "POST") {
      body = await req.json();
    } else {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Method not allowed. Use GET or POST.",
        405,
      );
      return new Response(response.body, {
        status: 405,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    if (!body.query || body.query.trim().length === 0) {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Query is required and cannot be empty",
        400,
      );
      return new Response(response.body, {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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
        "Search service temporarily unavailable",
        503,
      );
      return new Response(response.body, {
        status: 503,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Generate embedding using configured provider
    const embeddingBody = provider === "voyage"
      ? {
        input: [body.query],
        model: Deno.env.get("VOYAGE_MODEL") || providerConfig.model,
        input_type: "query",
      }
      : { model: providerConfig.model, input: body.query };

    const embeddingRes = await fetch(providerConfig.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(embeddingBody),
    });

    if (!embeddingRes.ok) {
      const error = await embeddingRes.text();
      console.error(`${provider} embedding error:`, error);
      const response = createErrorResponse(
        ErrorCode.EMBEDDING_ERROR,
        "Failed to process search query",
        502,
      );
      return new Response(response.body, {
        status: 502,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const embeddingData = await embeddingRes.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Search via provider-specific RPC function
    const supabase = createSupabaseClient();
    const threshold = normalizeThreshold(body.threshold);
    const limit = Math.min(body.limit ?? 10, 100);
    const typeFilters = normalizeTypes(body.memory_type, body.memory_types);
    const primaryFilterType = typeFilters.length === 1 ? typeFilters[0] : null;

    let thresholdUsed = threshold;
    let searchStrategy:
      | "semantic_strict"
      | "semantic_relaxed"
      | "lexical_fallback" = "semantic_strict";

    let { data: results, error } = await runSemanticSearch(
      supabase,
      providerConfig.rpcFunction,
      queryEmbedding,
      thresholdUsed,
      limit,
      auth.organization_id,
      primaryFilterType,
    );

    if (error) {
      if (provider === "voyage") {
        console.error("Voyage search RPC missing or misconfigured:", error);
        const response = createErrorResponse(
          ErrorCode.DATABASE_ERROR,
          "Voyage vector search is not configured. Apply the voyage search migration.",
          500,
          error.message,
        );
        return new Response(response.body, {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      console.error("Search RPC error:", error);
      const response = createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        "Search query failed",
        500,
        error.message,
      );
      return new Response(response.body, {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let filteredResults = results || [];

    // If strict threshold returns nothing, retry once with a relaxed semantic threshold.
    if (filteredResults.length === 0 && thresholdUsed > 0.45) {
      const relaxed = relaxedThreshold(thresholdUsed);
      if (relaxed < thresholdUsed) {
        const relaxedResponse = await runSemanticSearch(
          supabase,
          providerConfig.rpcFunction,
          queryEmbedding,
          relaxed,
          limit,
          auth.organization_id,
          primaryFilterType,
        );
        if (!relaxedResponse.error && Array.isArray(relaxedResponse.data)) {
          filteredResults = relaxedResponse.data;
          thresholdUsed = relaxed;
          searchStrategy = "semantic_relaxed";
        }
      }
    }

    // Apply additional in-memory type filtering if memory_types array has multiple values.
    if (typeFilters.length > 1) {
      filteredResults = filteredResults.filter((
        memory: { memory_type?: string },
      ) => typeFilters.includes(memory.memory_type || ""));
    }

    // Filter by tags if provided
    if (body.tags && body.tags.length > 0) {
      filteredResults = filteredResults.filter((memory: { tags: string[] }) =>
        body.tags!.some((tag) => memory.tags?.includes(tag))
      );
    }

    // Lexical fallback for natural-language recall when semantic paths are empty.
    if (filteredResults.length === 0) {
      let lexicalQuery = supabase
        .from("memory_entries")
        .select(
          "id,title,content,memory_type,tags,metadata,user_id,organization_id,created_at,updated_at",
        )
        .eq("organization_id", auth.organization_id)
        .order("updated_at", { ascending: false })
        .limit(Math.min(Math.max(limit * 8, 40), 200));

      if (typeFilters.length === 1) {
        lexicalQuery = lexicalQuery.eq("memory_type", typeFilters[0]);
      } else if (typeFilters.length > 1) {
        lexicalQuery = lexicalQuery.in("memory_type", typeFilters);
      }

      if (body.tags && body.tags.length > 0) {
        lexicalQuery = lexicalQuery.overlaps("tags", body.tags);
      }

      const { data: lexicalRows, error: lexicalError } = await lexicalQuery;
      if (!lexicalError && Array.isArray(lexicalRows)) {
        filteredResults = lexicalRows
          .map((row) => ({
            ...row,
            similarity_score: Math.max(
              lexicalSimilarity(body.query, row),
              tagOverlapScore(row.tags, body.tags),
            ),
          }))
          .filter((row) => row.similarity_score > 0)
          .sort((a, b) => b.similarity_score - a.similarity_score)
          .slice(0, limit);

        if (filteredResults.length > 0) {
          searchStrategy = "lexical_fallback";
        }
      }
    }

    // Build response (no vendor details exposed per vendor-abstraction guideline)
    const responseBody = {
      data: filteredResults,
      query: body.query,
      threshold: thresholdUsed,
      requested_threshold: threshold,
      search_strategy: searchStrategy,
      total: filteredResults.length,
      organization_id: auth.organization_id,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error in memory-search:", error);
    const response = createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Internal server error",
      500,
    );
    return new Response(response.body, {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
