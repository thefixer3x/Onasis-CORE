// Intelligence API: Behavior Record
// Records a successful workflow pattern for future recall
// POST /intelligence/behavior-record

import {
  corsHeaders,
  authenticateRequest,
  checkIntelligenceAccess,
  getUserTierInfo,
  logUsage,
  generateEmbedding,
  getSupabaseClient,
  errorResponse,
  successResponse,
  premiumRequiredResponse,
} from "../_shared/utils.ts";

const TOOL_NAME = "behavior_record";

interface BehaviorRecordRequest {
  trigger: string;
  context: {
    directory: string;
    project_type?: string;
    branch?: string;
    files_touched?: string[];
  };
  actions: Array<{
    tool: string;
    parameters: Record<string, unknown>;
    outcome: "success" | "partial" | "failed";
    timestamp: string;
    duration_ms?: number;
  }>;
  final_outcome: "success" | "partial" | "failed";
  confidence?: number;
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

    const body: BehaviorRecordRequest = await req.json().catch(() => ({} as BehaviorRecordRequest));

    // Validate required fields
    if (!body.trigger || body.trigger.length < 10) {
      return errorResponse("trigger is required and must be at least 10 characters");
    }
    if (!body.context?.directory) {
      return errorResponse("context.directory is required");
    }
    if (!Array.isArray(body.actions) || body.actions.length === 0) {
      return errorResponse("actions array is required and must not be empty");
    }
    if (!["success", "partial", "failed"].includes(body.final_outcome)) {
      return errorResponse("final_outcome must be 'success', 'partial', or 'failed'");
    }

    const supabase = getSupabaseClient();

    // Generate embedding for the trigger text (for future similarity search)
    let embeddingResult;
    let embeddingCost = 0;
    let tokensUsed = 0;

    try {
      embeddingResult = await generateEmbedding(body.trigger);
      embeddingCost = embeddingResult.cost;
      tokensUsed = Math.ceil(embeddingCost / 0.00000002); // approximate
    } catch (err) {
      console.warn("Failed to generate embedding for trigger:", err);
      // Continue without embedding - pattern can still be stored
    }

    // Determine which embedding column to use based on provider
    const embeddingColumn = embeddingResult?.provider === 'voyage'
      ? 'voyage_trigger_embedding'
      : 'trigger_embedding';

    const confidence = Math.max(0, Math.min(1, body.confidence ?? 0.7));

    const patternData: Record<string, unknown> = {
      user_id: userId,
      trigger: body.trigger.trim(),
      context: body.context,
      actions: body.actions,
      final_outcome: body.final_outcome,
      confidence,
      use_count: 1,
      last_used_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (embeddingResult) {
      patternData[embeddingColumn] = JSON.stringify(embeddingResult.embedding);
    }

    const { data: pattern, error: insertError } = await supabase
      .from("behavior_patterns")
      .insert(patternData)
      .select("id, trigger, context, actions, final_outcome, confidence, use_count, created_at")
      .single();

    if (insertError) {
      console.error("Failed to insert behavior pattern:", insertError);
      return errorResponse("Failed to record behavior pattern: " + insertError.message, 500);
    }

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
        pattern_id: pattern.id,
        trigger: pattern.trigger,
        final_outcome: pattern.final_outcome,
        confidence: pattern.confidence,
        actions_count: body.actions.length,
        embedding_generated: !!embeddingResult,
        embedding_provider: embeddingResult?.provider || null,
      },
      { tokens_used: tokensUsed, cost_usd: embeddingCost, cached: false },
      { tier: tierInfo?.tier_name || "free", usage_remaining: (access.usage_remaining || 1) - 1 }
    );
  } catch (error) {
    console.error("Behavior record error:", error);
    return errorResponse("Internal server error", 500);
  }
});
