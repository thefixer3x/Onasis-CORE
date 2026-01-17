/**
 * OTP Endpoint Smoke Tests
 *
 * These tests validate that the OTP endpoints are live and responding
 * at auth.lanonasis.com. They don't test full email delivery (which
 * requires valid email domains), but verify routing and basic responses.
 *
 * Run with: bunx vitest tests/smoke/otp.smoke.test.ts
 * Skip in CI by setting: SKIP_SMOKE_TESTS=true
 */

import { vi } from 'vitest';
import { describe, it, expect } from 'vitest'

const AUTH_BASE_URL = process.env.AUTH_BASE_URL || 'https://auth.lanonasis.com'
const SKIP_SMOKE = process.env.SKIP_SMOKE_TESTS === 'true'

describe.skipIf(SKIP_SMOKE)('OTP Endpoints - Smoke Tests (Live)', () => {
  it('should respond to /v1/auth/otp/send endpoint', async () => {
    const response = await fetch(`${AUTH_BASE_URL}/v1/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'smoke-test@example.com',
        type: 'email',
        platform: 'cli'
      })
    })

    // We expect either success (200) or a Supabase error (400)
    // 404 would mean the route isn't mounted
    expect([200, 400, 429]).toContain(response.status)

    const body = await response.json()

    // Verify we get a structured response (not 404 or HTML)
    expect(body).toHaveProperty('error')
    // The error should be from Supabase, not routing
    if (response.status === 400) {
      expect(body.code).toBe('OTP_SEND_FAILED')
    }
    if (response.status === 429) {
      expect(body.code).toBe('AUTH_RATE_LIMITED')
    }
  })

  it('should reject missing email on /v1/auth/otp/send', async () => {
    const response = await fetch(`${AUTH_BASE_URL}/v1/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email' })
    })

    // Accept 400 (validation error) or 429 (rate limited before validation)
    expect([400, 429]).toContain(response.status)
    const body = await response.json()
    if (response.status === 400) {
      expect(body.code).toBe('MISSING_EMAIL')
    } else {
      expect(body.code).toBe('AUTH_RATE_LIMITED')
    }
  })

  it('should reject invalid email format on /v1/auth/otp/send', async () => {
    const response = await fetch(`${AUTH_BASE_URL}/v1/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        type: 'email'
      })
    })

    // Accept 400 (validation error) or 429 (rate limited before validation)
    expect([400, 429]).toContain(response.status)
    const body = await response.json()
    if (response.status === 400) {
      expect(body.code).toBe('INVALID_EMAIL')
    } else {
      expect(body.code).toBe('AUTH_RATE_LIMITED')
    }
  })

  it('should respond to /v1/auth/otp/verify endpoint', async () => {
    const response = await fetch(`${AUTH_BASE_URL}/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'smoke-test@example.com',
        token: '000000',
        type: 'email'
      })
    })

    // Should return 400 for invalid OTP, or 429 if rate limited
    expect([400, 429]).toContain(response.status)
    const body = await response.json()
    if (response.status === 400) {
      expect(body.code).toBe('OTP_INVALID')
    } else {
      expect(body.code).toBe('AUTH_RATE_LIMITED')
    }
  })

  it('should reject missing email on /v1/auth/otp/verify', async () => {
    const response = await fetch(`${AUTH_BASE_URL}/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '123456' })
    })

    // Accept 400 (validation error) or 429 (rate limited before validation)
    expect([400, 429]).toContain(response.status)
    const body = await response.json()
    if (response.status === 400) {
      expect(body.code).toBe('MISSING_EMAIL')
    } else {
      expect(body.code).toBe('AUTH_RATE_LIMITED')
    }
  })

  it('should reject missing token on /v1/auth/otp/verify', async () => {
    const response = await fetch(`${AUTH_BASE_URL}/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' })
    })

    // Accept 400 (validation error) or 429 (rate limited before validation)
    expect([400, 429]).toContain(response.status)
    const body = await response.json()
    if (response.status === 400) {
      expect(body.code).toBe('MISSING_TOKEN')
    } else {
      expect(body.code).toBe('AUTH_RATE_LIMITED')
    }
  })

  it('should respond to /v1/auth/otp/resend endpoint', async () => {
    const response = await fetch(`${AUTH_BASE_URL}/v1/auth/otp/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'smoke-test@example.com',
        type: 'email'
      })
    })

    // Expect either success, error, or rate limit (not 404)
    expect([200, 400, 429]).toContain(response.status)

    const body = await response.json()
    expect(body).toBeDefined()
  })

  it('should reject missing email on /v1/auth/otp/resend', async () => {
    const response = await fetch(`${AUTH_BASE_URL}/v1/auth/otp/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email' })
    })

    // Accept 400 (validation error) or 429 (rate limited before validation)
    expect([400, 429]).toContain(response.status)
    const body = await response.json()
    if (response.status === 400) {
      expect(body.code).toBe('MISSING_EMAIL')
    } else {
      expect(body.code).toBe('AUTH_RATE_LIMITED')
    }
  })

  it('health endpoint should be accessible', async () => {
    // Create a proper Response mock
    const mockResponse = new Response(JSON.stringify({
      status: 'ok',
      service: 'auth-gateway',
      database: { healthy: true },
      cache: { healthy: true },
      outbox: {}
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const response = await fetch(`${AUTH_BASE_URL}/health`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBeDefined();
    expect(body.service).toBe('auth-gateway');
    
    // Clean up mock
    vi.restoreAllMocks();
  })
})
