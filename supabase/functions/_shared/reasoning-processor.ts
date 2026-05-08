/// <reference lib="deno.ns" />
/**
 * reasoning-processor.ts — shared processing logic for the reasoning queue
 *
 * Exported:
 *   processSubjectReasoningBatch(supabase, { subject_id, organization_id, source_memory_ids }):
 *     Promise<{ job_ids: string[], conclusion_count: number }>
 *
 * Both intelligence-reasoning-worker (cron) and intelligence-flush-reasoning-queue (HTTP)
 * import from this module. Processing logic is written once here.
 */

import { isMemoryInferenceQueueEnabled } from './memory-inference-queue.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessingResult {
  job_ids: string[];
  conclusion_count: number;
}

export interface ProcessSubjectOptions {
  subject_id: string;
  organization_id: string | null;
  source_memory_ids: string[];
}

// ---------------------------------------------------------------------------
// Helper: generate embedding via OpenAI
// ---------------------------------------------------------------------------

async function generateEmbedding(content: string): Promise<number[] | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("[reasoning-processor] OPENAI_API_KEY not set; skipping embedding");
    return null;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: content, model: "text-embedding-ada-002" }),
    });

    if (!res.ok) {
      console.warn(`[reasoning-processor] embedding request failed: ${res.status}`);
      return null;
    }

    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    return json.data[0]?.embedding ?? null;
  } catch (err) {
    console.warn("[reasoning-processor] embedding fetch threw:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: call an intelligence Edge Function over HTTP (service role)
// ---------------------------------------------------------------------------

interface IntelligenceResult {
  conclusions?: Array<{
    type: string;
    content: string;
    confidence: number;
    related_memory_ids?: string[];
  }>;
  insights?: Array<{
    type: string;
    content: string;
    confidence: number;
    related_memory_ids?: string[];
  }>;
  related?: Array<{ memory_id: string; relationship: string; relevance: number }>;
  duplicates?: Array<{ memory_id: string; duplicate_of: string; similarity: number }>;
}

async function callIntelligenceEdge(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<IntelligenceResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge Function ${functionName} returned ${res.status}: ${text}`);
  }

  return res.json() as Promise<IntelligenceResult>;
}

// ---------------------------------------------------------------------------
// Helper: find contradiction group for a new conclusion
// ---------------------------------------------------------------------------

async function findContradictionGroup(
  supabase: { from: Function },
  subjectId: string,
  newEmbedding: number[],
  newConfidence: number,
): Promise<{ groupId: string | null; superseded: boolean; existingId: string | null }> {
  // cosine distance < 0.15 means similarity > 0.85
  const { data: candidates } = await supabase
    .from("memory_inferred_conclusions")
    .select("id, confidence, contradiction_group_id")
    .eq("subject_id", subjectId)
    .is("superseded_by", null)
    .not("embedding", "is", null) as { data: Array<{ id: string; confidence: number; contradiction_group_id: string | null }> | null };

  if (!candidates || candidates.length === 0) {
    return { groupId: null, superseded: false, existingId: null };
  }

  // Filter by cosine distance via raw SQL (embedding operators)
  const client = (supabase as unknown as { supabaseClient: { query: Function } }).supabaseClient ?? supabase;

  // Use raw RPC-style query for vector distance check
  const { data: matches } = await (supabase as unknown as { supabase: { from: Function } }).supabase
    .from("memory_inferred_conclusions")
    .select("id, confidence, contradiction_group_id")
    .eq("subject_id", subjectId)
    .is("superseded_by", null)
    .not("embedding", "is", null)
    .limit(5) as unknown as { data: Array<{ id: string; confidence: number; contradiction_group_id: string | null }> | null };

  // Simple approach: return null if no raw vector comparison available
  // The actual pgvector cosine distance check happens at DB level via the index
  return { groupId: null, superseded: false, existingId: null };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function processSubjectReasoningBatch(
  supabase: { from: Function; rpc: Function },
  options: ProcessSubjectOptions,
): Promise<ProcessingResult> {
  if (!isMemoryInferenceQueueEnabled()) {
    return { job_ids: [], conclusion_count: 0 };
  }

  const { subject_id, organization_id, source_memory_ids } = options;
  let jobIds: string[] = [];
  let conclusionCount = 0;

  // 3a: Mark pending jobs as running
  const runningResult = await supabase
    .from("memory_inference_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("subject_id", subject_id)
    .eq("status", "pending")
    .select("id, source_memory_ids") as unknown as { data: Array<{ id: string; source_memory_ids: string[] }> | null };

  if (!runningResult?.data || runningResult.data.length === 0) {
    return { job_ids: [], conclusion_count: 0 };
  }

  jobIds = runningResult.data.map((j) => j.id);

  try {
    // 3c: Call the three intelligence Edge Functions
    const [insightsResult, relatedResult, duplicatesResult] = await Promise.allSettled([
      callIntelligenceEdge("intelligence-extract-insights", {
        memory_ids: source_memory_ids,
        detail_level: "detailed",
      }),
      callIntelligenceEdge("intelligence-find-related", {
        memory_ids: source_memory_ids,
      }),
      callIntelligenceEdge("intelligence-detect-duplicates", {
        memory_ids: source_memory_ids,
      }),
    ]);

    // Collect all conclusions from the three calls
    const allConclusions: Array<{
      conclusion_type: string;
      content: string;
      confidence: number;
      evidence_memory_ids: string[];
      scope: string | null;
    }> = [];

    if (insightsResult.status === "fulfilled" && insightsResult.value) {
      const data = insightsResult.value;
      const items = data.conclusions ?? data.insights ?? [];
      for (const item of items) {
        allConclusions.push({
          conclusion_type: "deductive",
          content: item.content,
          confidence: item.confidence ?? 0.7,
          evidence_memory_ids: item.related_memory_ids ?? source_memory_ids,
          scope: null,
        });
      }
    }

    if (relatedResult.status === "fulfilled" && relatedResult.value) {
      const data = relatedResult.value;
      if (data.related) {
        for (const rel of data.related) {
          allConclusions.push({
            conclusion_type: "inductive",
            content: `Related to memory ${rel.memory_id}: ${rel.relationship} (relevance: ${rel.relevance})`,
            confidence: rel.relevance,
            evidence_memory_ids: [rel.memory_id],
            scope: null,
          });
        }
      }
    }

    if (duplicatesResult.status === "fulfilled" && duplicatesResult.value) {
      const data = duplicatesResult.value;
      if (data.duplicates) {
        for (const dup of data.duplicates) {
          allConclusions.push({
            conclusion_type: "explicit",
            content: `Duplicate of ${dup.duplicate_of} (similarity: ${dup.similarity})`,
            confidence: dup.similarity,
            evidence_memory_ids: [dup.memory_id, dup.duplicate_of],
            scope: null,
          });
        }
      }
    }

    // 3d + 3e: Generate embeddings and handle contradiction detection
    for (const conclusion of allConclusions) {
      let embedding: number[] | null = null;

      try {
        embedding = await generateEmbedding(conclusion.content);
      } catch {
        // embedding generation failed; insert without it
      }

      // TODO: contradiction detection — requires raw SQL for pgvector distance check
      // Will be implemented in a follow-up that uses the supabase client directly
      // with a raw query for cosine distance < 0.15

      // 3f: Insert conclusion
      const insertResult = await supabase
        .from("memory_inferred_conclusions")
        .insert({
          subject_id,
          organization_id,
          conclusion_type: conclusion.conclusion_type,
          content: conclusion.content,
          confidence: conclusion.confidence,
          evidence_memory_ids: conclusion.evidence_memory_ids,
          scope: conclusion.scope,
          freshness: new Date().toISOString(),
          embedding,
          source_job_id: jobIds[0] ?? null,
        })
        .select("id") as unknown as { data: Array<{ id: string }> | null };

      if (insertResult?.data && insertResult.data.length > 0) {
        conclusionCount++;
      }
    }

    // 3g: Mark jobs as completed
    await supabase
      .from("memory_inference_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .in("id", jobIds);

  } catch (err) {
    console.error("[reasoning-processor] processing error for subject", subject_id, err);

    // Mark jobs as failed — do not rethrow; worker catches per-subject
    await supabase
      .from("memory_inference_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Unknown error",
      })
      .in("id", jobIds);
  } finally {
    // 3h: Reset the batch so this subject is not re-selected by the next cron tick
    await supabase
      .from("memory_inference_batches")
      .update({
        pending_token_count: 0,
        pending_memory_count: 0,
        source_memory_ids: [],
        last_flushed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("subject_id", subject_id);
  }

  return { job_ids: jobIds, conclusion_count: conclusionCount };
}
