import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

vi.mock('../../src/utils/jwt.js', () => ({
  verifyToken: vi.fn()
}))

vi.mock('../../src/services/session.service.js', () => ({
  findSessionByToken: vi.fn()
}))

import { verifyToken } from '../../src/utils/jwt.js'
import { findSessionByToken } from '../../src/services/session.service.js'

const sessionModule = await import('../../src/middleware/session.js')
const { validateSessionCookie } = sessionModule

describe('Session Cookie Middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
    mockReq = {
      cookies: {}
    }
    mockRes = {
      clearCookie: vi.fn()
    }
    mockNext = vi.fn()
  })

  it('should skip when no session cookie is present', async () => {
    await validateSessionCookie(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.clearCookie).not.toHaveBeenCalled()
  })

  it('should attach user when session is valid', async () => {
    const mockPayload = {
      sub: 'user-123',
      email: 'test@example.com',
      role: 'authenticated',
      project_scope: 'lanonasis-maas',
      iat: Date.now() / 1000,
      exp: Date.now() / 1000 + 3600
    }

    mockReq.cookies = { lanonasis_session: 'valid-session-token' }
    ;(verifyToken as any).mockReturnValue(mockPayload)
    ;(findSessionByToken as any).mockResolvedValue({ id: 'session-123' })

    await validateSessionCookie(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockReq.user).toMatchObject({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'authenticated',
      project_scope: 'lanonasis-maas'
    })
    expect(mockRes.clearCookie).not.toHaveBeenCalled()
  })

  it('should clear cookies when session is revoked', async () => {
    const mockPayload = {
      sub: 'user-123',
      email: 'test@example.com',
      role: 'authenticated',
      project_scope: 'lanonasis-maas',
      iat: Date.now() / 1000,
      exp: Date.now() / 1000 + 3600
    }

    mockReq.cookies = { lanonasis_session: 'revoked-token' }
    ;(verifyToken as any).mockReturnValue(mockPayload)
    ;(findSessionByToken as any).mockResolvedValue(null)

    await validateSessionCookie(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.clearCookie).toHaveBeenCalledWith('lanonasis_session', expect.any(Object))
    expect(mockRes.clearCookie).toHaveBeenCalledWith('lanonasis_user', expect.any(Object))
    expect(mockReq.user).toBeUndefined()
  })
})
