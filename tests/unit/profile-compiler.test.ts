/**
 * tests/unit/profile-compiler.test.ts
 *
 * Unit tests for _shared/profile-compiler.ts.
 * Tests compileProfileFromConclusions() behavior:
 *   - Early return on empty conclusions
 *   - Bucketing: explicit+preference→preferences, explicit+goal→goals,
 *     explicit+constraint→constraints, inductive→tendencies, deductive→facts
 *   - Deduplication: identical content not added twice
 *   - Merges into existing profile fields (additive, not destructive)
 *   - confidence_by_field averages computed per field
 *   - profile_summary truncated to 2000 chars
 *   - upsert_memory_profile RPC called with correct payload
 *   - Non-fatal: failure of summary EF call does not throw
 *   - Non-fatal: failure of RPC upsert DOES throw (caller wraps in try/catch)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ConclusionInput, CompileProfileOptions } from '../../supabase/functions/_shared/profile-compiler.ts';

// ---------------------------------------------------------------------------
// Module mock helpers
// ---------------------------------------------------------------------------

let capturedRpcArgs: unknown[] = [];
let rpcShouldFail = false;
let fetchShouldFail = false;
let fetchResponse: string = JSON.stringify({
  data: { conclusions: [{ content: 'A short summary' }] }
});

function makeSupabase(existingFields?: Record<string, string[]>) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'memory_profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: existingFields
              ? { structured_fields: existingFields }
              : null,
          }),
        };
      }
      return {};
    }),
    rpc: vi.fn(async (fnName: string, args: unknown) => {
      capturedRpcArgs = [fnName, args];
      if (rpcShouldFail) return { error: { message: 'rpc failed' } };
      return { error: null };
    }),
  };
}

function makeConclusion(overrides: Partial<ConclusionInput> = {}): ConclusionInput {
  return {
    id: crypto.randomUUID(),
    conclusion_type: 'deductive',
    content: 'Some conclusion text',
    confidence: 0.8,
    scope: null,
    evidence_memory_ids: ['mem-1'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock fetch for the summary EF call
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedRpcArgs = [];
  rpcShouldFail = false;
  fetchShouldFail = false;
  fetchResponse = JSON.stringify({
    data: { conclusions: [{ content: 'A short summary' }] },
  });

  vi.stubGlobal('fetch', vi.fn(async () => {
    if (fetchShouldFail) {
      throw new Error('fetch failed');
    }
    return {
      ok: true,
      json: async () => JSON.parse(fetchResponse),
    };
  }));

  vi.stubGlobal('Deno', {
    env: {
      get: (k: string) => {
        if (k === 'SUPABASE_URL') return 'https://test.supabase.co';
        if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-key';
        return undefined;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Import under test (dynamic to pick up mocked globals at call time)
// ---------------------------------------------------------------------------

async function getCompile() {
  const mod = await import(
    '../../supabase/functions/_shared/profile-compiler.ts?' + Date.now()
  );
  return mod.compileProfileFromConclusions as (
    supabase: ReturnType<typeof makeSupabase>,
    opts: CompileProfileOptions,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compileProfileFromConclusions', () => {
  it('returns early with no RPC call when conclusions is empty', async () => {
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [],
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('buckets explicit+preference scope into preferences', async () => {
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [
        makeConclusion({ conclusion_type: 'explicit', scope: 'preference', content: 'Prefers dark mode' }),
      ],
    });
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    const fields = args.p_structured_fields as Record<string, string[]>;
    expect(fields.preferences).toContain('Prefers dark mode');
    expect(fields.goals).toHaveLength(0);
  });

  it('buckets explicit+goal scope into goals', async () => {
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [
        makeConclusion({ conclusion_type: 'explicit', scope: 'goal', content: 'Wants to learn Rust' }),
      ],
    });
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    const fields = args.p_structured_fields as Record<string, string[]>;
    expect(fields.goals).toContain('Wants to learn Rust');
  });

  it('buckets inductive conclusions into tendencies', async () => {
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [
        makeConclusion({ conclusion_type: 'inductive', scope: null, content: 'Tends to work late' }),
      ],
    });
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    const fields = args.p_structured_fields as Record<string, string[]>;
    expect(fields.tendencies).toContain('Tends to work late');
  });

  it('buckets deductive conclusions into facts', async () => {
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [
        makeConclusion({ conclusion_type: 'deductive', scope: null, content: 'Uses TypeScript' }),
      ],
    });
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    const fields = args.p_structured_fields as Record<string, string[]>;
    expect(fields.facts).toContain('Uses TypeScript');
  });

  it('deduplicates: identical content not added twice to the same field', async () => {
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [
        makeConclusion({ conclusion_type: 'deductive', content: 'Uses TypeScript' }),
        makeConclusion({ conclusion_type: 'deductive', content: 'Uses TypeScript' }),
      ],
    });
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    const fields = args.p_structured_fields as Record<string, string[]>;
    expect(fields.facts.filter((f: string) => f === 'Uses TypeScript')).toHaveLength(1);
  });

  it('merges into existing profile fields (additive)', async () => {
    const supabase = makeSupabase({ preferences: ['Existing pref'], goals: [], constraints: [], tendencies: [], facts: [] });
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [
        makeConclusion({ conclusion_type: 'explicit', scope: 'preference', content: 'New pref' }),
      ],
    });
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    const fields = args.p_structured_fields as Record<string, string[]>;
    expect(fields.preferences).toContain('Existing pref');
    expect(fields.preferences).toContain('New pref');
  });

  it('computes per-field confidence averages', async () => {
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [
        makeConclusion({ conclusion_type: 'deductive', content: 'Fact A', confidence: 0.6 }),
        makeConclusion({ conclusion_type: 'deductive', content: 'Fact B', confidence: 1.0 }),
      ],
    });
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    const conf = args.p_confidence_by_field as Record<string, number>;
    expect(conf.facts).toBeCloseTo(0.8, 2);
  });

  it('truncates profile_summary to 2000 chars', async () => {
    fetchResponse = JSON.stringify({
      data: { conclusions: [{ content: 'x'.repeat(3000) }] },
    });
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-1',
      organization_id: null,
      source_job_id: 'job-1',
      conclusions: [makeConclusion()],
    });
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    expect((args.p_profile_summary as string).length).toBeLessThanOrEqual(2000);
  });

  it('non-fatal: summary EF failure does not throw, proceeds with null summary', async () => {
    fetchShouldFail = true;
    const supabase = makeSupabase();
    const compile = await getCompile();
    await expect(
      compile(supabase as any, {
        subject_id: 'sub-1',
        organization_id: null,
        source_job_id: 'job-1',
        conclusions: [makeConclusion()],
      }),
    ).resolves.not.toThrow();
    const [, args] = capturedRpcArgs as [string, Record<string, unknown>];
    expect(args.p_profile_summary).toBeNull();
  });

  it('calls upsert_memory_profile RPC with correct subject_id and job_id', async () => {
    const supabase = makeSupabase();
    const compile = await getCompile();
    await compile(supabase as any, {
      subject_id: 'sub-42',
      organization_id: 'org-1',
      source_job_id: 'job-99',
      conclusions: [makeConclusion()],
    });
    const [fnName, args] = capturedRpcArgs as [string, Record<string, unknown>];
    expect(fnName).toBe('upsert_memory_profile');
    expect(args.p_subject_id).toBe('sub-42');
    expect(args.p_source_job_id).toBe('job-99');
    expect(args.p_organization_id).toBe('org-1');
  });

  it('throws when upsert_memory_profile RPC returns an error', async () => {
    rpcShouldFail = true;
    const supabase = makeSupabase();
    const compile = await getCompile();
    await expect(
      compile(supabase as any, {
        subject_id: 'sub-1',
        organization_id: null,
        source_job_id: 'job-1',
        conclusions: [makeConclusion()],
      }),
    ).rejects.toThrow('upsert_memory_profile RPC failed');
  });
});
