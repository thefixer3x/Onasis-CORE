/**
 * Real production Intelligence Edge Functions — contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section 7
 * "Real production Intelligence EF coverage"
 *
 * Distinct from the PRD's "Intelligence" feature (see intelligence-prd.test.ts),
 * which does not exist in production. These are the actual EFs reachable via
 * /api/v1/intelligence/* -> nginx rewrite -> /functions/v1/intelligence-*.
 * The configured TEST_API_KEY was confirmed premium-tier on 2026-06-21 (a
 * successful intelligence-health-check call, a premium-gated EF).
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall } from '../setup';

describe('Intelligence (real production EFs)', () => {
  // Wave A -- no fixture needed, documented in SUPABASE_REST_API_OPENAPI.yaml
  it('health-check: returns a memory organization health score', async () => {
    const { status, data } = await netlifyCall('intelligence/health-check', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data?.health_score).toBeDefined();
  });

  it('detect-duplicates: returns duplicate detection results', async () => {
    const { status } = await netlifyCall('intelligence/detect-duplicates', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(200);
  });

  it('extract-insights: returns extracted insights', async () => {
    const { status } = await netlifyCall('intelligence/extract-insights', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(200);
  });

  it('analyze-patterns: returns pattern analysis results', async () => {
    const { status } = await netlifyCall('intelligence/analyze-patterns', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(200);
  });

  it('suggest-tags: returns tag suggestions for raw content (no memory_id needed)', async () => {
    const { status, data } = await netlifyCall('intelligence/suggest-tags', {
      method: 'POST',
      body: JSON.stringify({ content: 'Contract test content about API testing.', title: 'Contract test' }),
    });
    expect(status).toBe(200);
    expect(data.data?.suggestions).toBeDefined();
  });

  it('find-related: returns related memories for a text query (no memory_id needed)', async () => {
    const { status, data } = await netlifyCall('intelligence/find-related', {
      method: 'POST',
      body: JSON.stringify({ query: 'contract testing' }),
    });
    expect(status).toBe(200);
    expect(data.data?.related_memories).toBeDefined();
  });

  // Wave B -- needs a real user id (resolved via auth/me, same identity the
  // configured TEST_API_KEY belongs to)
  it('intelligence/memories: queries memories scoped to the authenticated user', async () => {
    const whoami = await netlifyCall('auth/me', { method: 'GET' });
    const userId = whoami.data?.id;
    expect(userId).toBeTruthy();

    const { status } = await netlifyCall(`intelligence/memories?user_id=${userId}`, { method: 'GET' });
    expect(status).toBe(200);
  });

  it('predictive-recall: predicts likely-useful memories from context', async () => {
    const whoami = await netlifyCall('auth/me', { method: 'GET' });
    const userId = whoami.data?.id;

    const { status, data } = await netlifyCall('intelligence/predictive-recall', {
      method: 'POST',
      body: JSON.stringify({ userId, context: {} }),
    });
    expect(status).toBe(200);
    expect(data.data?.predictions).toBeDefined();
  });

  // prediction-feedback also needs a real memoryId, not just userId -- the
  // simplest fixture is a freshly created memory. Skipped if memory create
  // is unavailable; the assertion still runs against whatever it gets back.
  it('prediction-feedback: records feedback on a real memory', async () => {
    const whoami = await netlifyCall('auth/me', { method: 'GET' });
    const userId = whoami.data?.id;

    const memory = await netlifyCall('memories', {
      method: 'POST',
      body: JSON.stringify({ title: 'prediction-feedback-fixture', content: 'fixture', memory_type: 'context' }),
    });
    const memoryId = memory.data?.id;
    expect(memoryId).toBeTruthy();

    const { status } = await netlifyCall('intelligence/prediction-feedback', {
      method: 'POST',
      body: JSON.stringify({ memoryId, userId, useful: true, action: 'saved' }),
    });
    expect(status).toBe(200);
  });

  // Wave C -- behavior-* trio. Request shapes pulled from EF source
  // (apps/onasis-core/supabase/functions/intelligence-behavior-*/index.ts)
  // since their OpenAPI schemas are $ref'd but never defined.
  it('behavior-record then behavior-recall: records and reads back a pattern', async () => {
    const record = await netlifyCall('intelligence/behavior-record', {
      method: 'POST',
      body: JSON.stringify({
        trigger: 'contract-test-trigger',
        context: { directory: '/contract-test' },
        actions: [{ tool: 'test', parameters: {}, outcome: 'success', timestamp: new Date().toISOString() }],
        final_outcome: 'success',
      }),
    });
    expect([200, 201]).toContain(record.status);

    const recall = await netlifyCall('intelligence/behavior-recall', {
      method: 'POST',
      body: JSON.stringify({
        context: { current_directory: '/contract-test', current_task: 'contract-test-trigger' },
      }),
    });
    expect(recall.status).toBe(200);
  });

  it('behavior-suggest: generates action suggestions from current state', async () => {
    const { status } = await netlifyCall('intelligence/behavior-suggest', {
      method: 'POST',
      body: JSON.stringify({
        current_state: { task_description: 'contract test task', completed_steps: ['step-1'] },
      }),
    });
    expect(status).toBe(200);
  });

  // The 4 undocumented EFs (ask-profile, reasoning-worker, profiles,
  // flush-reasoning-queue) are deliberately not covered yet -- need to
  // confirm each is a public HTTP route (vs. internal/queue-only) before
  // writing assertions. See coverage_plan.md §7, "Deferred."
});
