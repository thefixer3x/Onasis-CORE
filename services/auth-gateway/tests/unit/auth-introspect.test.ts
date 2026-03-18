import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../db/client.js', () => ({
  supabaseUsers: {
    auth: {
      admin: {
        updateUserById: vi.fn(),
        getUserById: vi.fn(),
      },
      getUser: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      exchangeCodeForSession: vi.fn(),
    },
  },
}))

vi.mock('../../src/utils/jwt.js', () => ({
  generateTokenPairWithUAI: vi.fn(),
  verifyToken: vi.fn(),
  extractBearerToken: vi.fn((authHeader?: string) => {
    if (!authHeader) return undefined
    return authHeader.replace(/^Bearer\s+/i, '')
  }),
}))

vi.mock('../../src/services/session.service.js', () => ({
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  getUserSessions: vi.fn(),
  findSessionByToken: vi.fn(),
}))

vi.mock('../../src/services/user.service.js', () => ({
  upsertUserAccount: vi.fn(),
  findUserAccountById: vi.fn(),
}))

vi.mock('../../src/services/audit.service.js', () => ({
  logAuthEvent: vi.fn(),
}))

vi.mock('../../src/utils/correlation.js', () => ({
  auditCorrelation: vi.fn(() => ({})),
}))

vi.mock('../../src/services/api-key.service.js', () => ({
  validateAPIKey: vi.fn(),
}))

vi.mock('../../src/services/cache.service.js', () => ({
  OAuthStateCache: {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../src/services/project-scope.service.js', () => ({
  resolveProjectScope: vi.fn(),
}))

vi.mock('../../src/services/uai-session-cache.service.js', () => ({
  resolveUAICached: vi.fn(),
}))

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { logAuthEvent } from '../../src/services/audit.service.js'
import { validateAPIKey } from '../../src/services/api-key.service.js'
import { resolveProjectScope } from '../../src/services/project-scope.service.js'
import { resolveUAICached } from '../../src/services/uai-session-cache.service.js'

const { introspectIdentity } = await import('../../src/controllers/auth.controller.ts')

type MockResponse = Response & {
  statusCode: number
  body?: unknown
  headers: Record<string, string>
}

function createMockResponse(): MockResponse {
  const response = {
    statusCode: 200,
    body: undefined,
    headers: {},
    set(key: string, value: string) {
      this.headers[key] = value
      return this
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }

  return response as unknown as MockResponse
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    headers: {},
    cookies: {},
    ip: '127.0.0.1',
    requestId: undefined,
    get: vi.fn((header: string) => (header.toLowerCase() === 'user-agent' ? 'vitest' : undefined)),
    ...overrides,
  } as unknown as Request
}

describe('Auth Introspection Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(validateAPIKey).mockResolvedValue({
      valid: false,
    } as Awaited<ReturnType<typeof validateAPIKey>>)

    vi.mocked(resolveProjectScope).mockResolvedValue({
      scope: null,
      validated: false,
      reason: 'missing_scope',
    })

    vi.mocked(resolveUAICached).mockResolvedValue({
      authId: 'auth-123',
      organizationId: 'org-123',
      credentialId: 'cred-123',
      email: 'test@example.com',
      fromCache: false,
    })
  })

  it('returns a normalized identity envelope for a valid API key', async () => {
    vi.mocked(validateAPIKey).mockResolvedValue({
      valid: true,
      userId: 'user-123',
      organizationId: 'org-123',
      keyId: 'key-123',
      projectScope: 'fallback-project',
      permissions: ['memory:read'],
    } as Awaited<ReturnType<typeof validateAPIKey>>)

    vi.mocked(resolveProjectScope).mockResolvedValue({
      scope: 'project-alpha',
      validated: true,
      reason: 'requested_scope',
    })

    const req = createMockRequest({
      body: {
        credential: 'internal-api-key',
        type: 'api_key',
        project_scope: 'project-alpha',
        platform: 'cli',
      },
    })
    const res = createMockResponse()

    await introspectIdentity(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['X-Request-ID']).toBeTruthy()
    expect(res.body).toMatchObject({
      valid: true,
      identity: {
        actor_id: 'auth-123',
        actor_type: 'user',
        user_id: 'user-123',
        organization_id: 'org-123',
        project_scope: 'project-alpha',
        api_key_id: 'key-123',
        auth_source: 'api_key',
        credential_id: 'cred-123',
        email: 'test@example.com',
        scopes: ['memory:read'],
      },
      error: null,
    })

    expect(logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'introspect_success',
        success: true,
        organization_id: 'org-123',
        api_key_id: 'key-123',
        auth_source: 'api_key',
        project_scope: 'project-alpha',
      })
    )
  })

  it('rejects unauthorized project scopes with a 403 response', async () => {
    vi.mocked(validateAPIKey).mockResolvedValue({
      valid: true,
      userId: 'user-123',
      organizationId: 'org-123',
      keyId: 'key-123',
      projectScope: 'fallback-project',
      permissions: ['memory:read'],
    } as Awaited<ReturnType<typeof validateAPIKey>>)

    vi.mocked(resolveProjectScope).mockResolvedValue({
      scope: null,
      validated: false,
      reason: 'requested_scope_denied',
    })

    const req = createMockRequest({
      body: {
        credential: 'internal-api-key',
        type: 'api_key',
        project_scope: 'project-denied',
      },
    })
    const res = createMockResponse()

    await introspectIdentity(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({
      valid: false,
      identity: null,
      error: {
        code: 'unauthorized_project_scope',
      },
    })

    expect(logAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'introspect_failed',
        success: false,
      })
    )
  })

  it('rejects requests that provide both credential and token', async () => {
    const req = createMockRequest({
      body: {
        credential: 'key-one',
        token: 'token-two',
        type: 'auto',
      },
    })
    const res = createMockResponse()

    await introspectIdentity(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({
      valid: false,
      identity: null,
      error: {
        code: 'invalid_request',
      },
    })
  })
})
