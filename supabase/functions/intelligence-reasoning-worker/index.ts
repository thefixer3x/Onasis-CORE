/// <reference lib="deno.ns" />
/**
 * intelligence-reasoning-worker — cron Edge Function
 * Fires every 5 minutes via Deno.cron
 *
 * Acquires batches above token threshold, calls intelligence Edge Functions,
 * persists conclusions to memory_inferred_conclusions, resets batch.
 *
 * NO inbound HTTP handler — cron-only.
 */

import { getSupabaseClient } from "../_shared/utils.ts";
import { isMemoryInferenceQueueEnabled } from "../_shared/memory-inference-queue";
import { processSubjectReasoningBatch } from "../_shared/reasoning-processor";

// ---------------------------------------------------------------------------
// Cron schedule — module top level, required for Deno.cron
// ---------------------------------------------------------------------------

Deno.cron("intelligence-reasoning-worker", "*/5 * * * *", runReasoningWorker);

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

async function runReasoningWorker() {
  if (!isMemoryInferenceQueueEnabled()) {
    return; // no-op, not an error
  }

  const supabase = getSupabaseClient();

  // 2: Acquire up to 10 batches with row lock (SKIP LOCKED prevents double-processing)
  const { data: batches, error: batchError } = await supabase
    .rpc("get_ready_reasoning_batches", { p_limit: 10 }) as unknown as {
      data: Array<{
        subject_id: string;
        organization_id: string | null;
        source_memory_ids: string[];
        pending_token_count: number;
        pending_memory_count: number;
        last_job_id: string | null;
      }> | null;
      error: { message?: string } | null;
    };

  if (batchError || !batches || batches.length === 0) {
    if (batchError) {
      console.error("[reasoning-worker] batch acquisition error:", batchError.message);
    }
    return;
  }

  // Process each subject; one failure must not abort others
  for (const batch of batches) {
    try {
      const result = await processSubjectReasoningBatch(supabase, {
        subject_id: batch.subject_id,
        organization_id: batch.organization_id,
        source_memory_ids: batch.source_memory_ids,
      });

      // Reset the batch after successful processing
      await supabase
        .from("memory_inference_batches")
        .update({
          pending_token_count: 0,
          pending_memory_count: 0,
          source_memory_ids: [],
          last_flushed_at: new Date().toISOString(),
        })
        .eq("subject_id", batch.subject_id);

      console.log(
        `[reasoning-worker] processed subject=${batch.subject_id} ` +
          `jobs=${result.job_ids.length} conclusions=${result.conclusion_count}`,
      );
    } catch (err) {
      console.error(
        `[reasoning-worker] failed for subject=${batch.subject_id}:`,
        err instanceof Error ? err.message : String(err),
      );
      // Continue to next batch — do not abort
    }
  }
}