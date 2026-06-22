/**
 * OAuth Authentication — production contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section "OAuth Authentication"
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall, TEST_CONFIG } from '../setup';

// Real paths confirmed 2026-06-22 (see discovered_issues_todo.md): OAuth
// lives at /oauth/* via auth-gateway's oauth.routes.ts / device.routes.ts,
// not /api/v1/auth/oauth/*. client-info has no auth-gateway equivalent at
// all -- only exists in the bypassed standalone Express app.
const OAUTH_BASE = TEST_CONFIG.NETLIFY_BASE_URL.replace('/api/v1', '/oauth');

describe('OAuth Authentication', () => {
  // O-01: confirmed genuine production gap -- client-info only exists in
  // the bypassed maas Express app (auth-router.ts:164), no auth-gateway
  // equivalent. Kept asserting documented behavior on purpose.
  it('O-01: oauth client-info returns public client metadata', async () => {
    const { status, data } = await netlifyCall('auth/oauth/client-info', { method: 'GET' });
    expect(status).toBe(200);
    expect(typeof data).toBe('object');
  });

  it('O-02: oauth authorize redirects to provider for a valid request', async () => {
    const params = new URLSearchParams({
      client_id: 'test-client',
      redirect_uri: 'https://example.com/callback',
      response_type: 'code',
    });
    const response = await fetch(`${OAUTH_BASE}/authorize?${params}`, { redirect: 'manual' });
    expect([302, 303, 307]).toContain(response.status);
    expect(response.headers.get('location')).toBeTruthy();
  });

  it('O-03: oauth authorize rejects invalid or incomplete parameters', async () => {
    const response = await fetch(`${OAUTH_BASE}/authorize`);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  // O-04 (token exchange happy path) needs a real authorization code from a
  // completed provider redirect -- not obtainable headlessly. Covered by
  // O-05's negative case instead; revisit if a test-provider flow becomes available.
  it('O-05: oauth token exchange fails for expired or invalid code', async () => {
    const response = await fetch(`${OAUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code: 'definitely-invalid-or-expired-code' }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it('O-06: device authorization flow returns verification details', async () => {
    const response = await fetch(`${OAUTH_BASE}/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'test-client' }),
    });
    expect(response.status).toBe(200);
  });

  // O-07 (revoke happy path) needs a dedicated oauth_access_token from O-04's
  // chain -- deferred alongside O-04.

  it('O-08: token revoke without authentication is rejected', async () => {
    const response = await fetch(`${OAUTH_BASE}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'irrelevant' }),
    });
    expect(response.status).toBe(401);
  });
});
