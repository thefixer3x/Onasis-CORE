/**
 * Integration tests for OTP routes — transport wiring verification.
 *
 * These tests use the REAL `db/client.js` import (no mock on the transport
 * layer) to verify the route handler's import chain resolves correctly and
 * the Supabase Auth function is wired as expected.
 *
 * Gated behind `RUN_AUTH_GATEWAY_INTEGRATION=true`.  When the gate is off
 * (CI default) the entire suite is skipped.
 *
 * Internal services (cache, user, session, audit, jwt) are still mocked
 * to keep the test scope focused on the transport wiring.
 *
 * Run:
 *   RUN_AUTH_GATEWAY_INTEGRATION=true npx vitest run tests/integration/otp.integration.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const RUN_INTEGRATION = process.env.RUN_AUTH_GATEWAY_INTEGRATION === 'true'

// Mock internal services only — leave db/client.js unmocked
vi.mock('../../src/services/cache.service.js', () => ({
  OtpStateCache: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
}))

vi.mock('../../src/services/user.service.js', () => ({ upsertUserAccount: vi.fn() }))
vi.mock('../../src/services/session.service.js', () => ({ createSession: vi.fn() }))
vi.mock('../../src/services/audit.service.js', () => ({ logAuthEvent: vi.fn() }))
vi.mock('../../src/utils/jwt.js', () => ({
  generateTokenPair: vi.fn((payload: any) => ({
    access_token: `acc-${payload.sub}`,
    refresh_token: `ref-${payload.sub}`,
    expires_in: 3600
  })),
  generateTokenPairWithUAI: async (input: any) => ({
    access_token: `acc-${input.sub}`,
    refresh_token: `ref-${input.sub}`,
    expires_in: 3600
  })
}))

describe.skipIf(!RUN_INTEGRATION)('OTP Integration — Transport Wiring', () => {

  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()

    const otpModule = await import('../../src/routes/otp.routes.js')
    app = express()
    app.use(express.json())
    app.use('/otp', otpModule.default)
  })

  it('magic-link send should call real supabaseAuth.auth.signInWithOtp', async () => {
    const { supabaseAuth } = await import('../../db/client.js')

    const spy = vi.spyOn(supabaseAuth.auth, 'signInWithOtp').mockResolvedValue({ error: null } as never)

    const res = await request(app)
      .post('/otp/send')
      .send({ email: 'user@example.com', type: 'magiclink', redirect_uri: 'https://app.example.com/cb' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0][0]).toMatchObject({
      email: 'user@example.com',
      options: { emailRedirectTo: 'https://app.example.com/cb' }
    })
  })

  it('magic-link verify should call real supabaseAuth.auth.verifyOtp', async () => {
    const { supabaseAuth } = await import('../../db/client.js')
    const { OtpStateCache } = await import('../../src/services/cache.service.js')

    ;(OtpStateCache.get as any).mockResolvedValue({
      email: 'user@example.com',
      type: 'magiclink',
      platform: 'web',
      redirect_uri: 'https://app.example.com'
    })

    const spy = vi.spyOn(supabaseAuth.auth, 'verifyOtp').mockResolvedValue({
      data: {
        user: { id: 'uid-abc', email: 'user@example.com', role: 'authenticated', user_metadata: {} },
        session: {}
      },
      error: null
    } as never)

    const res = await request(app).post('/otp/verify').send({
      email: 'user@example.com',
      token: 'magic-token',
      type: 'magiclink'
    })

    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0][0]).toMatchObject({
      email: 'user@example.com',
      token: 'magic-token',
      type: 'email'
    })
  })
})
