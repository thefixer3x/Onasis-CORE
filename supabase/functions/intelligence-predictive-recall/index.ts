/// <reference lib="deno.ns" />
// Intelligence API: Predictive Recall
// AI-assisted anticipatory recall based on context, recency, and usage patterns
// POST /intelligence/predictive-recall

import {
  applyIntelligenceMemoryContext,
  authenticateRequest,
  checkCache,
  checkIntelligenceAccess,
  corsHeaders,
  errorResponse,
  extendCacheKeyParams,
  generateCacheKey,
  generateEmbedding,
  getSupabaseClient,
  getUserTierInfo,
  incrementIntelligenceUsage,
  premiumRequiredResponse,
  resolveIntelligenceQueryContext,
  setCache,
  successResponse,
} from "../_shared/utils.ts";
import {
  buildContextText,
  buildContextUsedSummary,
  DEFAULT_PREDICTION_SCORING,
  generatePredictions,
  PredictedMemory,
  PredictionCandidate,
  PredictiveContext,
} from "../_shared/intelligence-prediction.ts";

const TOOL_NAME = "predictive_recall";

interface PredictiveRecallRequest {
  user_id?: string;
  userId?: string;
  organization_id?: string;
  organizationId?: string;
  topic_id?: string;
  topicId?: string;
  query_scope?: "personal" | "team" | "organization" | "hybrid";
  queryScope?: "personal" | "team" | "organization" | "hybrid";
  memory_type?: string;
  memory_types?: string[] | string;
  memoryTypes?: string[] | string;
  context?: Record<string, unknown>;
  limit?: number;
  min_confidence?: number;
  minConfidence?: number;
  include_serendipity?: boolean;
  includeSerendipity?: boolean;
  time_window_days?: number;
  timeWindowDays?: number;
  response_format?: "json" | "markdown";
  responseFormat?: "json" | "markdown";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length > 0 ? values : undefined;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const values = value.split(",").map((item) => item.trim()).filter(Boolean);
    return values.length > 0 ? values : undefined;
  }

  return undefined;
}

function normalizeContext(
  raw: Record<string, unknown> | undefined,
): PredictiveContext {
  const value = raw || {};
  return {
    currentProject: readString(value.currentProject) ||
      readString(value.current_project),
    recentTopics: toStringArray(value.recentTopics || value.recent_topics),
    activeFiles: toStringArray(value.activeFiles || value.active_files),
    contextText: readString(value.contextText) ||
      readString(value.context_text),
    teamContext: readString(value.teamContext) ||
      readString(value.team_context),
  };
}

function parseEmbeddingValue(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "number") ? value : null;
  }

  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) &&
          parsed.every((item) => typeof item === "number")
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function selectCandidateEmbedding(
  memory: Record<string, unknown>,
  provider: string,
  dimensions: number,
): number[] | null {
  const preferredKeys = provider === "voyage"
    ? ["voyage_embedding", "embedding"]
    : ["embedding", "voyage_embedding"];

  for (const key of preferredKeys) {
    const parsed = parseEmbeddingValue(memory[key]);
    if (parsed && parsed.length === dimensions) {
      return parsed;
    }
  }

  return null;
}

