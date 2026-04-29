import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSignInWithPassword = vi.fn()
const mockGenerateTokenPairWithUAI = vi.fn()
const mockCreateSession = vi.fn()
const mockUpsertUserAccount = vi.fn()
const mockLogAuthEvent = vi.fn()
const mockResolveProjectScope = vi.fn()

vi.mock('../../db/client.js', () => ({
  supabaseUsers: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  },
  supabaseAdmin: {
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
  dbPool: {
    query: vi.fn(),
  },
}))

vi.mock('../../src/utils/jwt.js', () => ({
  generateTokenPairWithUAI: mockGenerateTokenPairWithUAI,
  verifyToken: vi.fn(),
  extractBearerToken: vi.fn(),
}))

vi.mock('../../src/services/session.service.js', () => ({
  createSession: mockCreateSession,
  revokeSession: vi.fn(),
  getUserSessions: vi.fn(),
  findSessionByToken: vi.fn(),
}))

vi.mock('../../src/services/user.service.js', () => ({
  upsertUserAccount: mockUpsertUserAccount,
  findUserAccountById: vi.fn(),
  resolveOrganizationIdForUser: vi.fn(),
}))

vi.mock('../../src/services/audit.service.js', () => ({
  logAuthEvent: mockLogAuthEvent,
}))

vi.mock('../../src/services/project-scope.service.js', () => ({
  resolveProjectScope: mockResolveProjectScope,
}))

vi.mock('../../src/services/uai-session-cache.service.js', () => ({
  resolveUAICached: vi.fn(),
}))

vi.mock('../../src/services/cache.service.js', () => ({
  OAuthStateCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}))

const { login } = await import('../../src/controllers/auth.controller.ts')
const { requireObjectBody } = await import('../../src/middleware/body.ts')

function createApp() {
  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(requireObjectBody)
  app.post('/v1/auth/login', login)

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if ((err as Error & { type?: string }).type === 'entity.parse.failed') {
      return res.status(400).json({
        error: 'Request body is invalid',
        code: 'INVALID_BODY',
      })
    }

    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  })

  return app
}

describe('request body validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockResolveProjectScope.mockResolvedValue({
      scope: 'lanonasis-maas',
      validated: false,
      reason: 'fallback_scope',
    })

    mockGenerateTokenPairWithUAI.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    })

    mockCreateSession.mockResolvedValue({
      id: 'session-123',
    })

    mockUpsertUserAccount.mockResolvedValue(undefined)
    mockLogAuthEvent.mockResolvedValue(undefined)
  })

  it('returns 400 INVALID_BODY for a bare POST with no body', async () => {
    const app = createApp()

    const response = await request(app)
      .post('/v1/auth/login')
      .expect(400)

    expect(response.body).toEqual({
      error: 'Request body is required',
      code: 'INVALID_BODY',
    })
  })

  it('returns 400 INVALID_BODY for application/json with an empty payload', async () => {
    const app = createApp()

    const response = await request(app)
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('')
      .expect(400)

    expect(response.body.code).toBe('INVALID_BODY')
  })

  it('preserves MISSING_CREDENTIALS for an empty JSON object', async () => {
    const app = createApp()

    const response = await request(app)
      .post('/v1/auth/login')
      .send({})
      .expect(400)

    expect(response.body).toEqual({
      error: 'Email and password are required',
      code: 'MISSING_CREDENTIALS',
    })
  })

  it('allows a valid login payload through to the handler', async () => {
    const app = createApp()

    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user@example.com',
          role: 'authenticated',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          last_sign_in_at: new Date().toISOString(),
        },
      },
      error: null,
    })

    const response = await request(app)
      .post('/v1/auth/login')
      .send({
        email: 'user@example.com',
        password: 'password123',
      })
      .expect(200)

    expect(response.body).toMatchObject({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: {
        email: 'user@example.com',
        project_scope: 'lanonasis-maas',
      },
    })
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    })
  })
})
