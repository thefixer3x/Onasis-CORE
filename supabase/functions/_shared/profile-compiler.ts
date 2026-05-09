/// <reference lib="deno.ns" />
/**
 * profile-compiler.ts — Phase 2 Living Memory Profile
 *
 * Compiles a per-subject living profile from a batch of inferred conclusions.
 * Called at the end of processSubjectReasoningBatch() after all conclusions
 * are inserted. Failure is intentionally non-fatal.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConclusionInput {
  id: string;
  conclusion_type: string;
  content: string;
  confidence: number;
  scope: string | null;
  evidence_memory_ids: string[];
}

interface StructuredFields {
  preferences: string[];
  goals: string[];
  constraints: string[];
  tendencies: string[];
  facts: string[];
}

export interface CompileProfileOptions {
  subject_id: string;
  organization_id: string | null;
  source_job_id: string;
  conclusions: ConclusionInput[];
}

// ---------------------------------------------------------------------------
// Helper: call intelligence-extract-insights EF for profile summary
// ---------------------------------------------------------------------------

async function callExtractInsights(memoryIds: string[]): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    throw new Error("[profile-compiler] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/intelligence-extract-insights`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      memory_ids: memoryIds,
      detail_level: "brief",
      prefer_cache: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[profile-compiler] intelligence-extract-insights returned ${res.status}: ${text}`);
  }

  const response = await res.json() as {
    data?: {
      conclusions?: Array<{ content: string }>;
      insights?: Array<{ content: string }>;
    };
    conclusions?: Array<{ content: string }>;
    insights?: Array<{ content: string }>;
  };

  const payload = response.data ?? response;
  const content =
    payload.conclusions?.[0]?.content ??
    payload.insights?.[0]?.content ??
    "";

  // 500 token proxy = 2000 chars
  return content.slice(0, 2000);
}

// ---------------------------------------------------------------------------
// Helper: bucket one conclusion into the correct field key
// ---------------------------------------------------------------------------

function bucketConclusion(conclusion: ConclusionInput): keyof StructuredFields {
  const { conclusion_type, scope } = conclusion;

  if (conclusion_type === "explicit") {
    if (scope === "preference") return "preferences";
    if (scope === "goal") return "goals";
    if (scope === "constraint") return "constraints";
    return "facts";
  }
  if (conclusion_type === "inductive" || conclusion_type === "abductive") {
    return "tendencies";
  }
  return "facts"; // deductive + fallback
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function compileProfileFromConclusions(
  supabase: { from: Function; rpc: Function },
  opts: CompileProfileOptions,
): Promise<void> {
  const { subject_id, organization_id, source_job_id, conclusions } = opts;

  if (conclusions.length === 0) {
    return;
  }

  // Step 1: Load existing profile (optional — may not exist yet)
  const empty: StructuredFields = {
    preferences: [],
    goals: [],
    constraints: [],
    tendencies: [],
    facts: [],
  };

  const { data: existingProfile } = await (supabase as any)
    .from("memory_profiles")
    .select("structured_fields")
    .eq("subject_id", subject_id)
    .maybeSingle() as { data: { structured_fields: StructuredFields } | null };

  const existing: StructuredFields = existingProfile?.structured_fields ?? empty;

  // Step 2: Bucket new conclusions into merged field arrays
  const merged: StructuredFields = {
    preferences: [...existing.preferences],
    goals: [...existing.goals],
    constraints: [...existing.constraints],
    tendencies: [...existing.tendencies],
    facts: [...existing.facts],
  };

  const fieldConfidences = new Map<keyof StructuredFields, number[]>();

  for (const c of conclusions) {
    const field = bucketConclusion(c);

    if (!merged[field].includes(c.content)) {
      merged[field].push(c.content);
    }

    if (!fieldConfidences.has(field)) {
      fieldConfidences.set(field, []);
    }
    fieldConfidences.get(field)!.push(c.confidence);
  }

  // Step 3: Generate profile_summary via intelligence EF
  const evidenceIds = [...new Set(conclusions.flatMap((c) => c.evidence_memory_ids))];

  let profileSummary: string | null = null;
  try {
    const summary = await callExtractInsights(evidenceIds.length > 0 ? evidenceIds : conclusions.map((c) => c.id));
    profileSummary = summary || null;
  } catch (err) {
    console.warn("[profile-compiler] summary generation failed (non-fatal):", err);
  }

  // Step 4: Compute confidence_by_field averages
  const confidenceByField: Record<string, number> = {};
  for (const [field, confidences] of fieldConfidences.entries()) {
    if (confidences.length > 0) {
      const avg = confidences.reduce((sum, v) => sum + v, 0) / confidences.length;
      confidenceByField[field] = Math.round(avg * 10000) / 10000;
    }
  }

  // Step 5: Persist atomically via RPC — never write directly to tables
  const { error } = await (supabase as any).rpc("upsert_memory_profile", {
    p_subject_id: subject_id,
    p_organization_id: organization_id,
    p_profile_summary: profileSummary,
    p_structured_fields: merged,
    p_confidence_by_field: confidenceByField,
    p_source_job_id: source_job_id || null,
  });

  if (error) {
    throw new Error(`[profile-compiler] upsert_memory_profile RPC failed: ${error.message}`);
  }
}
