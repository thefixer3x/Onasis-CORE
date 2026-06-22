/**
 * Basic Authentication — production contract tests
 * Source: apps/lanonasis-maas/testsprite_tests/coverage_plan.md, section "Basic Authentication"
 */
import { describe, it, expect } from 'vitest';
import { netlifyCall, TEST_CONFIG } from '../setup';

describe('Basic Authentication', () => {
  // B-01/B-06 (register) and B-03 (refresh): confirmed genuine production
  // gaps 2026-06-22 (see discovered_issues_todo.md) -- auth-gateway's
  // auth.routes.ts has no /register or /refresh endpoint at all. Kept
  // asserting documented behavior on purpose against the real path's
  // sibling resource so these stay red until resolved.
  it('B-01: register creates a new account with valid email and password', async () => {
    const email = `contract-test-b01-${crypto.randomUUID()}@example.com`;
    const { status } = await netlifyCall('auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Sup3rSecure!Pass1' }),
    });
    expect(status).toBe(201);
  });

  it('B-02: login with valid credentials returns a token and user object', async () => {
    const email = `contract-test-b02-${crypto.randomUUID()}@example.com`;
    const password = 'Sup3rSecure!Pass1';
    await netlifyCall('auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });

    const { status, data } = await netlifyCall('auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(status).toBe(200);
    expect(data.token ?? data.access_token).toBeTruthy();
    expect(data.user).toBeDefined();
  });

  it('B-03: refresh exchanges a valid refresh context for a new access token', async () => {
    const email = `contract-test-b03-${crypto.randomUUID()}@example.com`;
    const password = 'Sup3rSecure!Pass1';
    await netlifyCall('auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    const login = await netlifyCall('auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const refreshToken = login.data.refresh_token ?? login.data.refreshToken;
    expect(refreshToken).toBeTruthy();

    const { status, data } = await netlifyCall('auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    expect(status).toBe(200);
    expect(data.token ?? data.access_token).toBeTruthy();
  });

  it('B-04: logout with bearer token invalidates the session', async () => {
    const email = `contract-test-b04-${crypto.randomUUID()}@example.com`;
    const password = 'Sup3rSecure!Pass1';
    await netlifyCall('auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    const login = await netlifyCall('auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const token = login.data.token ?? login.data.access_token;

    const response = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
  });

  it('B-05: login with incorrect password is rejected', async () => {
    const email = `contract-test-b05-${crypto.randomUUID()}@example.com`;
    await netlifyCall('auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'Sup3rSecure!Pass1' }) });

    const { status } = await netlifyCall('auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'wrong-password' }),
    });
    expect(status).toBe(401);
  });

  it('B-06: register rejects invalid email or weak password', async () => {
    const { status } = await netlifyCall('auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email', password: 'weak' }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('B-07: logout without bearer token is rejected', async () => {
    const response = await fetch(`${TEST_CONFIG.NETLIFY_BASE_URL}/auth/logout`, { method: 'POST' });
    expect(response.status).toBe(401);
  });
});
