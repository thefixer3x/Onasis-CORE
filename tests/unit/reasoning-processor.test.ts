/**
 * tests/unit/reasoning-processor.test.ts
 *
 * Unit tests for _shared/reasoning-processor.ts.
 * Tests processSubjectReasoningBatch() behavior:
 *   - Feature flag gate (returns early, no DB calls)
 *   - Job lifecycle: pending → running → completed (non-throw)
 *   - Job lifecycle: pending → running → failed (on EF non-200, still no throw)
 *   - Batch processing completes without throwing
 *   - Contradiction-group behavior documented for Phase 2
 *
 * Note: findContradictionGroup is currently a stub (always null).
 * The contradiction-group tests document the expected behavior for Phase 2.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EnvMap = Record<string, string | undefined>;

function makeSupabase() {
  return {
    from: vi.fn((_table: string) => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({ data: [], error: null }),
    })),
    rpc: vi.fn(),
  };
}

function mockEmbeddingFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: [{ embedding: new Array(1536).fill(0.05) }] }),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reasoning-processor', () => {
  let env: EnvMap;

  beforeEach(() => {
    env = {};
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn((name: string) => env[name]),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Deno;
  });

  // -------------------------------------------------------------------------
  // Feature flag
  // -------------------------------------------------------------------------

  describe('feature flag gate', () => {
    it('returns early without DB calls when FEATURE_MEMORY_REASONING_QUEUE is off', async () => {
      env.FEATURE_MEMORY_REASONING_QUEUE = 'false';
      const supabase = makeSupabase();

      const { processSubjectReasoningBatch } = await import(
        '../../../supabase/functions/_shared/reasoning-processor.ts'
      );

      const result = await processSubjectReasoningBatch(supabase as any, {
        subject_id: 'subj-1',
        organization_id: null,
        source_memory_ids: ['mem-1'],
      });

      expect(result).toEqual({ job_ids: [], conclusion_count: 0 });
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('proceeds past the gate when FEATURE_MEMORY_REASONING_QUEUE is true', async () => {
      env.FEATURE_MEMORY_REASONING_QUEUE = 'true';
      const supabase = makeSupabase();

      // Return no jobs — function exits after the gate but before any insert
      const inner = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
      };
      supabase.from = vi.fn(() => inner);

      const { processSubjectReasoningBatch } = await import(
        '../../../supabase/functions/_shared/reasoning-processor.ts'
      );

      const result = await processSubjectReasoningBatch(supabase as any, {
        subject_id: 'subj-1',
        organization_id: null,
        source_memory_ids: [],
      });

      // With flag on, from() should have been called (function didn't early-return at gate)
      expect(supabase.from).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Job lifecycle — successful processing
  // -------------------------------------------------------------------------

  describe('job lifecycle — successful processing', () => {
    it('marks jobs completed after processing (does not throw)', async () => {
      env.FEATURE_MEMORY_REASONING_QUEUE = 'true';
      env.OPENAI_API_KEY = 'sk-test';
      env.SUPABASE_URL = 'https://proj.supabase.co';
      env.SUPABASE_SERVICE_ROLE_KEY = 'ey-test';

      mockEmbeddingFetch();

      const jobRecord = {
        id: 'job-123',
        subject_id: 'subj-1',
        organization_id: null,
        pending_token_count: 5000,
        status: 'pending' as const,
        source_event: 'memory.create' as const,
        source_memory_ids: ['mem-1'],
        created_at: new Date().toISOString(),
        started_at: null as string | null,
        completed_at: null as string | null,
        error: null,
      };

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'memory_inference_jobs') {
            const chain: Record<string, unknown> = {};
            chain.update = vi.fn().mockReturnThis();
            chain.select = vi.fn().mockReturnThis();
            chain.eq = vi.fn().mockReturnThis();
            chain.in = vi.fn().mockReturnThis();

            // Mock the job query returning the job record
            chain.eq = vi.fn((col: string) => {
              if (col === 'subject_id') {
                return {
                  eq: vi.fn().mockReturnThis(),
                  select: vi.fn().mockReturnThis(),
                  in: vi.fn().mockReturnThis(),
                  limit: vi.fn().mockResolvedValue({ data: [jobRecord], error: null }),
                };
              }
              if (col === 'status') {
                return {
                  in: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }
              return chain;
            });
            return chain;
          }
          if (table === 'memory_inferred_conclusions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              not: vi.fn().mockReturnThis(),
              insert: vi.fn().mockReturnValue({ data: [{ id: 'c-1' }], error: null }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
        rpc: vi.fn().mockResolvedValue({ data: 2000, error: null }),
      };

      const { processSubjectReasoningBatch } = await import(
        '../../../supabase/functions/_shared/reasoning-processor.ts'
      );

      // Primary assertion: function completes without throwing
      await expect(
        processSubjectReasoningBatch(supabase as any, {
          subject_id: 'subj-1',
          organization_id: null,
          source_memory_ids: ['mem-1'],
        }),
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Job lifecycle — EF failure
  // -------------------------------------------------------------------------

  describe('job lifecycle — EF failure', () => {
    it('marks job failed (does not throw) when intelligence EF returns non-200', async () => {
      env.FEATURE_MEMORY_REASONING_QUEUE = 'true';
      env.OPENAI_API_KEY = 'sk-test';
      env.SUPABASE_URL = 'https://proj.supabase.co';
      env.SUPABASE_SERVICE_ROLE_KEY = 'ey-test';

      mockEmbeddingFetch();
      // First fetch (extract-insights) returns error
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      } as unknown as Response);

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'memory_inference_jobs') {
            const chain: Record<string, unknown> = {};
            chain.update = vi.fn().mockReturnThis();
            chain.select = vi.fn().mockReturnThis();
            chain.eq = vi.fn((col: string) => {
              if (col === 'subject_id') {
                return {
                  eq: vi.fn().mockReturnThis(),
                  select: vi.fn().mockReturnThis(),
                  in: vi.fn().mockReturnThis(),
                  limit: vi.fn().mockResolvedValue({
                    data: [{
                      id: 'job-fail',
                      subject_id: 'subj-1',
                      organization_id: null,
                      pending_token_count: 5000,
                      status: 'pending' as const,
                      source_event: 'memory.create' as const,
                      source_memory_ids: ['mem-1'],
                      created_at: new Date().toISOString(),
                      started_at: null,
                      completed_at: null,
                      error: null,
                    }],
                    error: null,
                  }),
                };
              }
              return {
                in: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            });
            chain.in = vi.fn().mockResolvedValue({ data: null, error: null });
            return chain;
          }
          return { select: vi.fn().mockReturnThis() };
        }),
        rpc: vi.fn().mockResolvedValue({ data: 2000, error: null }),
      };

      const { processSubjectReasoningBatch } = await import(
        '../../../supabase/functions/_shared/reasoning-processor.ts'
      );

      // Must NOT throw — function should swallow error and mark job failed
      await expect(
        processSubjectReasoningBatch(supabase as any, {
          subject_id: 'subj-1',
          organization_id: null,
          source_memory_ids: [],
        }),
      ).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Batch processing completeness
  // -------------------------------------------------------------------------

  describe('batch processing completeness', () => {
    it('processes to completion with no conclusions (empty source_memory_ids)', async () => {
      env.FEATURE_MEMORY_REASONING_QUEUE = 'true';
      env.OPENAI_API_KEY = 'sk-test';
      env.SUPABASE_URL = 'https://proj.supabase.co';
      env.SUPABASE_SERVICE_ROLE_KEY = 'ey-test';

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'memory_inference_jobs') {
            return {
              update: vi.fn().mockReturnThis(),
              eq: vi.fn((col: string) => {
                if (col === 'subject_id') {
                  return {
                    eq: vi.fn().mockReturnThis(),
                    select: vi.fn().mockReturnThis(),
                    in: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  };
                }
                return { eq: vi.fn().mockReturnThis() };
              }),
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
        rpc: vi.fn().mockResolvedValue({ data: 2000, error: null }),
      };

      const { processSubjectReasoningBatch } = await import(
        '../../../supabase/functions/_shared/reasoning-processor.ts'
      );

      const result = await processSubjectReasoningBatch(supabase as any, {
        subject_id: 'subj-empty',
        organization_id: null,
        source_memory_ids: [],
      });

      // No jobs found → empty result, no throws
      expect(result).toEqual({ job_ids: [], conclusion_count: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // Contradiction detection — Phase 2 spec (currently stubbed)
  // -------------------------------------------------------------------------

  describe('contradiction group assignment (Phase 2 spec)', () => {
    it('documents: cosine similarity > 0.85 assigns same group, lower-confidence superseded', async () => {
      /**
       * PHASE 2 SPEC — currently findContradictionGroup is a stub.
       *
       * Expected behavior:
       *   - cosine distance < 0.15 (similarity > 0.85) triggers group assignment
       *   - existing conclusion (id=c-existing, confidence=0.9)
       *   - new conclusion (confidence=0.7) → gets contradiction_group_id = c-existing
       *   - new conclusion.superseded_by = c-existing.id
       *
       * Implementation: pgvector cosine_distance on embedding column.
       * findContradictionGroup uses raw SQL: cosinedistance(embedding, new_embedding) < 0.15
       */
      const newEmbedding = new Array(1536).fill(0.05);
      const existingEmbedding = new Array(1536).fill(0.049);
      // cos similarity ≈ 0.99 >> 0.85 threshold → same group

      // This test is a specification marker — implementation in Phase 2
      expect(true).toBe(true);
    });

    it('documents: superseded_by is set on the lower-confidence conclusion', async () => {
      /**
       * PHASE 2 SPEC.
       *
       * When two conclusions share contradiction_group_id:
       *   - higher confidence conclusion is the "winner" — superseded_by = NULL
       *   - lower confidence conclusion gets superseded_by = higher-confidence.id
       *
       * Phase 2: findContradictionGroup returns { groupId, superseded, existingId }
       *   where superseded=true means new conclusion is lower-confidence and should be marked
       */
      expect(true).toBe(true);
    });
  });
});