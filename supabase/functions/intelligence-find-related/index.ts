// Intelligence API: Find Related
// Semantic similarity search for related memories
// POST /intelligence/find-related

import {
  corsHeaders,
  authenticateRequest,
  checkIntelligenceAccess,
  getUserTierInfo,
  logUsage,
  generateCacheKey,
  checkCache,
  setCache,
  generateEmbedding,
  cosineSimilarity,
  getSupabaseClient,
  errorResponse,
  successResponse,
  premiumRequiredResponse,
} from "../_shared/utils.ts";

const TOOL_NAME = "find_related";

interface FindRelatedRequest {
  memory_id?: string;
  query?: string;
  limit?: number;
  similarity_threshold?: number;
  exclude_ids?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return errorResponse(auth.error, auth.status);
    }

    const userId = auth.userId;

    const access = await checkIntelligenceAccess(userId, TOOL_NAME);
    if (!access.allowed) {
      const tierInfo = await getUserTierInfo(userId);
      return premiumRequiredResponse(
        access.reason || "Feature not available",
        tierInfo?.tier_name
      );
    }

    const body: FindRelatedRequest = await req.json().catch(() => ({}));
    const limit = Math.min(body.limit || 5, 20);
    const threshold = body.similarity_threshold || 0.7;
    const excludeIds = body.exclude_ids || [];

    const supabase = getSupabaseClient();
    let queryText = body.query;
    let sourceMemoryId = body.memory_id;

    // If memory_id provided, use its content as query
    if (sourceMemoryId && !queryText) {
      const { data: sourceMemory } = await supabase
        .from("memory_entries")
        .select("title, content")
        .eq("id", sourceMemoryId)
        .eq("user_id", userId)
        .single();

      if (!sourceMemory) {
        return errorResponse("Source memory not found", 404);
      }

      queryText = `${sourceMemory.title} ${sourceMemory.content}`;
      excludeIds.push(sourceMemoryId);
    }

    if (!queryText) {
      return errorResponse("Either memory_id or query is required");
    }

    // Check cache
    const cacheKey = generateCacheKey(userId, TOOL_NAME, {
      query: queryText.slice(0, 100),
      limit,
      threshold,
    });
    const cached = await checkCache(cacheKey);

    if (cached.hit) {
      await logUsage(userId, TOOL_NAME, 0, 0, Date.now() - startTime, true, true);
      const tierInfo = await getUserTierInfo(userId);
      return successResponse(
        cached.data,
        { tokens_used: 0, cost_usd: 0, cached: true },
        { tier: tierInfo?.tier_name || "free", usage_remaining: access.usage_remaining || 0 }
      );
    }

    // Generate embedding for query
    const { embedding: queryEmbedding, cost: embeddingCost } = await generateEmbedding(
      queryText.slice(0, 8000)
    );

    // Try vector search with pgvector (if embeddings exist)
    let { data: memoriesWithEmbeddings } = await supabase
      .from("memory_entries")
      .select("id, title, content, type, tags, embedding, created_at")
      .eq("user_id", userId)
      .not("embedding", "is", null)
      .limit(100);

    let results: Array<{
      id: string;
      title: string;
      type: string;
      tags: string[];
      similarity: number;
      snippet: string;
    }> = [];

    if (memoriesWithEmbeddings && memoriesWithEmbeddings.length > 0) {
      // Calculate similarities
      const similarities = memoriesWithEmbeddings
        .filter((m) => !excludeIds.includes(m.id))
        .map((memory) => {
          const similarity = cosineSimilarity(queryEmbedding, memory.embedding);
          return {
            id: memory.id,
            title: memory.title,
            type: memory.type,
            tags: memory.tags || [],
            similarity: Math.round(similarity * 1000) / 1000,
            snippet: memory.content?.slice(0, 200) + "...",
          };
        })
        .filter((m) => m.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      results = similarities;
    } else {
      // Fallback: keyword-based search with tag matching
      const keywords = queryText
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 10);

      const { data: fallbackMemories } = await supabase
        .from("memory_entries")
        .select("id, title, content, type, tags, created_at")
        .eq("user_id", userId)
        .not("id", "in", `(${excludeIds.join(",")})`)
        .limit(50);

      if (fallbackMemories) {
        results = fallbackMemories
          .map((memory) => {
            const contentLower = (memory.content || "").toLowerCase();
            const titleLower = (memory.title || "").toLowerCase();

            // Simple keyword matching score
            let score = 0;
            for (const keyword of keywords) {
              if (titleLower.includes(keyword)) score += 0.2;
              if (contentLower.includes(keyword)) score += 0.1;
            }

            // Tag overlap bonus
            if (memory.tags) {
              for (const tag of memory.tags) {
                if (keywords.some((k) => tag.toLowerCase().includes(k))) {
                  score += 0.15;
                }
              }
            }

            return {
              id: memory.id,
              title: memory.title,
              type: memory.type,
              tags: memory.tags || [],
              similarity: Math.min(score, 0.99),
              snippet: memory.content?.slice(0, 200) + "...",
            };
          })
          .filter((m) => m.similarity >= threshold * 0.5)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);
      }
    }

    const result = {
      query: queryText.slice(0, 100),
      source_memory_id: sourceMemoryId,
      related_memories: results,
      total_found: results.length,
      search_method: memoriesWithEmbeddings?.length ? "semantic" : "keyword",
      threshold_used: threshold,
    };

    // Cache result
    await setCache(cacheKey, TOOL_NAME, userId, result, 0, 12);

    await logUsage(
      userId,
      TOOL_NAME,
      0,
      embeddingCost,
      Date.now() - startTime,
      false,
      true
    );

    const tierInfo = await getUserTierInfo(userId);
    return successResponse(
      result,
      { tokens_used: 0, cost_usd: embeddingCost, cached: false },
      { tier: tierInfo?.tier_name || "free", usage_remaining: (access.usage_remaining || 1) - 1 }
    );
  } catch (error) {
    console.error("Find related error:", error);
    return errorResponse("Internal server error", 500);
  }
});
