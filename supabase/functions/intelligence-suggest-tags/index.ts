// Intelligence API: Suggest Tags
// AI-powered tag suggestions for memories
// POST /intelligence/suggest-tags

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

const TOOL_NAME = "suggest_tags";

interface SuggestTagsRequest {
  memory_id?: string;
  content?: string;
  title?: string;
  existing_tags?: string[];
  max_suggestions?: number;
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

    const body: SuggestTagsRequest = await req.json().catch(() => ({}));
    const maxSuggestions = Math.min(body.max_suggestions || 5, 10);

    let content = body.content;
    let title = body.title;
    let existingTags = body.existing_tags || [];

    // If memory_id provided, fetch the memory
    if (body.memory_id && !content) {
      const supabase = getSupabaseClient();
      const { data: memory } = await supabase
        .from("memory_entries")
        .select("title, content, tags")
        .eq("id", body.memory_id)
        .eq("user_id", userId)
        .single();

      if (memory) {
        content = memory.content;
        title = memory.title;
        existingTags = memory.tags || [];
      } else {
        return errorResponse("Memory not found or access denied", 404);
      }
    }

    if (!content) {
      return errorResponse("Either memory_id or content is required");
    }

    // Check cache
    const cacheKey = generateCacheKey(userId, TOOL_NAME, {
      content: content.slice(0, 200),
      existingTags,
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

    // Fetch user's existing tags for context
    const supabase = getSupabaseClient();
    const { data: userTags } = await supabase
      .from("memory_entries")
      .select("tags")
      .eq("user_id", userId)
      .not("tags", "is", null);

    const allUserTags = new Set<string>();
    userTags?.forEach((m) => m.tags?.forEach((t: string) => allUserTags.add(t)));
    const topUserTags = Array.from(allUserTags).slice(0, 20);

    // Generate suggestions with AI
    const prompt = `Suggest ${maxSuggestions} relevant tags for this content.

Title: ${title || "Untitled"}
Content: ${content.slice(0, 1000)}

Existing tags on this item: ${existingTags.join(", ") || "none"}
User's commonly used tags: ${topUserTags.join(", ") || "none"}

Rules:
1. Suggest tags that are relevant to the content
2. Prefer using user's existing tags when appropriate
3. Keep tags short (1-3 words, lowercase, hyphenated if multi-word)
4. Don't suggest tags already on the item

Return as JSON array: ["tag1", "tag2", ...]`;

    const completion = await chatCompletion([
      {
        role: "system",
        content:
          "You are a tagging assistant. Suggest relevant, concise tags for knowledge management. Return only a JSON array.",
      },
      { role: "user", content: prompt },
    ]);

    let suggestions: string[] = [];
    try {
      suggestions = JSON.parse(completion.content);
      if (!Array.isArray(suggestions)) {
        suggestions = [];
      }
    } catch {
      // Extract tags from text
      suggestions = completion.content
        .match(/["']([^"']+)["']/g)
        ?.map((s) => s.replace(/["']/g, ""))
        .slice(0, maxSuggestions) || [];
    }

    // Filter out existing tags
    suggestions = suggestions
      .filter((tag) => !existingTags.includes(tag.toLowerCase()))
      .slice(0, maxSuggestions);

    const result = {
      suggestions,
      existing_tags: existingTags,
      from_user_vocabulary: suggestions.filter((s) =>
        topUserTags.some((t) => t.toLowerCase() === s.toLowerCase())
      ).length,
      memory_id: body.memory_id,
    };

    // Cache result
    await setCache(cacheKey, TOOL_NAME, userId, result, completion.tokensUsed, 24);

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
    console.error("Suggest tags error:", error);
    return errorResponse("Internal server error", 500);
  }
});
