/// <reference lib="deno.ns" />
// Intelligence API: Prediction Feedback
// Records feedback on predictive recall suggestions for future tuning
// POST /intelligence/prediction-feedback

import {
  authenticateRequest,
  corsHeaders,
  errorResponse,
  getSupabaseClient,
  successResponse,
} from "../_shared/utils.ts";

interface PredictionFeedbackRequest {
  memory_id?: string;
  memoryId?: string;
  user_id?: string;
  userId?: string;
  useful?: boolean;
  action?: "clicked" | "saved" | "dismissed" | "ignored";
  dismiss_reason?: "not_relevant" | "already_know" | "not_now" | "other";
  dismissReason?: "not_relevant" | "already_know" | "not_now" | "other";
  prediction_confidence?: number;
  predictionConfidence?: number;
  prediction_reason?: string;
  predictionReason?: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function bumpMemoryAccessCount(
  memoryId: string,
  userId: string,
  organizationId: string,
) {
  const supabase = getSupabaseClient();

  const { data: memory, error: lookupError } = await supabase
    .from("memory_entries")
    .select("id, access_count")
    .eq("id", memoryId)
    .or(`user_id.eq.${userId},organization_id.eq.${organizationId}`)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError || !memory) {
    console.warn(
      "[prediction-feedback] Unable to locate memory for access increment:",
      lookupError?.message,
    );
    return;
  }

  const nextAccessCount =
    (typeof memory.access_count === "number" ? memory.access_count : 0) + 1;
  const { error: updateError } = await supabase
    .from("memory_entries")
    .update({
      access_count: nextAccessCount,
      last_accessed: new Date().toISOString(),
    })
    .eq("id", memoryId);

  if (updateError) {
    console.warn(
      "[prediction-feedback] Failed to increment memory access count:",
      updateError.message,
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return errorResponse(auth.error, auth.status);
    }

    const body: PredictionFeedbackRequest = await req.json().catch(() => ({}));
    const memoryId = readString(body.memoryId) || readString(body.memory_id);
    const userId = readString(body.userId) || readString(body.user_id) ||
      auth.userId;
    const action = body.action;

    if (!memoryId) {
      return errorResponse("memoryId is required");
    }

    if (userId !== auth.userId) {
      return errorResponse(
        "Cross-user prediction feedback is not allowed",
        403,
      );
    }

    if (typeof body.useful !== "boolean") {
      return errorResponse("useful is required");
    }

    if (
      !action || !["clicked", "saved", "dismissed", "ignored"].includes(action)
    ) {
      return errorResponse(
        "action must be one of clicked, saved, dismissed, or ignored",
      );
    }

    const dismissReason = body.dismissReason || body.dismiss_reason;
    const predictionConfidence = body.predictionConfidence ??
      body.prediction_confidence;
    const predictionReason = body.predictionReason || body.prediction_reason;

    const supabase = getSupabaseClient();
    const feedbackPayload = {
      useful: body.useful,
      action,
      dismiss_reason: dismissReason || null,
      prediction_confidence: typeof predictionConfidence === "number"
        ? predictionConfidence
        : null,
      prediction_reason: predictionReason || null,
      recorded_at: new Date().toISOString(),
    };

    const { data: recentSuggestions, error: fetchError } = await supabase
      .from("predictive_memory_suggestions")
      .select("id, suggested_memory, based_on_patterns")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (fetchError) {
      console.warn(
        "[prediction-feedback] Failed to fetch prior suggestions:",
        fetchError.message,
      );
    }

    const matchedSuggestion = (recentSuggestions || []).find((suggestion) => {
      const suggestedMemory = suggestion.suggested_memory as
        | Record<string, unknown>
        | null;
      return suggestedMemory?.id === memoryId;
    });

    let storedSuggestionId: string | null = null;

    if (matchedSuggestion) {
      const existingPatterns = matchedSuggestion.based_on_patterns &&
          typeof matchedSuggestion.based_on_patterns === "object"
        ? matchedSuggestion.based_on_patterns as Record<string, unknown>
        : {};

      const { error: updateError } = await supabase
        .from("predictive_memory_suggestions")
        .update({
          accepted: body.useful,
          feedback_at: feedbackPayload.recorded_at,
          based_on_patterns: {
            ...existingPatterns,
            feedback: feedbackPayload,
          },
        })
        .eq("id", matchedSuggestion.id);

      if (updateError) {
        return errorResponse(
          `Failed to store prediction feedback: ${updateError.message}`,
          500,
        );
      }

      storedSuggestionId = matchedSuggestion.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("predictive_memory_suggestions")
        .insert({
          user_id: userId,
          suggested_memory: {
            id: memoryId,
            source: "feedback_only",
          },
          prediction_confidence: typeof predictionConfidence === "number"
            ? predictionConfidence
            : null,
          prediction_reason: predictionReason || "feedback_only",
          context_memories: [memoryId],
          based_on_patterns: {
            source: "prediction-feedback",
            feedback: feedbackPayload,
          },
          accepted: body.useful,
          feedback_at: feedbackPayload.recorded_at,
        })
        .select("id")
        .single();

      if (insertError) {
        return errorResponse(
          `Failed to create feedback record: ${insertError.message}`,
          500,
        );
      }

      storedSuggestionId = inserted?.id || null;
    }

    if (action === "clicked" || action === "saved") {
      await bumpMemoryAccessCount(memoryId, userId, auth.organizationId);
    }

    return successResponse({
      recorded: true,
      memory_id: memoryId,
      action,
      useful: body.useful,
      stored_suggestion_id: storedSuggestionId,
      feedback_at: feedbackPayload.recorded_at,
    });
  } catch (error) {
    console.error("Prediction feedback error:", error);
    return errorResponse("Internal server error", 500);
  }
});
