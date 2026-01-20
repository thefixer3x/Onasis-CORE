import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock storage for OtpStateCache
const mockOtpStore = new Map<string, { data: string; ttl: number }>()

// Mocks - use OtpStateCache class instead of redisClient
vi.mock('../../src/services/cache.service.js', () => ({
  OtpStateCache: {
    set: vi.fn(async (key: string, data: Record<string, unknown>, ttl: number) => {
      mockOtpStore.set(key, { data: JSON.stringify(data), ttl })
    }),
    get: vi.fn(async (key: string) => {
      const stored = mockOtpStore.get(key)
      return stored ? JSON.parse(stored.data) : null
    }),
    delete: vi.fn(async (key: string) => {
      mockOtpStore.delete(key)
    })
  }
}))

vi.mock('../../db/client.js', () => ({
  supabaseAuth: {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      admin: { updateUserById: vi.fn() }
    }
  }
}))

vi.mock('../../src/services/user.service.js', () => ({ upsertUserAccount: vi.fn() }))
vi.mock('../../src/services/session.service.js', () => ({ createSession: vi.fn() }))
vi.mock('../../src/services/audit.service.js', () => ({ logAuthEvent: vi.fn() }))
vi.mock('../../src/utils/jwt.js', () => ({
  generateTokenPair: (payload: any) => ({
    access_token: `acc-${payload.sub}`,
    refresh_token: `ref-${payload.sub}`,
    expires_in: 3600
  })
}))

import otpRoutes from '../../src/routes/otp.routes.js'
import { OtpStateCache } from '../../src/services/cache.service.js'
import { supabaseAuth } from '../../db/client.js'
import { logAuthEvent } from '../../src/services/audit.service.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/otp', otpRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OTP Routes - unit', () => {
  it('POST /send - missing email returns 400', async () => {
    const app = createApp()
    const res = await request(app).post('/otp/send').send({})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_EMAIL')
  })

  it('POST /send - invalid email returns 400', async () => {
    const app = createApp()
    const res = await request(app).post('/otp/send').send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_EMAIL')
  })

  it('POST /send - rate limited from supabase returns 429', async () => {
    ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({ error: { message: 'rate limit', status: 429 } })
    const app = createApp()
    const res = await request(app).post('/otp/send').send({ email: 'user@example.com' })
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('OTP_RATE_LIMITED')
  })

  it('POST /send - success returns message', async () => {
    ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({ error: null })
    const app = createApp()
    const res = await request(app).post('/otp/send').send({ email: 'user@example.com' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(logAuthEvent).toHaveBeenCalled()
  })

  it('POST /verify - missing email/token returns 400', async () => {
    const app = createApp()
    const res1 = await request(app).post('/otp/verify').send({ token: '123456' })
    expect(res1.status).toBe(400)
    expect(res1.body.code).toBe('MISSING_EMAIL')

    const res2 = await request(app).post('/otp/verify').send({ email: 'user@example.com' })
    expect(res2.status).toBe(400)
    expect(res2.body.code).toBe('MISSING_TOKEN')
  })

  it('POST /verify - invalid otp returns 400 OTP_INVALID', async () => {
    ;(OtpStateCache.get as any).mockResolvedValue(null)
    ;(supabaseAuth.auth.verifyOtp as any).mockResolvedValue({ data: {}, error: { message: 'Invalid' } })
    const app = createApp()
    const res = await request(app).post('/otp/verify').send({ email: 'user@example.com', token: '000000' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('OTP_INVALID')
    expect(logAuthEvent).toHaveBeenCalled()
  })

  it('POST /verify - success returns tokens and user', async () => {
    const user = { id: 'uid123', email: 'user@example.com', role: 'authenticated', user_metadata: {} }
    const session = { } // minimal
    ;(supabaseAuth.auth.verifyOtp as any).mockResolvedValue({ data: { user, session }, error: null })
    ;(OtpStateCache.get as any).mockResolvedValue({ email: 'user@example.com', type: 'email', platform: 'cli' })

    const app = createApp()
    const res = await request(app).post('/otp/verify').send({ email: 'user@example.com', token: '000000' })
    expect(res.status).toBe(200)
    expect(res.body.access_token).toBe('acc-uid123')
    expect(res.body.refresh_token).toBe('ref-uid123')
    expect(res.body.user.email).toBe('user@example.com')
  })

  it('POST /resend - missing email returns 400', async () => {
    const app = createApp()
    const res = await request(app).post('/otp/resend').send({})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_EMAIL')
  })

  it('POST /resend - rate limited from supabase returns 429', async () => {
    ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({ error: { message: 'rate limit', status: 429 } })
    const app = createApp()
    const res = await request(app).post('/otp/resend').send({ email: 'user@example.com' })
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('OTP_RATE_LIMITED')
  })

  it('POST /resend - success returns message', async () => {
    ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({ error: null })
    const app = createApp()
    const res = await request(app).post('/otp/resend').send({ email: 'user@example.com' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})