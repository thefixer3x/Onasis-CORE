/**
 * Metrics — production contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section "Metrics"
 *
 * Confirmed 404 on api.lanonasis.com as of 2026-06-21 (see
 * discovered_issues_todo.md) -- same self-hosted-Express-only pattern as
 * the PRD's Intelligence feature. Kept asserting the documented behavior
 * on purpose, so this stays red until the gap is resolved.
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall, TEST_CONFIG, registerAndLogin } from '../setup';

describe('Metrics', () => {
  it('MT-01: prometheus metrics endpoint returns text exposition for an authorized user', async () => {
    const { status } = await netlifyCall('metrics', { method: 'GET' });
    expect(status).toBe(200);
  });

  it('MT-02: metrics json endpoint returns JSON-formatted metrics for an authorized user', async () => {
    const { status } = await netlifyCall('metrics/json', { method: 'GET' });
    expect(status).toBe(200);
  });

  it('MT-03: metrics endpoint without bearer token is rejected', async () => {
    const response = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/metrics`);
    expect(response.status).toBe(401);
  });

  it('MT-04: metrics json for a plan without access is forbidden', async () => {
    const token = await registerAndLogin();
    const response = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/metrics/json`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });
});
