/**
 * Memory Profiles — production contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section "Memory Profiles"
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall, TEST_CONFIG } from '../setup';

describe('Memory Profiles', () => {
  it('P-01: profile get returns the current subject profile', async () => {
    const whoami = await netlifyCall('auth/me', { method: 'GET' });
    const subjectId = whoami.data?.id;
    expect(subjectId).toBeTruthy();

    const { status } = await netlifyCall(`profiles/${subjectId}`, { method: 'GET' });
    expect(status).toBe(200);
  });

  it('P-02: profile versions returns version history', async () => {
    const whoami = await netlifyCall('auth/me', { method: 'GET' });
    const subjectId = whoami.data?.id;

    const { status } = await netlifyCall(`profiles/${subjectId}/versions`, { method: 'GET' });
    expect(status).toBe(200);
  });

  it('P-03: profile ask answers a natural-language question grounded in profile data', async () => {
    const whoami = await netlifyCall('auth/me', { method: 'GET' });
    const subjectId = whoami.data?.id;

    const { status } = await netlifyCall(`profiles/${subjectId}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question: 'What do you know about me?' }),
    });
    expect(status).toBe(200);
  });

  it('P-04: profile get for an unknown subject returns 404', async () => {
    const { status } = await netlifyCall('profiles/00000000-0000-0000-0000-000000000000', { method: 'GET' });
    expect(status).toBe(404);
  });

  it('P-05: profile ask with empty question text is rejected', async () => {
    const whoami = await netlifyCall('auth/me', { method: 'GET' });
    const subjectId = whoami.data?.id;

    const { status } = await netlifyCall(`profiles/${subjectId}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question: '' }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('P-06: profile versions without bearer token is rejected', async () => {
    const response = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/profiles/any-subject/versions`);
    expect(response.status).toBe(401);
  });
});
