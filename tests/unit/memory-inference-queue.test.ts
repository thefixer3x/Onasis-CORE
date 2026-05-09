import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildMemoryInferenceJobPayload,
  enqueueMemoryInferenceJob,
  estimateMemoryTokens,
  resolveMemoryInferenceSubjectId,
  scheduleMemoryInferenceEnqueue,
} from '../../supabase/functions/_shared/memory-inference-queue.ts';

type EnvMap = Record<string, string | undefined>;

const auth = {
  user_id: '11111111-1111-4111-8111-111111111111',
  organization_id: '22222222-2222-4222-8222-222222222222',
  auth_source: 'api_key',
  api_key_id: 'key-1',
  project_scope: 'project-1',
};

const memory = {
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Phase 1 cache',
  content: 'Derived reasoning should enqueue after successful memory writes.',
  memory_type: 'project',
  topic_key: 'architecture/phase-1-cache',
  metadata: {},
  user_id: auth.user_id,
  organization_id: auth.organization_id,
};

describe('memory-inference queue helpers', () => {
  let env: EnvMap;

  beforeEach(() => {
    env = {};
    (globalThis as any).Deno = {
      env: {
        get: vi.fn((name: string) => env[name]),
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).Deno;
    delete (globalThis as any).EdgeRuntime;
    vi.restoreAllMocks();
  });

  it('keeps the queue disabled by default', async () => {
    const supabase = { rpc: vi.fn() };

    const result = await enqueueMemoryInferenceJob(supabase, {
      auth,
      memory,
      sourceEvent: 'memory.create',
    });

    expect(result).toEqual({ queued: false, reason: 'feature_disabled' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('estimates tokens from title and content', () => {
    expect(estimateMemoryTokens({ title: '', content: '' })).toBe(0);
    expect(estimateMemoryTokens({ title: 'abcd', content: '' })).toBe(1);
    expect(estimateMemoryTokens({ title: 'abcd', content: 'efghijkl' })).toBe(4);
  });

  it('defaults subject_id to the authenticated user', () => {
    expect(resolveMemoryInferenceSubjectId(auth, memory)).toBe(auth.user_id);
  });

  it('uses metadata.subject_id when a valid subject is supplied', () => {
    const subjectId = '44444444-4444-4444-8444-444444444444';

    expect(
      resolveMemoryInferenceSubjectId(auth, {
        ...memory,
        metadata: { subject_id: subjectId },
      }),
    ).toBe(subjectId);
  });

  it('builds the RPC payload without leaking memory content into metadata', () => {
    const payload = buildMemoryInferenceJobPayload(auth, memory, 'memory.update');

    expect(payload).toMatchObject({
      p_subject_id: auth.user_id,
      p_organization_id: auth.organization_id,
      p_user_id: auth.user_id,
      p_source_memory_id: memory.id,
      p_source_event: 'memory.update',
      p_pending_token_count: estimateMemoryTokens(memory),
    });
    expect(payload.p_metadata).toMatchObject({
      source: 'memory-edge-function',
      memory_type: 'project',
      topic_key: 'architecture/phase-1-cache',
      auth_source: 'api_key',
    });
    expect(JSON.stringify(payload.p_metadata)).not.toContain(memory.content);
  });

  it('enqueues through the migration RPC when enabled', async () => {
    env.FEATURE_MEMORY_REASONING_QUEUE = 'true';
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: '55555555-5555-4555-8555-555555555555',
        error: null,
      }),
    };

    const result = await enqueueMemoryInferenceJob(supabase, {
      auth,
      memory,
      sourceEvent: 'memory.create',
    });

    expect(result).toEqual({
      queued: true,
      job_id: '55555555-5555-4555-8555-555555555555',
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'enqueue_memory_inference_job',
      expect.objectContaining({
        p_source_memory_id: memory.id,
        p_source_event: 'memory.create',
      }),
    );
  });

  it('swallows RPC failures so write responses are not blocked', async () => {
    env.FEATURE_MEMORY_REASONING_QUEUE = 'true';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'queue unavailable' },
      }),
    };

    const result = await enqueueMemoryInferenceJob(supabase, {
      auth,
      memory,
      sourceEvent: 'memory.create',
    });

    expect(result).toEqual({ queued: false, reason: 'queue unavailable' });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('hands the enqueue task to EdgeRuntime.waitUntil when available', async () => {
    env.FEATURE_MEMORY_REASONING_QUEUE = 'true';
    const waitUntil = vi.fn();
    (globalThis as any).EdgeRuntime = { waitUntil };
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: '55555555-5555-4555-8555-555555555555',
        error: null,
      }),
    };

    scheduleMemoryInferenceEnqueue(supabase, {
      auth,
      memory,
      sourceEvent: 'memory.create',
    });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
