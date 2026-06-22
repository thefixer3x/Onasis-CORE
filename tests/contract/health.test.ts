/**
 * Health & Readiness — production contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section "Health & Readiness"
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall } from '../setup';

describe('Health & Readiness', () => {
  it('H-01: health endpoint reports overall status and dependency info', async () => {
    const { status, data } = await netlifyCall('health', { method: 'GET' });
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.auth_service).toBeDefined();
    expect(data.api_service).toBeDefined();
  });

  // H-02/H-03: PRD documents these as live routes; confirmed 404 on production
  // as of 2026-06-21 (see discovered_issues_todo.md). Kept asserting the
  // documented 200 behavior on purpose -- this is meant to fail until the
  // route is registered or the PRD is corrected.
  it('H-02: readiness probe reflects dependency reachability', async () => {
    const { status, data } = await netlifyCall('health/ready', { method: 'GET' });
    expect(status).toBe(200);
    expect(['ok', 'ready']).toContain(data?.status);
  });

  it('H-03: liveness probe always returns 200 regardless of dependency state', async () => {
    const { status, data } = await netlifyCall('health/live', { method: 'GET' });
    expect(status).toBe(200);
    expect(['ok', 'alive']).toContain(data?.status);
  });

  // H-04 (degraded-dependency simulation) intentionally omitted: there is no
  // fault-injection capability against the production target. See coverage_plan.md §2.
});
