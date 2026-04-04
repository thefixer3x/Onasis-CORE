import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyMemoryBoundary,
  resolveMemoryBoundary,
  resolveMemoryContext,
} from '../../supabase/functions/_shared/memory-context.ts';

type EnvMap = Record<string, string | undefined>;

class FakeQuery {
  ops: Array<{ op: 'eq'; column: string; value: unknown }> = [];

  eq(column: string, value: unknown) {
    this.ops.push({ op: 'eq', column, value });
    return this;
  }
}

describe('memory-context helpers', () => {
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
  });

  it('resolves personal and team contexts from scopes', () => {
    expect(resolveMemoryContext(undefined, ['memories:personal:*'])).toBe('personal');
    expect(resolveMemoryContext(undefined, ['memories:team:read'])).toBe('team');
  });

  it('treats enterprise and legacy scopes as cross-context within the org fence', () => {
    expect(resolveMemoryContext('enterprise', [])).toBe('enterprise');
    expect(resolveMemoryContext(undefined, ['memories:*'])).toBe('enterprise');
    expect(resolveMemoryContext('legacy', [])).toBe('none');
    expect(resolveMemoryContext(undefined, ['legacy.full_access'])).toBe('none');
  });

  it('adds personal user boundary on top of org isolation', () => {
    const boundary = resolveMemoryBoundary({
      user_id: 'user-1',
      organization_id: 'org-1',
      key_context: 'personal',
      permissions: ['memories:personal:*'],
    });

    expect(boundary).toEqual({
      context: 'personal',
      flags: { shadow: false, enforce: false },
      organization_id: 'org-1',
      user_id: 'user-1',
    });
  });

  it('keeps team and legacy traffic org-scoped without a user fence', () => {
    const teamBoundary = resolveMemoryBoundary({
      user_id: 'user-1',
      organization_id: 'org-1',
      key_context: 'team',
      permissions: ['memories:team:*'],
    });
    const legacyBoundary = resolveMemoryBoundary({
      user_id: 'user-1',
      organization_id: 'org-1',
      key_context: 'legacy',
      permissions: ['legacy.full_access'],
    });

    expect(teamBoundary.organization_id).toBe('org-1');
    expect(teamBoundary.user_id).toBeNull();
    expect(legacyBoundary.organization_id).toBe('org-1');
    expect(legacyBoundary.user_id).toBeNull();
  });

  it('adds the user filter only when enforcement is enabled', () => {
    env.FEATURE_MEMORY_CONTEXT_SHADOW = 'true';

    const shadowQuery = new FakeQuery();
    applyMemoryBoundary(shadowQuery, {
      user_id: 'user-1',
      organization_id: 'org-1',
      key_context: 'personal',
      permissions: ['memories:personal:*'],
    });

    expect(shadowQuery.ops).toEqual([
      { op: 'eq', column: 'organization_id', value: 'org-1' },
    ]);

    env.FEATURE_MEMORY_CONTEXT_ENFORCE = 'true';

    const enforcedQuery = new FakeQuery();
    applyMemoryBoundary(enforcedQuery, {
      user_id: 'user-1',
      organization_id: 'org-1',
      key_context: 'personal',
      permissions: ['memories:personal:*'],
    });

    expect(enforcedQuery.ops).toEqual([
      { op: 'eq', column: 'organization_id', value: 'org-1' },
      { op: 'eq', column: 'user_id', value: 'user-1' },
    ]);
  });
});
