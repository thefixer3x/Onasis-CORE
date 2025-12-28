// Intelligence API: Extract Insights
// AI-powered insight extraction from memory collections
// POST /intelligence/extract-insights

import {
  corsHeaders,
  authenticateRequest,
  checkIntelligenceAccess,
  getUserTierInfo,
  logUsage,
  generateCacheKey,
  checkCache,
  setCache,
  chatCompletion,
  getSupabaseClient,
  errorResponse,
  successResponse,
  premiumRequiredResponse,
} from "../_shared/utils.ts";

const TOOL_NAME = "extract_insights";

interface ExtractInsightsRequest {
  memory_ids?: string[];
  topic?: string;
  time_range_days?: number;
  insight_types?: Array<"themes" | "connections" | "gaps" | "actions" | "summary">;
  detail_level?: "brief" | "detailed" | "comprehensive";
}

interface Insight {
  type: string;
  content: string;
  confidence: number;
  related_memory_ids?: string[];
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

    const body: ExtractInsightsRequest = await req.json().catch(() => ({}));
    const insightTypes = body.insight_types || ["themes", "connections", "actions"];
    const detailLevel = body.detail_level || "detailed";
    const timeRangeDays = body.time_range_days || 30;

    const supabase = getSupabaseClient();

    // Fetch memories
    let memories;
    if (body.memory_ids && body.memory_ids.length > 0) {
      const { data } = await supabase
        .from("memory_entries")
        .select("id, title, content, type, tags, created_at")
        .eq("user_id", userId)
        .in("id", body.memory_ids);
      memories = data;
    } else {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeRangeDays);

      let query = supabase
        .from("memory_entries")
        .select("id, title, content, type, tags, created_at")
        .eq("user_id", userId)
        .gte("created_at", cutoffDate.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);

      if (body.topic) {
        query = query.or(
          `title.ilike.%${body.topic}%,content.ilike.%${body.topic}%,tags.cs.{${body.topic}}`
        );
      }

      const { data } = await query;
      memories = data;
    }

    if (!memories || memories.length === 0) {
      return successResponse({
        insights: [],
        message: "No memories found for analysis",
      });
    }

    // Check cache
    const cacheKey = generateCacheKey(userId, TOOL_NAME, {
      memoryCount: memories.length,
      types: insightTypes,
      level: detailLevel,
      topic: body.topic,
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

    // Prepare memory summary for AI
    const memorySummary = memories
      .map(
        (m, i) =>
          `[${i + 1}] ${m.title} (${m.type}): ${m.content?.slice(0, 300)}${
            m.content?.length > 300 ? "..." : ""
          }`
      )
      .join("\n\n");

    const detailInstructions = {
      brief: "Keep each insight to 1-2 sentences.",
      detailed: "Provide detailed insights with specific examples from the memories.",
      comprehensive:
        "Provide comprehensive analysis with examples, connections, and recommendations.",
    };

    const typePrompts: Record<string, string> = {
      themes:
        "Identify the main themes and topics across these memories. What patterns emerge?",
      connections:
        "Find non-obvious connections between different memories. What links ideas together?",
      gaps:
        "Identify knowledge gaps - what topics are mentioned but not fully explored?",
      actions:
        "Extract actionable insights - what should the user do based on this knowledge?",
      summary: "Provide an executive summary of the key knowledge in these memories.",
    };

    const selectedPrompts = insightTypes
      .map((type) => `${type.toUpperCase()}: ${typePrompts[type]}`)
      .join("\n");

    const prompt = `Analyze these ${memories.length} memories and extract insights.

${detailInstructions[detailLevel]}

Memories:
${memorySummary}

Provide insights for each requested type:
${selectedPrompts}

Return as JSON:
{
  "insights": [
    {
      "type": "themes|connections|gaps|actions|summary",
      "content": "the insight text",
      "confidence": 0.0-1.0,
      "related_memory_ids": [indices from above, 1-indexed]
    }
  ],
  "overall_summary": "brief 1-2 sentence summary"
}`;

    const completion = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a knowledge analyst helping users understand patterns in their notes and memories. Be insightful but grounded in the actual content.",
        },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini"
    );

    let insights: Insight[] = [];
    let overallSummary = "";

    try {
      const parsed = JSON.parse(completion.content);
      insights = parsed.insights || [];
      overallSummary = parsed.overall_summary || "";

      // Map indices to actual memory IDs
      insights = insights.map((insight) => ({
        ...insight,
        related_memory_ids: insight.related_memory_ids
          ?.map((idx: number) => memories[idx - 1]?.id)
          .filter(Boolean),
      }));
    } catch {
      // Parse manually if JSON fails
      insights = [
        {
          type: "summary",
          content: completion.content,
          confidence: 0.7,
        },
      ];
    }

    const result = {
      insights,
      overall_summary: overallSummary,
      memories_analyzed: memories.length,
      insight_types: insightTypes,
      topic_filter: body.topic || null,
      generated_at: new Date().toISOString(),
    };

    // Cache result
    await setCache(cacheKey, TOOL_NAME, userId, result, completion.tokensUsed, 6);

    await logUsage(
      userId,
      TOOL_NAME,
      completion.tokensUsed,
      completion.cost,
      Date.now() - startTime,
      false,
      true
    );

    const tierInfo = await getUserTierInfo(userId);
    return successResponse(
      result,
      { tokens_used: completion.tokensUsed, cost_usd: completion.cost, cached: false },
      { tier: tierInfo?.tier_name || "free", usage_remaining: (access.usage_remaining || 1) - 1 }
    );
  } catch (error) {
    console.error("Extract insights error:", error);
    return errorResponse("Internal server error", 500);
  }
});
