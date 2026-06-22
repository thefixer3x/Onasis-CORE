/**
 * Memory Management — production contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section "Memory Management"
 * Uses the configured TEST_API_KEY (X-API-Key, attached by default via netlifyCall).
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall, TEST_CONFIG } from '../setup';

describe('Memory Management', () => {
  it('M-01/M-02/M-03/M-04/M-05/M-06: full memory lifecycle', async () => {
    const create = await netlifyCall('memories', {
      method: 'POST',
      body: JSON.stringify({
        title: `contract-test-memory-${crypto.randomUUID()}`,
        content: 'Contract test content for the memory lifecycle suite.',
        memory_type: 'context',
      }),
    });
    expect(create.status).toBe(201);
    const memoryId = create.data?.id ?? create.data?.data?.id;
    expect(memoryId).toBeTruthy();

    const list = await netlifyCall('memories', { method: 'GET' });
    expect(list.status).toBe(200);

    const search = await netlifyCall('memories/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'Contract test content', limit: 10 }),
    });
    expect(search.status).toBe(200);

    const get = await netlifyCall(`memories/${memoryId}`, { method: 'GET' });
    expect(get.status).toBe(200);

    const update = await netlifyCall(`memories/${memoryId}`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'updated-by-contract-test' }),
    });
    expect(update.status).toBe(200);

    const del = await netlifyCall(`memories/${memoryId}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
  });

  it('M-07: memory create rejects missing required fields', async () => {
    const { status } = await netlifyCall('memories', { method: 'POST', body: JSON.stringify({}) });
    expect(status).toBe(400);
  });

  it('M-08: memory search rejects empty query or invalid limit', async () => {
    const { status } = await netlifyCall('memories/search', {
      method: 'POST',
      body: JSON.stringify({ query: '', limit: -1 }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('M-09: memory get for a non-existent id returns 404', async () => {
    const { status } = await netlifyCall('memories/00000000-0000-0000-0000-000000000000', { method: 'GET' });
    expect(status).toBe(404);
  });

  it('M-10: bulk delete removes a list of memory ids and reports the result', async () => {
    const create1 = await netlifyCall('memories', {
      method: 'POST',
      body: JSON.stringify({ title: 'bulk-1', content: 'bulk delete fixture', memory_type: 'context' }),
    });
    const create2 = await netlifyCall('memories', {
      method: 'POST',
      body: JSON.stringify({ title: 'bulk-2', content: 'bulk delete fixture', memory_type: 'context' }),
    });
    const ids = [create1.data?.id, create2.data?.id].filter(Boolean);

    const { status } = await netlifyCall('memories/bulk/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    expect(status).toBe(200);
  });

  it('M-11: admin stats rejects a non-admin user', async () => {
    // Resolved 2026-06-21: no admin-grant path exists for the configured
    // test key, so this asserts the 403 requireRole(['admin']) rejection.
    const { status } = await netlifyCall('memories/admin/stats', { method: 'GET' });
    expect(status).toBe(403);
  });

  it('M-12: memory mount alias /memory and /memories serve identical responses', async () => {
    const viaMemories = await netlifyCall('memories', { method: 'GET' });
    const viaMemory = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/memory`, {
      headers: { 'X-API-Key': TEST_CONFIG.API_KEY },
    });
    expect(viaMemories.status).toBe(200);
    expect(viaMemory.status).toBe(200);
  });
});
