// Live-integration smoke test for the auth-gateway.
//
// Gated behind RUN_AUTH_GATEWAY_INTEGRATION=true. When the gate is off (the
// default), this entire suite is skipped, so it's safe to commit and ship
// without test-DB credentials wired up.
//
// To run locally:
//   dotenvx run --strict --no-ops -f .env.test -- \
//     RUN_AUTH_GATEWAY_INTEGRATION=true vitest run tests/integration/auth-introspect.smoke
//
// In CI: provide JWT_SECRET, DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY, AUTH_BASE_URL as workflow secrets and set
// RUN_AUTH_GATEWAY_INTEGRATION=true.
//
// This test deliberately does NOT mock src/config/env.js or any service.
// That distinguishes it from existing tests/integration/*.test.ts files which
// are mocked-integration style.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';

const SKIP = process.env.RUN_AUTH_GATEWAY_INTEGRATION !== 'true';

describe.skipIf(SKIP)('auth-gateway live smoke', () => {
  it('GET /health returns liveness JSON', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'auth-gateway',
      liveness: 'pass',
    });
  });

  it('POST /oauth/introspect with an invalid token returns active=false', async () => {
    const response = await request(app)
      .post('/oauth/introspect')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('token=invalid-token');

    expect([200, 400, 401]).toContain(response.status);
    expect(response.headers['content-type']).toContain('application/json');

    if (response.status === 200) {
      expect(response.body).toHaveProperty('active');
      expect(response.body.active).toBe(false);
    }
  });

  it('GET /v1/auth/session without credentials returns 401 JSON', async () => {
    const response = await request(app).get('/v1/auth/session');

    expect([401, 403]).toContain(response.status);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('GET /.well-known/oauth-authorization-server exposes RFC 8414 metadata', async () => {
    const response = await request(app).get(
      '/.well-known/oauth-authorization-server',
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      issuer: expect.any(String),
      authorization_endpoint: expect.stringContaining('/oauth/authorize'),
      token_endpoint: expect.stringContaining('/oauth/token'),
    });
  });
});