async function safeIncrementUsage(userId: string) {
  try {
    await incrementIntelligenceUsage(userId);
  } catch (error) {
    console.warn("[predictive-recall] Failed to increment quota usage:", error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
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
        tierInfo?.tier_name,
      );
    }

    const body: PredictiveRecallRequest = await req.json().catch(() => ({}));
    const requestedUserId = readString(body.userId) || readString(body.user_id);
    if (requestedUserId && requestedUserId !== userId) {
      return errorResponse("Cross-user predictive recall is not allowed", 403);
    }

    const contextInput = normalizeContext(body.context);
    const contextText = buildContextText(contextInput);
    const limit = Math.min(Math.max(readNumber(body.limit) || 5, 1), 20);
    const minConfidence = Math.min(
      Math.max(readNumber(body.minConfidence ?? body.min_confidence) || 40, 0),
      100,
    );
    const includeSerendipity =
      readBoolean(body.includeSerendipity ?? body.include_serendipity) ?? true;
    const timeWindowDays = Math.min(
      Math.max(
        readNumber(body.timeWindowDays ?? body.time_window_days) || 90,
        1,
      ),
      365,
    );

    const normalizedBody: Record<string, unknown> = {
      organization_id: readString(body.organizationId) ||
        readString(body.organization_id),
      topic_id: readString(body.topicId) || readString(body.topic_id),
      query_scope: readString(body.queryScope) || readString(body.query_scope),
      memory_types: toStringArray(body.memoryTypes ?? body.memory_types),
      memory_type: readString(body.memory_type),
    };

    const context = resolveIntelligenceQueryContext(auth, normalizedBody);
    if ("error" in context) {
      return errorResponse(context.error, context.status);
    }

    const cacheKey = generateCacheKey(
      userId,
      TOOL_NAME,
      extendCacheKeyParams(
        {
          contextText: contextText.slice(0, 500),
          limit,
          minConfidence,
          includeSerendipity,
          timeWindowDays,
        },
        context,
      ),
    );
    const cached = await checkCache(cacheKey);
    if (cached.hit) {
      const tierInfo = await getUserTierInfo(userId);
      return successResponse(
        cached.data,
        { tokens_used: 0, cost_usd: 0, cached: true },
        {
          tier: tierInfo?.tier_name || "free",
          usage_remaining: access.usage_remaining || 0,
        },
      );
    }

    if (!contextText.trim()) {
      const emptyResult = {
        predictions: [],
        totalPredictions: 0,
        memoriesAnalyzed: 0,
        contextUsed: buildContextUsedSummary(contextInput),
        scoringWeights: {
          semantic: DEFAULT_PREDICTION_SCORING.semanticWeight,
          temporal: DEFAULT_PREDICTION_SCORING.temporalWeight,
          frequency: DEFAULT_PREDICTION_SCORING.frequencyWeight,
          serendipity: DEFAULT_PREDICTION_SCORING.serendipityWeight,
        },
        algorithmInfo: {
          version: "1.0.0",
          embeddingModel: Deno.env.get("VOYAGE_MODEL") || "voyage-4",
          timeWindowDays,
        },
        generatedAt: new Date().toISOString(),
      };

      return successResponse(
        emptyResult,
        { tokens_used: 0, cost_usd: 0, cached: false },
        {
          tier: (await getUserTierInfo(userId))?.tier_name || "free",
          usage_remaining: access.usage_remaining || 0,
        },
      );
    }

    const embeddingResult = await generateEmbedding(contextText);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

    const supabase = getSupabaseClient();
    let memoriesQuery = supabase
      .from("memory_entries")
      .select(
        "id, title, content, type, memory_type, tags, embedding, voyage_embedding, embedding_provider, embedding_model, metadata, created_at, updated_at, last_accessed, access_count",
      )
      .gte("created_at", cutoffDate.toISOString())
      .is("deleted_at", null);

    memoriesQuery = applyIntelligenceMemoryContext(
      memoriesQuery,
      auth,
      context,
    );
    const { data: rawMemories, error: memoriesError } = await memoriesQuery
      .order("updated_at", { ascending: false })
      .limit(200);

    if (memoriesError) {
      return errorResponse(
        `Failed to fetch memories: ${memoriesError.message}`,
        500,
      );
    }

    const candidateMemories: PredictionCandidate[] = (rawMemories || [])
      .map((memory) => {
        const embedding = selectCandidateEmbedding(
          memory as Record<string, unknown>,
          embeddingResult.provider,
          embeddingResult.dimensions,
        );
        if (!embedding) return null;

        return {
          id: String(memory.id),
          title: String(memory.title || ""),
          content: String(memory.content || ""),
          type: String(memory.type || memory.memory_type || "context"),
          tags: Array.isArray(memory.tags)
            ? memory.tags.filter((tag): tag is string =>
              typeof tag === "string"
            )
            : [],
          embedding,
          createdAt: new Date(String(memory.created_at)),
          updatedAt: new Date(
            String(
              memory.last_accessed || memory.updated_at || memory.created_at,
            ),
          ),
          accessCount: typeof memory.access_count === "number"
            ? memory.access_count
            : 0,
        } satisfies PredictionCandidate;
      })
      .filter((memory): memory is PredictionCandidate => memory !== null);

    const predictions = generatePredictions(
      embeddingResult.embedding,
      candidateMemories,
      {
        limit,
        minConfidence,
        includeSerendipity,
        context: contextInput,
      },
    );

    const result = {
      predictions,
      totalPredictions: predictions.length,
      memoriesAnalyzed: candidateMemories.length,
      contextUsed: buildContextUsedSummary(contextInput),
      scoringWeights: {
        semantic: DEFAULT_PREDICTION_SCORING.semanticWeight,
        temporal: DEFAULT_PREDICTION_SCORING.temporalWeight,
        frequency: DEFAULT_PREDICTION_SCORING.frequencyWeight,
        serendipity: DEFAULT_PREDICTION_SCORING.serendipityWeight,
      },
      algorithmInfo: {
        version: "1.0.0",
        embeddingModel: Deno.env.get("VOYAGE_MODEL") ||
          (embeddingResult.provider === "voyage"
            ? "voyage-4"
            : "text-embedding-3-small"),
        timeWindowDays,
      },
      generatedAt: new Date().toISOString(),
    };

    if (predictions.length > 0) {
      const suggestionRows = predictions.map((prediction: PredictedMemory) => ({
        user_id: userId,
        suggested_memory: prediction,
        prediction_confidence: Number((prediction.confidence / 100).toFixed(4)),
        prediction_reason: prediction.reasonType,
        context_memories: candidateMemories.slice(0, 20).map((memory) =>
          memory.id
        ),
        based_on_patterns: {
          source: "intelligence-predictive-recall",
          query_scope: context.query_scope || "personal",
          organization_id: context.organization_id || auth.organizationId,
          topic_id: context.topic_id || null,
          context_used: result.contextUsed,
          scoring_weights: result.scoringWeights,
          generated_at: result.generatedAt,
        },
      }));

      const { error: insertError } = await supabase
        .from("predictive_memory_suggestions")
        .insert(suggestionRows);

      if (insertError) {
        console.warn(
          "[predictive-recall] Failed to persist suggestions:",
          insertError.message,
        );
      }
    }

    await setCache(
      cacheKey,
      TOOL_NAME,
      userId,
      result,
      0,
      6,
    );
    await safeIncrementUsage(userId);

    const tierInfo = await getUserTierInfo(userId);
    return successResponse(
      result,
      { tokens_used: 0, cost_usd: embeddingResult.cost, cached: false },
      {
        tier: tierInfo?.tier_name || "free",
        usage_remaining: Math.max((access.usage_remaining || 1) - 1, 0),
      },
    );
  } catch (error) {
    console.error(
      "Predictive recall error:",
      error,
      "elapsedMs=",
      Date.now() - startTime,
    );
    return errorResponse("Internal server error", 500);
  }
});
