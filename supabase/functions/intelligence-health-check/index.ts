// Intelligence API: Health Check
// Memory organization health score and recommendations
// POST /intelligence/health-check

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

const TOOL_NAME = "health_check";

interface HealthCheckRequest {
  include_recommendations?: boolean;
  detailed_breakdown?: boolean;
}

interface HealthScore {
  overall: number;
  breakdown: {
    organization: number;
    tagging: number;
    recency: number;
    completeness: number;
    diversity: number;
  };
}

interface HealthIssue {
  severity: "high" | "medium" | "low";
  category: string;
  description: string;
  affected_count: number;
  recommendation: string;
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

    const body: HealthCheckRequest = await req.json().catch(() => ({}));
    const includeRecommendations = body.include_recommendations !== false;
    const detailedBreakdown = body.detailed_breakdown !== false;

    // Check cache (short TTL for health checks)
    const cacheKey = generateCacheKey(userId, TOOL_NAME, {
      recommendations: includeRecommendations,
      detailed: detailedBreakdown,
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

    const supabase = getSupabaseClient();

    // Fetch all memories for analysis
    const { data: memories, error: fetchError } = await supabase
      .from("memory_entries")
      .select("id, title, content, type, tags, created_at, updated_at, access_count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      return errorResponse("Failed to fetch memories: " + fetchError.message);
    }

    if (!memories || memories.length === 0) {
      return successResponse({
        health_score: { overall: 0, breakdown: null },
        message: "No memories to analyze",
        recommendations: ["Start by creating your first memory!"],
      });
    }

    const issues: HealthIssue[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Calculate metrics
    const totalMemories = memories.length;
    // Note: is_archived column not in production schema, treat all as active
    const activeMemories = memories;
    const archivedMemories: typeof memories = [];

    // 1. Tagging Score
    const memoriesWithTags = memories.filter((m) => m.tags && m.tags.length > 0);
    const avgTagsPerMemory =
      memoriesWithTags.reduce((sum, m) => sum + (m.tags?.length || 0), 0) /
      (memoriesWithTags.length || 1);
    const taggingScore = Math.min(
      100,
      (memoriesWithTags.length / totalMemories) * 70 + Math.min(avgTagsPerMemory, 5) * 6
    );

    if (memoriesWithTags.length < totalMemories * 0.5) {
      issues.push({
        severity: "high",
        category: "tagging",
        description: "Many memories lack tags",
        affected_count: totalMemories - memoriesWithTags.length,
        recommendation: "Add tags to improve searchability and organization",
      });
    }

    // 2. Recency Score
    const recentMemories = memories.filter(
      (m) => new Date(m.created_at) > thirtyDaysAgo
    );
    const staleMemories = memories.filter(
      (m) => new Date(m.updated_at || m.created_at) < ninetyDaysAgo
    );
    const recencyScore = Math.min(100, (recentMemories.length / 10) * 30 + 70);

    if (staleMemories.length > totalMemories * 0.3) {
      issues.push({
        severity: "medium",
        category: "staleness",
        description: "Many memories haven't been updated in over 90 days",
        affected_count: staleMemories.length,
        recommendation: "Review and update or archive stale memories",
      });
    }

    // 3. Completeness Score
    const shortContentMemories = memories.filter(
      (m) => (m.content?.length || 0) < 100
    );
    const emptyTitleMemories = memories.filter(
      (m) => !m.title || m.title.trim().length < 5
    );
    const completenessScore = Math.max(
      0,
      100 -
        (shortContentMemories.length / totalMemories) * 40 -
        (emptyTitleMemories.length / totalMemories) * 30
    );

    if (shortContentMemories.length > totalMemories * 0.2) {
      issues.push({
        severity: "low",
        category: "completeness",
        description: "Some memories have very short content",
        affected_count: shortContentMemories.length,
        recommendation: "Consider expanding short memories with more context",
      });
    }

    // 4. Organization Score
    const typeDistribution: Record<string, number> = {};
    memories.forEach((m) => {
      typeDistribution[m.type] = (typeDistribution[m.type] || 0) + 1;
    });
    const typeCount = Object.keys(typeDistribution).length;
    const organizationScore = Math.min(100, typeCount * 15 + 40);

    if (typeCount < 3) {
      issues.push({
        severity: "low",
        category: "organization",
        description: "Limited variety in memory types",
        affected_count: 0,
        recommendation: "Use different memory types (context, project, knowledge, etc.)",
      });
    }

    // 5. Diversity Score (tag variety)
    const allTags = new Set<string>();
    memories.forEach((m) => m.tags?.forEach((t: string) => allTags.add(t)));
    const uniqueTags = allTags.size;
    const diversityScore = Math.min(100, (uniqueTags / Math.max(1, totalMemories * 0.3)) * 100);

    // Calculate overall score
    const overallScore = Math.round(
      taggingScore * 0.25 +
        recencyScore * 0.15 +
        completenessScore * 0.2 +
        organizationScore * 0.2 +
        diversityScore * 0.2
    );

    const healthScore: HealthScore = {
      overall: overallScore,
      breakdown: {
        organization: Math.round(organizationScore),
        tagging: Math.round(taggingScore),
        recency: Math.round(recencyScore),
        completeness: Math.round(completenessScore),
        diversity: Math.round(diversityScore),
      },
    };

    // Generate AI recommendations if requested
    let aiRecommendations: string[] = [];
    let tokensUsed = 0;
    let cost = 0;

    if (includeRecommendations && issues.length > 0) {
      const issuesSummary = issues
        .map((i) => `- ${i.severity}: ${i.description} (${i.affected_count} affected)`)
        .join("\n");

      const prompt = `Based on this memory collection health analysis, provide 3-5 specific, actionable recommendations.

Stats:
- Total memories: ${totalMemories}
- Tagged memories: ${memoriesWithTags.length}
- Recent (30d): ${recentMemories.length}
- Stale (90d+): ${staleMemories.length}
- Memory types used: ${typeCount}
- Unique tags: ${uniqueTags}

Issues found:
${issuesSummary}

Health score: ${overallScore}/100

Return as JSON array: ["recommendation 1", "recommendation 2", ...]`;

      try {
        const completion = await chatCompletion([
          {
            role: "system",
            content:
              "You are a productivity and knowledge management expert. Provide specific, actionable advice.",
          },
          { role: "user", content: prompt },
        ]);

        tokensUsed = completion.tokensUsed;
        cost = completion.cost;

        try {
          aiRecommendations = JSON.parse(completion.content);
        } catch {
          aiRecommendations = completion.content
            .split(/\d+\./)
            .filter((s) => s.trim())
            .map((s) => s.trim());
        }
      } catch {
        aiRecommendations = issues.map((i) => i.recommendation);
      }
    }

    // Determine health status
    let status: "excellent" | "good" | "needs_attention" | "poor";
    if (overallScore >= 80) status = "excellent";
    else if (overallScore >= 60) status = "good";
    else if (overallScore >= 40) status = "needs_attention";
    else status = "poor";

    const result = {
      health_score: healthScore,
      status,
      statistics: {
        total_memories: totalMemories,
        active_memories: activeMemories.length,
        archived_memories: archivedMemories.length,
        memories_with_tags: memoriesWithTags.length,
        unique_tags: uniqueTags,
        memory_types: typeCount,
        recent_memories_30d: recentMemories.length,
        stale_memories_90d: staleMemories.length,
      },
      issues: issues.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
      recommendations: aiRecommendations,
      generated_at: new Date().toISOString(),
    };

    // Cache result (shorter TTL for health checks - 3 hours)
    await setCache(cacheKey, TOOL_NAME, userId, result, tokensUsed, 3);

    await logUsage(userId, TOOL_NAME, tokensUsed, cost, Date.now() - startTime, false, true);

    const tierInfo = await getUserTierInfo(userId);
    return successResponse(
      result,
      { tokens_used: tokensUsed, cost_usd: cost, cached: false },
      { tier: tierInfo?.tier_name || "free", usage_remaining: (access.usage_remaining || 1) - 1 }
    );
  } catch (error) {
    console.error("Health check error:", error);
    return errorResponse("Internal server error", 500);
  }
});
