/// <reference lib="deno.ns" />
// Intelligence API: Ask Profile
// Synthesise an answer to a natural-language question from a subject's living profile.
// POST /functions/v1/intelligence-ask-profile

import {
  corsHeaders,
  authenticateRequest,
  chatCompletion,
  getSupabaseClient,
  errorResponse,
  successResponse,
} from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return errorResponse(auth.error, auth.status);
    }

    const body = await req.json().catch(() => ({})) as {
      subject_id?: string;
      question?: string;
    };

    if (!body.subject_id || typeof body.subject_id !== "string") {
      return errorResponse("subject_id is required", 400);
    }
    if (!body.question || typeof body.question !== "string") {
      return errorResponse("question is required", 400);
    }

    const { subject_id, question } = body;

    const supabase = getSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .from("memory_profiles")
      .select("*")
      .eq("subject_id", subject_id)
      .maybeSingle();

    if (profileError) {
      console.error("[intelligence-ask-profile] profile fetch error:", profileError);
      return errorResponse("Failed to fetch profile", 500);
    }

    if (!profile) {
      return errorResponse("No profile found for this subject", 404);
    }

    const fields = profile.structured_fields as {
      preferences: string[];
      goals: string[];
      constraints: string[];
      tendencies: string[];
      facts: string[];
    };

    const sections = [
      fields.facts?.length > 0
        ? `Known facts:\n${fields.facts.map((f: string) => `- ${f}`).join("\n")}`
        : null,
      fields.preferences?.length > 0
        ? `Preferences:\n${fields.preferences.map((p: string) => `- ${p}`).join("\n")}`
        : null,
      fields.goals?.length > 0
        ? `Goals:\n${fields.goals.map((g: string) => `- ${g}`).join("\n")}`
        : null,
      fields.constraints?.length > 0
        ? `Constraints:\n${fields.constraints.map((c: string) => `- ${c}`).join("\n")}`
        : null,
      fields.tendencies?.length > 0
        ? `Tendencies:\n${fields.tendencies.map((t: string) => `- ${t}`).join("\n")}`
        : null,
    ].filter(Boolean).join("\n\n");

    const summarySection = profile.profile_summary
      ? `Profile Summary:\n${profile.profile_summary}\n\n`
      : "";

    const prompt = `You are answering a question about a person based solely on their stored memory profile.

${summarySection}${sections}

Question: ${question}

Answer concisely and accurately using only the profile information above. If the profile does not contain enough information, say so clearly.`;

    const completion = await chatCompletion(
      [{ role: "user", content: prompt }],
      "gpt-4o-mini",
    );

    const confidenceValues = Object.values(
      (profile.confidence_by_field as Record<string, number>) ?? {},
    );
    const confidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum: number, v: number) => sum + v, 0) / confidenceValues.length
        : 0;

    return successResponse({
      answer: completion.content,
      sources: ["profile_summary", "structured_fields"],
      confidence: Math.round(confidence * 10000) / 10000,
    });
  } catch (error) {
    console.error("[intelligence-ask-profile] error:", error);
    return errorResponse("Internal server error", 500);
  }
});
