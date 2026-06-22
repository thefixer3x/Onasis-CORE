/**
 * Service Registry — production contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section "Service Registry"
 *
 * Note: GET /api/v1/services confirmed 404 on production as of 2026-06-21
 * (route exists in apps/lanonasis-maas/src/server.ts but is not registered
 * in api-gateway.js's routing table -- see discovered_issues_todo.md). Kept
 * asserting the documented behavior on purpose.
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall, TEST_CONFIG } from '../setup';

describe('Service Registry', () => {
  it('S-01: services list returns registered services without authentication', async () => {
    const response = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/services`);
    expect(response.status).toBe(200);
  });

  it('S-02: services health returns aggregated downstream health', async () => {
    const { status } = await netlifyCall('services/health', { method: 'GET' });
    expect(status).toBe(200);
  });

  it('S-03: services auth/test reports auth connectivity status', async () => {
    const { status } = await netlifyCall('services/auth/test', { method: 'GET' });
    expect(status).toBe(200);
  });

  it('S-04: services mcp/test reports MCP connectivity status', async () => {
    const { status } = await netlifyCall('services/mcp/test', { method: 'GET' });
    expect(status).toBe(200);
  });

  it('S-05: services sync triggers registry synchronization for an authenticated caller', async () => {
    const { status } = await netlifyCall('services/sync', { method: 'POST' });
    expect(status).toBe(200);
  });

  it('S-06: services sync without bearer token is rejected', async () => {
    const response = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/services/sync`, { method: 'POST' });
    expect(response.status).toBe(401);
  });

  // S-07 (degraded-dependency simulation) intentionally omitted: no
  // fault-injection capability against the production target.
});
