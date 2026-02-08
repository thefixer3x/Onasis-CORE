// Intelligence API: Behavior Recall
// Recalls relevant behavior patterns for the current task context
// POST /intelligence/behavior-recall

import {
  corsHeaders,
  authenticateRequest,
  checkIntelligenceAccess,
  getUserTierInfo,
  logUsage,
  generateEmbedding,
  cosineSimilarity,
  getSupabaseClient,
  errorResponse,
  successResponse,
  premiumRequiredResponse,
} from "../_shared/utils.ts";

const TOOL_NAME = "behavior_recall";

interface BehaviorRecallRequest {
  context: {
    current_directory: string;
    current_task: string;
    project_type?: string;
  };
  limit?: number;
  similarity_threshold?: number;
  user_id?: string;
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

    const body: BehaviorRecallRequest = await req.json().catch(() => ({} as BehaviorRecallRequest));

    if (!body.context?.current_task) {
      return errorResponse("context.current_task is required");
    }
    if (!body.context?.current_directory) {
      return errorResponse("context.current_directory is required");
    }

    const limit = Math.min(Math.max(body.limit || 5, 1), 10);
    const threshold = Math.max(0, Math.min(body.similarity_threshold ?? 0.7, 1));

    const supabase = getSupabaseClient();

    // Generate embedding for the current task description
    let queryEmbedding: number[] | null = null;
    let embeddingCost = 0;
    let embeddingProvider: string | null = null;

    try {
      const embResult = await generateEmbedding(body.context.current_task);
      queryEmbedding = embResult.embedding;
      embeddingCost = embResult.cost;
      embeddingProvider = embResult.provider;
    } catch (err) {
      console.warn("Failed to generate query embedding:", err);
    }

    // Fetch user's behavior patterns
    const { data: patterns, error: fetchError } = await supabase
      .from("behavior_patterns")
      .select("*")
      .eq("user_id", userId)
      .order("use_count", { ascending: false });

    if (fetchError) {
      console.error("Failed to fetch behavior patterns:", fetchError);
      return errorResponse("Failed to recall behavior patterns", 500);
    }

    if (!patterns || patterns.length === 0) {
      const tierInfo = await getUserTierInfo(userId);
      return successResponse(
        {
          patterns: [],
          total_patterns: 0,
          message: "No behavior patterns recorded yet. Use behavior_record to save workflow patterns.",
        },
        { tokens_used: 0, cost_usd: embeddingCost, cached: false },
        { tier: tierInfo?.tier_name || "free", usage_remaining: (access.usage_remaining || 1) - 1 }
      );
    }

    // Score patterns by similarity
    interface ScoredPattern {
      id: string;
      trigger: string;
      context: Record<string, unknown>;
      actions: unknown[];
      final_outcome: string;
      confidence: number;
      use_count: number;
      similarity: number;
      last_used_at: string;
      created_at: string;
    }

    const scoredPatterns: ScoredPattern[] = [];

    for (const pattern of patterns) {
      let similarity = 0;

      if (queryEmbedding) {
        // Use the matching embedding column based on provider
        const patternEmbedding = embeddingProvider === 'voyage'
          ? pattern.voyage_trigger_embedding
          : pattern.trigger_embedding;

        if (patternEmbedding) {
          // Parse embedding if stored as string/JSON
          const embArray = typeof patternEmbedding === 'string'
            ? JSON.parse(patternEmbedding)
            : patternEmbedding;

          // Only compare if dimensions match
          if (Array.isArray(embArray) && embArray.length === queryEmbedding.length) {
            similarity = cosineSimilarity(queryEmbedding, embArray);
          }
        }
      }

      // Boost similarity for matching context
      if (pattern.context?.project_type && body.context.project_type) {
        if (pattern.context.project_type === body.context.project_type) {
          similarity = Math.min(1, similarity + 0.05);
        }
      }

      // Boost for directory match
      if (pattern.context?.directory && body.context.current_directory) {
        if (pattern.context.directory === body.context.current_directory) {
          similarity = Math.min(1, similarity + 0.03);
        }
      }

      if (similarity >= threshold || !queryEmbedding) {
        scoredPatterns.push({
          id: pattern.id,
          trigger: pattern.trigger,
          context: pattern.context,
          actions: pattern.actions,
          final_outcome: pattern.final_outcome,
          confidence: pattern.confidence,
          use_count: pattern.use_count,
          similarity: Math.round(similarity * 1000) / 1000,
          last_used_at: pattern.last_used_at,
          created_at: pattern.created_at,
        });
      }
    }

    // Sort by similarity (descending), then by use_count
    scoredPatterns.sort((a, b) => {
      if (Math.abs(a.similarity - b.similarity) > 0.01) {
        return b.similarity - a.similarity;
      }
      return b.use_count - a.use_count;
    });

    const topPatterns = scoredPatterns.slice(0, limit);
    const tokensUsed = Math.ceil(embeddingCost / 0.00000002);

    await logUsage(
      userId,
      TOOL_NAME,
      tokensUsed,
      embeddingCost,
      Date.now() - startTime,
      false,
      true
    );

    const tierInfo = await getUserTierInfo(userId);
    return successResponse(
      {
        patterns: topPatterns,
        total_patterns: patterns.length,
        matched_patterns: scoredPatterns.length,
        query_context: {
          task: body.context.current_task,
          directory: body.context.current_directory,
          project_type: body.context.project_type || null,
        },
      },
      { tokens_used: tokensUsed, cost_usd: embeddingCost, cached: false },
      { tier: tierInfo?.tier_name || "free", usage_remaining: (access.usage_remaining || 1) - 1 }
    );
  } catch (error) {
    console.error("Behavior recall error:", error);
    return errorResponse("Internal server error", 500);
  }
});
