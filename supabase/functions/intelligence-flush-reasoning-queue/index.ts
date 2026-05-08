/// <reference lib="deno.ns" />
/**
 * intelligence-flush-reasoning-queue — HTTP Edge Function
 * POST /functions/v1/intelligence-flush-reasoning-queue
 *
 * Force-immediate reasoning for a subject without waiting for cron threshold.
 * Authenticated. Calls shared reasoning-processor.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { getSupabaseClient, successResponse, errorResponse } from "../_shared/utils.ts";
import { isMemoryInferenceQueueEnabled } from "../_shared/memory-inference-queue";
import { processSubjectReasoningBatch } from "../_shared/reasoning-processor";

interface FlushRequest {
  subject_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 1: Authenticate
  const auth = await authenticateRequest(req);
  if ("error" in auth) {
    return errorResponse(auth.error, auth.status);
  }

  // 2: Feature flag guard
  if (!isMemoryInferenceQueueEnabled()) {
    return successResponse({ flushed: false, reason: "feature_disabled" });
  }

  // 3: Parse body
  let body: FlushRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!body.subject_id) {
    return new Response(JSON.stringify({ error: "subject_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabaseClient();

  // 4: Fetch the batch for the subject to get source_memory_ids
  const { data: batch, error: batchError } = await supabase
    .from("memory_inference_batches")
    .select("subject_id, organization_id, source_memory_ids, pending_token_count, pending_memory_count")
    .eq("subject_id", body.subject_id)
    .single() as unknown as {
      data: {
        subject_id: string;
        organization_id: string | null;
        source_memory_ids: string[];
        pending_token_count: number;
        pending_memory_count: number;
      } | null;
      error: { message?: string } | null;
    };

  if (batchError || !batch) {
    // No batch row means no pending work — flush is still a success (no-op)
    return successResponse({
      flushed: true,
      job_ids: [],
      conclusion_count: 0,
      note: "no_pending_batch",
    });
  }

  // 5: Process — shared logic from reasoning-processor
  const result = await processSubjectReasoningBatch(supabase, {
    subject_id: batch.subject_id,
    organization_id: batch.organization_id,
    source_memory_ids: batch.source_memory_ids.length > 0
      ? batch.source_memory_ids
      : [],  // empty array if nothing pending — still run to surface any pending jobs
  });

  // 6: Reset the batch
  await supabase
    .from("memory_inference_batches")
    .update({
      pending_token_count: 0,
      pending_memory_count: 0,
      source_memory_ids: [],
      last_flushed_at: new Date().toISOString(),
    })
    .eq("subject_id", body.subject_id);

  return successResponse({
    flushed: true,
    job_ids: result.job_ids,
    conclusion_count: result.conclusion_count,
  });
});