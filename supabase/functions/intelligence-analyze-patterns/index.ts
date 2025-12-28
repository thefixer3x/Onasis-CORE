// Intelligence API: Analyze Patterns
// Analyzes usage patterns and trends in memory collection
// POST /intelligence/analyze-patterns

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

const TOOL_NAME = "analyze_patterns";

interface AnalyzePatternsRequest {
  time_range_days?: number;
  include_insights?: boolean;
  response_format?: "json" | "markdown";
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Authenticate
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return errorResponse(auth.error, auth.status);
    }

    const userId = auth.userId;

    // Check tier access
    const access = await checkIntelligenceAccess(userId, TOOL_NAME);
    if (!access.allowed) {
      const tierInfo = await getUserTierInfo(userId);
      return premiumRequiredResponse(
        access.reason || "Feature not available",
        tierInfo?.tier_name
      );
    }

    // Parse request
    const body: AnalyzePatternsRequest = await req.json().catch(() => ({}));
    const timeRangeDays = body.time_range_days || 30;
    const includeInsights = body.include_insights !== false;
    const responseFormat = body.response_format || "json";

    // Check cache
    const cacheKey = generateCacheKey(userId, TOOL_NAME, {
      timeRangeDays,
      includeInsights,
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

    // Fetch memories for analysis
    const supabase = getSupabaseClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeRangeDays);

    const { data: memories, error: fetchError } = await supabase
      .from("memory_entries")
      .select("id, title, content, type, tags, created_at, access_count")
      .eq("user_id", userId)
      .gte("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: false });

    if (fetchError) {
      return errorResponse("Failed to fetch memories: " + fetchError.message);
    }

    if (!memories || memories.length === 0) {
      return successResponse({
        total_memories: 0,
        message: "No memories found in the specified time range",
        patterns: null,
      });
    }

    // Analyze patterns locally
    const typeDistribution: Record<string, number> = {};
    const tagFrequency: Record<string, number> = {};
    const dayOfWeekDistribution: Record<string, number> = {
      Sunday: 0,
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0,
    };
    const hourDistribution: Record<number, number> = {};
    let totalContentLength = 0;

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    for (const memory of memories) {
      // Type distribution
      typeDistribution[memory.type] = (typeDistribution[memory.type] || 0) + 1;

      // Tag frequency
      if (memory.tags) {
        for (const tag of memory.tags) {
          tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
        }
      }

      // Day of week
      const date = new Date(memory.created_at);
      const dayName = days[date.getDay()];
      dayOfWeekDistribution[dayName]++;

      // Hour distribution
      const hour = date.getHours();
      hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;

      // Content length
      totalContentLength += memory.content?.length || 0;
    }

    // Find peak hours
    const peakHours = Object.entries(hourDistribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    // Top tags
    const topTags = Object.entries(tagFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Build patterns object
    const patterns = {
      total_memories: memories.length,
      time_range_days: timeRangeDays,
      average_content_length: Math.round(totalContentLength / memories.length),
      memories_by_type: typeDistribution,
      memories_by_day_of_week: dayOfWeekDistribution,
      peak_creation_hours: peakHours,
      top_tags: topTags,
      most_accessed: memories
        .filter((m) => m.access_count > 0)
        .sort((a, b) => (b.access_count || 0) - (a.access_count || 0))
        .slice(0, 5)
        .map((m) => ({ id: m.id, title: m.title, access_count: m.access_count })),
    };

    // Generate AI insights if requested
    let insights: string[] = [];
    let tokensUsed = 0;
    let totalCost = 0;

    if (includeInsights && memories.length >= 5) {
      const prompt = `Analyze these memory usage patterns and provide 3-5 actionable insights:

Total memories: ${patterns.total_memories}
Types: ${JSON.stringify(patterns.memories_by_type)}
Peak hours: ${patterns.peak_creation_hours.join(", ")}:00
Top tags: ${patterns.top_tags.map((t) => t.tag).join(", ")}
Most active days: ${Object.entries(patterns.memories_by_day_of_week)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([day]) => day)
        .join(", ")}

Provide insights in JSON array format: ["insight 1", "insight 2", ...]`;

      try {
        const completion = await chatCompletion([
          {
            role: "system",
            content:
              "You are a productivity analyst helping users understand their memory/note-taking patterns. Be concise and actionable.",
          },
          { role: "user", content: prompt },
        ]);

        tokensUsed = completion.tokensUsed;
        totalCost = completion.cost;

        // Parse insights from response
        try {
          const parsed = JSON.parse(completion.content);
          if (Array.isArray(parsed)) {
            insights = parsed;
          }
        } catch {
          // Extract insights from text if JSON parsing fails
          insights = completion.content
            .split(/\d+\./)
            .filter((s) => s.trim())
            .map((s) => s.trim());
        }
      } catch (aiError) {
        console.error("AI insights generation failed:", aiError);
        insights = ["Unable to generate AI insights at this time"];
      }
    }

    const result = {
      ...patterns,
      insights,
      generated_at: new Date().toISOString(),
    };

    // Format as markdown if requested
    const finalResult =
      responseFormat === "markdown" ? formatAsMarkdown(result) : result;

    // Cache the result
    await setCache(cacheKey, TOOL_NAME, userId, finalResult, tokensUsed, 6);

    // Log usage
    await logUsage(
      userId,
      TOOL_NAME,
      tokensUsed,
      totalCost,
      Date.now() - startTime,
      false,
      true
    );

    const tierInfo = await getUserTierInfo(userId);
    return successResponse(
      finalResult,
      { tokens_used: tokensUsed, cost_usd: totalCost, cached: false },
      {
        tier: tierInfo?.tier_name || "free",
        usage_remaining: (access.usage_remaining || 1) - 1,
      }
    );
  } catch (error) {
    console.error("Analyze patterns error:", error);
    return errorResponse("Internal server error", 500);
  }
});

function formatAsMarkdown(patterns: Record<string, unknown>): string {
  return `# Memory Pattern Analysis

## Summary
- **Total Memories**: ${patterns.total_memories}
- **Time Range**: Last ${patterns.time_range_days} days
- **Average Content Length**: ${patterns.average_content_length} characters

## Type Distribution
${Object.entries(patterns.memories_by_type as Record<string, number>)
  .map(([type, count]) => `- **${type}**: ${count} memories`)
  .join("\n")}

## Activity Patterns
- **Peak Hours**: ${(patterns.peak_creation_hours as number[]).map((h) => `${h}:00`).join(", ")}
- **Most Active Days**: ${Object.entries(patterns.memories_by_day_of_week as Record<string, number>)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([day]) => day)
    .join(", ")}

## Top Tags
${(patterns.top_tags as Array<{ tag: string; count: number }>)
  .slice(0, 5)
  .map((t, i) => `${i + 1}. **${t.tag}** (${t.count} uses)`)
  .join("\n")}

## Insights
${(patterns.insights as string[]).map((insight, i) => `${i + 1}. ${insight}`).join("\n")}

---
*Generated at ${patterns.generated_at}*`;
}
