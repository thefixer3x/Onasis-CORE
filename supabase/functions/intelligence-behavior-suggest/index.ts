// Intelligence API: Behavior Suggest
// AI-powered suggestions for next actions based on learned behavior patterns
// POST /intelligence/behavior-suggest

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
  generateEmbedding,
  cosineSimilarity,
  getSupabaseClient,
  errorResponse,
  successResponse,
  premiumRequiredResponse,
} from "../_shared/utils.ts";

const TOOL_NAME = "behavior_suggest";

interface BehaviorSuggestRequest {
  current_state: {
    task_description: string;
    completed_steps: string[];
    current_files?: string[];
  };
  max_suggestions?: number;
  user_id?: string;
}

interface Suggestion {
  action: string;
  tool: string;
  reasoning: string;
  confidence: number;
  based_on_pattern?: string;
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

    const body: BehaviorSuggestRequest = await req.json().catch(() => ({} as BehaviorSuggestRequest));

    if (!body.current_state?.task_description) {
      return errorResponse("current_state.task_description is required");
    }
    if (!Array.isArray(body.current_state?.completed_steps)) {
      return errorResponse("current_state.completed_steps array is required");
    }

    const maxSuggestions = Math.min(Math.max(body.max_suggestions || 3, 1), 5);

    // Check cache
    const cacheKey = generateCacheKey(userId, TOOL_NAME, {
      task: body.current_state.task_description.slice(0, 100),
      steps: body.current_state.completed_steps.length,
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

    // Find similar patterns using embedding search
    let relevantPatterns: Array<{
      trigger: string;
      actions: unknown[];
      final_outcome: string;
      confidence: number;
      use_count: number;
      similarity: number;
    }> = [];

    try {
      const embResult = await generateEmbedding(body.current_state.task_description);
      const queryEmbedding = embResult.embedding;

      // Fetch user's successful patterns
      const { data: patterns } = await supabase
        .from("behavior_patterns")
        .select("trigger, trigger_embedding, voyage_trigger_embedding, actions, final_outcome, confidence, use_count")
        .eq("user_id", userId)
        .in("final_outcome", ["success", "partial"]);

      if (patterns && patterns.length > 0) {
        for (const pattern of patterns) {
          const patternEmbedding = embResult.provider === 'voyage'
            ? pattern.voyage_trigger_embedding
            : pattern.trigger_embedding;

          if (patternEmbedding) {
            const embArray = typeof patternEmbedding === 'string'
              ? JSON.parse(patternEmbedding)
              : patternEmbedding;

            if (Array.isArray(embArray) && embArray.length === queryEmbedding.length) {
              const similarity = cosineSimilarity(queryEmbedding, embArray);
              if (similarity >= 0.5) {
                relevantPatterns.push({
                  trigger: pattern.trigger,
                  actions: pattern.actions,
                  final_outcome: pattern.final_outcome,
                  confidence: pattern.confidence,
                  use_count: pattern.use_count,
                  similarity,
                });
              }
            }
          }
        }

        relevantPatterns.sort((a, b) => b.similarity - a.similarity);
        relevantPatterns = relevantPatterns.slice(0, 5);
      }
    } catch (err) {
      console.warn("Embedding search for patterns failed:", err);
    }

    // Build AI prompt with pattern context
    const completedStepsStr = body.current_state.completed_steps.length > 0
      ? body.current_state.completed_steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "None yet";

    const currentFilesStr = body.current_state.current_files?.join(", ") || "None specified";

    let patternContext = "";
    if (relevantPatterns.length > 0) {
      patternContext = "\n\nRelevant past workflow patterns:\n" +
        relevantPatterns.map((p, i) => {
          const actions = Array.isArray(p.actions)
            ? p.actions.map((a: any) => `  - ${a.tool}: ${a.outcome}`).join("\n")
            : "  (no action details)";
          return `Pattern ${i + 1} (similarity: ${(p.similarity * 100).toFixed(0)}%, used ${p.use_count}x):
  Trigger: ${p.trigger}
  Actions:\n${actions}
  Outcome: ${p.final_outcome}`;
        }).join("\n\n");
    }

    const prompt = `Based on the current task state and any relevant past patterns, suggest the next ${maxSuggestions} actions.

Current task: ${body.current_state.task_description}

Completed steps:
${completedStepsStr}

Current files: ${currentFilesStr}
${patternContext}

Return as JSON array of objects with these fields:
- "action": short description of what to do next
- "tool": the tool/command to use (e.g., "Read", "Edit", "Bash", "Grep")
- "reasoning": why this step is recommended
- "confidence": 0-1 how confident you are this is the right next step

Example: [{"action": "Read the test file", "tool": "Read", "reasoning": "Need to understand test expectations before making changes", "confidence": 0.9}]`;

    const completion = await chatCompletion([
      {
        role: "system",
        content: "You are a workflow assistant that suggests next steps for software engineering tasks. Return only valid JSON arrays. Base suggestions on the completed steps and any relevant past patterns provided.",
      },
      { role: "user", content: prompt },
    ]);

    let suggestions: Suggestion[] = [];
    try {
      const parsed = JSON.parse(completion.content);
      if (Array.isArray(parsed)) {
        suggestions = parsed.slice(0, maxSuggestions).map((s: any) => ({
          action: s.action || "Unknown action",
          tool: s.tool || "Unknown",
          reasoning: s.reasoning || "",
          confidence: Math.max(0, Math.min(1, s.confidence ?? 0.5)),
          based_on_pattern: undefined,
        }));
      }
    } catch {
      // Fallback: try to extract suggestions from text
      suggestions = [{
        action: completion.content.slice(0, 200),
        tool: "Unknown",
        reasoning: "Could not parse structured suggestions",
        confidence: 0.3,
      }];
    }

    // Tag suggestions that are based on known patterns
    if (relevantPatterns.length > 0) {
      for (const suggestion of suggestions) {
        for (const pattern of relevantPatterns) {
          if (pattern.similarity > 0.7) {
            suggestion.based_on_pattern = pattern.trigger.slice(0, 100);
            break;
          }
        }
      }
    }

    const result = {
      suggestions,
      patterns_used: relevantPatterns.length,
      current_step: body.current_state.completed_steps.length + 1,
      task_description: body.current_state.task_description,
    };

    // Cache result (short TTL - 1 hour)
    await setCache(cacheKey, TOOL_NAME, userId, result, completion.tokensUsed, 1);

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
    console.error("Behavior suggest error:", error);
    return errorResponse("Internal server error", 500);
  }
});
