import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import type { SupabaseClient } from '@supabase/supabase-js';

// NOTE: Integration tests are skipped due to ESM module loading issues with vi.mock()
// The mocks don't apply before the module graph resolves, causing "Cannot access before initialization" errors
// TODO: Refactor to use dynamic imports or convert to proper integration tests with real mocks
import express from 'express'

const mockRedisClient = {
  setex: vi.fn(),
  get: vi.fn(),
  del: vi.fn()
};

const mockSupabaseAuth = {
  auth: {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    getUser: vi.fn(),
    admin: { updateUserById: vi.fn() }
  }
};

const mockUpsertUserAccount = vi.fn();
const mockCreateSession = vi.fn();
const mockLogAuthEvent = vi.fn();
const mockGenerateTokenPair = vi.fn((payload) => ({
  access_token: `acc-${payload.sub}`,
  refresh_token: `ref-${payload.sub}`,
  expires_in: 3600
}));

vi.mock('../../src/services/cache.service.js', () => ({
  redisClient: mockRedisClient,
}))

vi.mock('../../db/client.js', () => ({
  supabaseAuth: mockSupabaseAuth,
}))

vi.mock('../../src/services/user.service.js', () => ({ upsertUserAccount: mockUpsertUserAccount }))
vi.mock('../../src/services/session.service.js', () => ({ createSession: mockCreateSession }))
vi.mock('../../src/services/audit.service.js', () => ({ logAuthEvent: mockLogAuthEvent }))
vi.mock('../../src/utils/jwt.js', () => ({
  generateTokenPair: mockGenerateTokenPair,
}))

describe('OTP Integration Tests', () => {
  let otpRoutes: RequestHandler;
  let redisClient: Redis;
  let supabaseAuth: SupabaseClient;

  beforeEach(async () => {
    // Import and initialize routes properly
    const otpModule = await import('../../src/routes/otp.routes.js');
    const cacheModule = await import('../../src/services/cache.service.js');
    const dbModule = await import('../../db/client.js');
    
    otpRoutes = otpModule.default;
    redisClient = cacheModule.redisClient;
    supabaseAuth = dbModule.supabaseAuth;
    
    // Type-safe mock implementations
    (redisClient as any).setex = vi.fn();
    (redisClient as any).get = vi.fn();
    (redisClient as any).del = vi.fn();
    
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // No async teardown needed
  })

  function createApp() {
    const app = express()
    app.use(express.json())
    app.use('/otp', otpRoutes)
    return app
  }

  it('magic-link send stores state and calls supabase with redirect', async () => {
    ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({ error: null })
    const app = createApp()
    const res = await request(app)
      .post('/otp/send')
      .send({ email: 'user@example.com', type: 'magiclink', redirect_uri: 'https://app.example.com/cb' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // state should be stored with setex
    expect(redisClient.setex).toHaveBeenCalled()
    // validate supabase called with options including emailRedirectTo
    const called = (supabaseAuth.auth.signInWithOtp as any).mock.calls[0][0]
    expect(called.email).toBe('user@example.com')
    expect(called.options.emailRedirectTo).toBe('https://app.example.com/cb')
  })

  it('magic-link verify uses stored state and returns tokens', async () => {
    const user = { id: 'uid-abc', email: 'user@example.com', role: 'authenticated', user_metadata: {} }
    const session = {}
    ;(redisClient.get as any).mockResolvedValue(JSON.stringify({ email: 'user@example.com', type: 'magiclink', platform: 'web', redirect_uri: 'https://app.example.com' }))
    ;(supabaseAuth.auth.verifyOtp as any).mockResolvedValue({ data: { user, session }, error: null })

    const app = createApp()
    const res = await request(app).post('/otp/verify').send({ email: 'user@example.com', token: 'magic-token', type: 'magiclink' })
    expect(res.status).toBe(200)
    expect(res.body.access_token).toBe('acc-uid-abc')
    expect(res.body.user.email).toBe('user@example.com')
  })

  // ============================================================================
  // Edge Case Tests
  // ============================================================================

  describe('OTP Routes - Edge Cases', () => {
    it('should reject verify with expired/missing state gracefully', async () => {
      // Simulate expired state (redis returns null)
      ;(redisClient.get as any).mockResolvedValue(null)
      ;(supabaseAuth.auth.verifyOtp as any).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Token has expired or is invalid' }
      })

      const app = createApp()
      const res = await request(app)
        .post('/otp/verify')
        .send({ email: 'user@example.com', token: '123456', type: 'email' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('OTP_INVALID')
      expect(res.body.error).toContain('Invalid or expired')
    })

    it('should reject verify with mismatched email', async () => {
      // State stored for different email
      ;(redisClient.get as any).mockResolvedValue(JSON.stringify({
        email: 'original@example.com',
        type: 'email',
        platform: 'cli',
        created_at: Date.now()
      }))
      ;(supabaseAuth.auth.verifyOtp as any).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid token for this email' }
      })

      const app = createApp()
      const res = await request(app)
        .post('/otp/verify')
        .send({ email: 'different@example.com', token: '123456', type: 'email' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('OTP_INVALID')
    })

    it('should handle Supabase rate limiting on send', async () => {
      ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({
        error: { message: 'rate limit exceeded', status: 429 }
      })

      const app = createApp()
      const res = await request(app)
        .post('/otp/send')
        .send({ email: 'user@example.com', type: 'email' })

      expect(res.status).toBe(429)
      expect(res.body.code).toBe('OTP_RATE_LIMITED')
      expect(res.body.retry_after).toBeDefined()
    })

    it('should handle Supabase rate limiting on resend', async () => {
      ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({
        error: { message: 'rate limit', status: 429 }
      })

      const app = createApp()
      const res = await request(app)
        .post('/otp/resend')
        .send({ email: 'user@example.com', type: 'email' })

      expect(res.status).toBe(429)
      expect(res.body.code).toBe('OTP_RATE_LIMITED')
    })

    it('should validate email format on send', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/otp/send')
        .send({ email: 'not-an-email', type: 'email' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_EMAIL')
    })

    it('should validate redirect_uri format for magic link', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/otp/send')
        .send({ email: 'user@example.com', type: 'magiclink', redirect_uri: 'not-a-url' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_REDIRECT_URI')
    })

    it('should require email on verify', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/otp/verify')
        .send({ token: '123456' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('MISSING_EMAIL')
    })

    it('should require token on verify', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/otp/verify')
        .send({ email: 'user@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('MISSING_TOKEN')
    })

    it('should normalize platform to cli by default', async () => {
      ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({ error: null })

      const app = createApp()
      await request(app)
        .post('/otp/send')
        .send({ email: 'user@example.com' })

      // Check that state was stored with platform: 'cli'
      const storeCall = (redisClient.setex as any).mock.calls[0]
      const storedData = JSON.parse(storeCall[2])
      expect(storedData.platform).toBe('cli')
    })

    it('should normalize OTP type to email by default', async () => {
      ;(supabaseAuth.auth.signInWithOtp as any).mockResolvedValue({ error: null })

      const app = createApp()
      await request(app)
        .post('/otp/send')
        .send({ email: 'user@example.com' })

      const storeCall = (redisClient.setex as any).mock.calls[0]
      const storedData = JSON.parse(storeCall[2])
      expect(storedData.type).toBe('email')
    })
  })
})