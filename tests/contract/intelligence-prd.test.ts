/**
 * Intelligence (PRD's version: jobs/conclusions/flush) — production contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section "Intelligence"
 *
 * This feature is documented in apps/lanonasis-maas's PRD but only exists in
 * the self-hosted Express app -- confirmed 404 on api.lanonasis.com as of
 * 2026-06-21 (see discovered_issues_todo.md). Production's real intelligence
 * surface is a different, separate set of routes -- see intelligence-real.test.ts.
 * Kept asserting the documented behavior on purpose, so this stays red until
 * the PRD is corrected or the feature is actually exposed in production.
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall, TEST_CONFIG } from '../setup';

describe('Intelligence (PRD version -- jobs/conclusions/flush)', () => {
  it('I-02: intelligence conclusions list returns available conclusions', async () => {
    const { status } = await netlifyCall('intelligence/conclusions', { method: 'GET' });
    expect(status).toBe(200);
  });

  it('I-03/I-01: flush produces a job id, then job status reflects it', async () => {
    const flush = await netlifyCall('intelligence/flush', { method: 'POST' });
    expect(flush.status).toBe(200);
    const jobId = flush.data?.job_ids?.[0];
    expect(jobId).toBeTruthy();

    const jobStatus = await netlifyCall(`intelligence/jobs/${jobId}`, { method: 'GET' });
    expect(jobStatus.status).toBe(200);
  });

  it('I-04: intelligence job status for an unknown id returns 404', async () => {
    const { status } = await netlifyCall('intelligence/jobs/00000000-0000-0000-0000-000000000000', { method: 'GET' });
    expect(status).toBe(404);
  });

  it('I-05: intelligence conclusions without bearer token is rejected', async () => {
    const response = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/intelligence/conclusions`);
    expect(response.status).toBe(401);
  });
});
