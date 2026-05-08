/// <reference lib="deno.ns" />

export type MemoryInferenceSourceEvent = "memory.create" | "memory.update";

type SupabaseRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data?: unknown;
    error?: { message?: string } | null;
  }>;
};

export interface MemoryInferenceAuthContext {
  user_id: string;
  organization_id: string;
  auth_source?: string;
  api_key_id?: string;
  project_scope?: string;
}

export interface MemoryInferenceSourceMemory {
  id?: string;
  title?: string;
  content?: string;
  memory_type?: string;
  topic_key?: string | null;
  metadata?: Record<string, unknown> | null;
  user_id?: string;
  organization_id?: string;
}

export interface MemoryInferenceQueueResult {
  queued: boolean;
  job_id?: string;
  reason?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function envFlag(name: string): boolean {
  const value = Deno.env.get(name)?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function asUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function compactMetadata(
  auth: MemoryInferenceAuthContext,
  memory: MemoryInferenceSourceMemory,
  sourceEvent: MemoryInferenceSourceEvent,
) {
  return {
    source: "memory-edge-function",
    source_event: sourceEvent,
    memory_type: memory.memory_type || null,
    topic_key: memory.topic_key || null,
    auth_source: auth.auth_source || null,
    api_key_id: auth.api_key_id || null,
    project_scope: auth.project_scope || null,
  };
}

export function isMemoryInferenceQueueEnabled(): boolean {
  return envFlag("FEATURE_MEMORY_REASONING_QUEUE");
}

export function estimateMemoryTokens(memory: MemoryInferenceSourceMemory): number {
  const text = [memory.title, memory.content]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");

  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function resolveMemoryInferenceSubjectId(
  auth: MemoryInferenceAuthContext,
  memory: MemoryInferenceSourceMemory,
): string {
  const metadata = memory.metadata && typeof memory.metadata === "object"
    ? memory.metadata
    : {};
  return asUuid(metadata.subject_id) || auth.user_id;
}

export function buildMemoryInferenceJobPayload(
  auth: MemoryInferenceAuthContext,
  memory: MemoryInferenceSourceMemory,
  sourceEvent: MemoryInferenceSourceEvent,
) {
  return {
    p_subject_id: resolveMemoryInferenceSubjectId(auth, memory),
    p_organization_id: memory.organization_id || auth.organization_id || null,
    p_user_id: memory.user_id || auth.user_id || null,
    p_source_memory_id: memory.id || null,
    p_source_event: sourceEvent,
    p_pending_token_count: estimateMemoryTokens(memory),
    p_metadata: compactMetadata(auth, memory, sourceEvent),
  };
}

export async function enqueueMemoryInferenceJob(
  supabase: SupabaseRpcClient,
  options: {
    auth: MemoryInferenceAuthContext;
    memory: MemoryInferenceSourceMemory;
    sourceEvent: MemoryInferenceSourceEvent;
  },
): Promise<MemoryInferenceQueueResult> {
  if (!isMemoryInferenceQueueEnabled()) {
    return { queued: false, reason: "feature_disabled" };
  }

  if (!options.memory.id) {
    return { queued: false, reason: "missing_memory_id" };
  }

  try {
    const payload = buildMemoryInferenceJobPayload(
      options.auth,
      options.memory,
      options.sourceEvent,
    );
    const { data, error } = await supabase.rpc(
      "enqueue_memory_inference_job",
      payload,
    );

    if (error) {
      console.warn("[memory-inference] enqueue failed:", error.message || error);
      return { queued: false, reason: error.message || "rpc_error" };
    }

    return {
      queued: true,
      job_id: typeof data === "string" ? data : undefined,
    };
  } catch (error) {
    console.warn("[memory-inference] enqueue threw:", error);
    return {
      queued: false,
      reason: error instanceof Error ? error.message : "unknown_error",
    };
  }
}

export function scheduleMemoryInferenceEnqueue(
  supabase: SupabaseRpcClient,
  options: {
    auth: MemoryInferenceAuthContext;
    memory: MemoryInferenceSourceMemory;
    sourceEvent: MemoryInferenceSourceEvent;
  },
): void {
  const task = enqueueMemoryInferenceJob(supabase, options);
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;

  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(task);
    return;
  }

  void task;
}
