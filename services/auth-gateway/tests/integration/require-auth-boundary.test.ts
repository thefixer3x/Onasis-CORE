/**
 * Boundary-Mocked requireAuth Integration Test
 *
 * Only mocks the DB boundary (db/client.js) — all auth services run real logic.
 * - JWT signing/verification is real (jsonwebtoken + env.JWT_SECRET)
 * - Session lookup is mocked at the pg pool level
 * - Org resolution is mocked at the Supabase client level
 * - API key hashing/comparison uses real crypto
 *
 * This catches regressions where internal refactors break the real code path
 * but all mocks return success.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

const mockDbHelper = vi.hoisted(() => {
  const mockRelease = vi.fn()
  const mockQuery = vi.fn()
  const mockConnect = vi.fn().mockResolvedValue({ query: mockQuery, release: mockRelease })

  const mockMaybeSingle = vi.fn()
  const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

  const mockGetUserById = vi.fn()

  return {
    pool: { connect: mockConnect },
    supabaseAdmin: { from: mockFrom },
    supabaseUsers: {
      auth: { admin: { getUserById: mockGetUserById } },
      from: mockFrom,
    },
    _: { mockQuery, mockRelease, mockConnect, mockFrom, mockSelect, mockEq, mockMaybeSingle, mockGetUserById },
  }
})

vi.mock('../../db/client.js', () => ({
  dbPool: mockDbHelper.pool,
  supabaseAdmin: mockDbHelper.supabaseAdmin,
  supabaseUsers: mockDbHelper.supabaseUsers,
}))

import { requireAuth } from '../../src/middleware/auth.js'

describe('requireAuth boundary test (only DB mocked)', () => {
  let app: express.Application
  let validToken: string

  beforeAll(() => {
    const secret = process.env.JWT_SECRET!
    validToken = jwt.sign(
      {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        project_scope: 'lanonasis-maas',
        organization_id: 'org-123',
      },
      secret,
      { expiresIn: '1h' }
    )

    app = express()
    app.get('/test-auth', requireAuth, (req: any, res: any) => {
      res.json({ user: req.user, scopes: req.scopes })
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockDbHelper._.mockMaybeSingle.mockReset()
    mockDbHelper._.mockGetUserById.mockReset()
  })

  it('authenticates a valid JWT with real signing/verification', async () => {
    mockDbHelper._.mockQuery.mockResolvedValue({
      rows: [{ id: 'session-123', user_id: 'user-123' }],
    })
    mockDbHelper._.mockMaybeSingle.mockResolvedValue({
      data: { organization_id: 'org-123' },
      error: null,
    })

    const res = await request(app)
      .get('/test-auth')
      .set('Authorization', `Bearer ${validToken}`)

    expect(res.status).toBe(200)
    expect(res.body.user).toBeDefined()
    expect(res.body.user.email).toBe('test@example.com')
    expect(res.body.user.sub).toBe('user-123')
    expect(res.body.user.organizationId).toBe('org-123')
    expect(res.body.user.authSource).toBe('jwt')
    expect(res.body.scopes).toEqual(['*'])
  })

  it('returns 401 when session is revoked (DB returns no rows)', async () => {
    mockDbHelper._.mockQuery.mockResolvedValue({ rows: [] })

    const res = await request(app)
      .get('/test-auth')
      .set('Authorization', `Bearer ${validToken}`)

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('SESSION_INVALID')
  })

  it('returns 503 when session lookup fails', async () => {
    mockDbHelper._.mockQuery.mockRejectedValue(new Error('db connection refused'))

    const res = await request(app)
      .get('/test-auth')
      .set('Authorization', `Bearer ${validToken}`)

    expect(res.status).toBe(503)
    expect(res.body.code).toBe('SESSION_UNAVAILABLE')
  })

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/test-auth')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('AUTH_TOKEN_MISSING')
  })

  it('returns 401 when JWT is invalid and no API key provided', async () => {
    const res = await request(app)
      .get('/test-auth')
      .set('Authorization', 'Bearer bad-token')

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('AUTH_TOKEN_MISSING')
  })
})
