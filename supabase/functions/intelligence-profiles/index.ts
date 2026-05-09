/// <reference lib="deno.ns" />
// Intelligence API: Profiles
// Serves living memory profiles for a subject.
//
// Routes (path after /functions/v1/intelligence-profiles/):
//   GET  /<subject_id>           → return full profile
//   GET  /<subject_id>/versions  → return version history
//   POST /<subject_id>/ask       → answer a question from the profile

import {
  corsHeaders,
  authenticateRequest,
  chatCompletion,
  getSupabaseClient,
  errorResponse,
  successResponse,
} from "../_shared/utils.ts";

// ---------------------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------------------

interface ParsedPath {
  subjectId: string;
  operation: "get" | "versions" | "ask";
}

function parsePath(url: string): ParsedPath | null {
  // URL will be like: .../intelligence-profiles/<subject_id>[/versions|/ask]
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  // parts[-1] may be "versions", "ask", or a subject ID
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2] ?? "";

  if (last === "versions") {
    return { subjectId: secondLast, operation: "versions" };
  }
  if (last === "ask") {
    return { subjectId: secondLast, operation: "ask" };
  }
  // bare subject ID
  if (last) {
    return { subjectId: last, operation: "get" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleGetProfile(subjectId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("memory_profiles")
    .select("*")
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (error) {
    console.error("[intelligence-profiles] profile fetch error:", error);
    return errorResponse("Failed to fetch profile", 500);
  }
  if (!data) {
    return errorResponse("No profile found for this subject", 404);
  }
  return successResponse({ profile: data });
}

async function handleGetVersions(subjectId: string, limit: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("memory_profile_versions")
    .select("*")
    .eq("profile_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[intelligence-profiles] versions fetch error:", error);
    return errorResponse("Failed to fetch profile versions", 500);
  }
  return successResponse({ versions: data ?? [] });
}

async function handleAsk(subjectId: string, question: string) {
  const supabase = getSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("memory_profiles")
    .select("*")
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (profileError) {
    console.error("[intelligence-profiles] profile fetch error:", profileError);
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
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return errorResponse(auth.error, auth.status);
    }

    const parsed = parsePath(req.url);
    if (!parsed) {
      return errorResponse("Invalid profile path — expected /<subject_id>[/versions|/ask]", 400);
    }

    const { subjectId, operation } = parsed;

    if (!subjectId) {
      return errorResponse("subject_id is required", 400);
    }

    if (operation === "get") {
      return await handleGetProfile(subjectId);
    }

    if (operation === "versions") {
      const url = new URL(req.url);
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
      return await handleGetVersions(subjectId, limit);
    }

    if (operation === "ask") {
      if (req.method !== "POST") {
        return errorResponse("POST required for /ask", 405);
      }
      const body = await req.json().catch(() => ({})) as { question?: string };
      if (!body.question || typeof body.question !== "string") {
        return errorResponse("question is required", 400);
      }
      return await handleAsk(subjectId, body.question);
    }

    return errorResponse("Unknown operation", 400);
  } catch (error) {
    console.error("[intelligence-profiles] error:", error);
    return errorResponse("Internal server error", 500);
  }
});
