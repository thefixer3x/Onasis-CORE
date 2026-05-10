import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// Constructed once with real Date.now() before any fake-timer tests run
const validPayload = {
  sub: 'user-123',
  email: 'test@example.com',
  role: 'authenticated',
  project_scope: 'lanonasis-maas',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600
}

describe('Session Cookie Middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
    mockReq = { cookies: {} }
    mockRes = { clearCookie: vi.fn() }
    mockNext = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should skip when no session cookie is present', async () => {
    await validateSessionCookie(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.clearCookie).not.toHaveBeenCalled()
  })

  it('should attach user when session is valid', async () => {
    mockReq.cookies = { lanonasis_session: 'valid-session-token' }
    ;(verifyToken as any).mockReturnValue(validPayload)
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

  it('should clear cookies when session is revoked (DB returns null)', async () => {
    mockReq.cookies = { lanonasis_session: 'revoked-token' }
    ;(verifyToken as any).mockReturnValue(validPayload)
    ;(findSessionByToken as any).mockResolvedValue(null)

    await validateSessionCookie(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.clearCookie).toHaveBeenCalledWith('lanonasis_session', expect.any(Object))
    expect(mockRes.clearCookie).toHaveBeenCalledWith('lanonasis_user', expect.any(Object))
    expect(mockReq.user).toBeUndefined()
  })

  it('should clear cookies and skip DB when JWT is invalid or tampered', async () => {
    mockReq.cookies = { lanonasis_session: 'tampered-token' }
    ;(verifyToken as any).mockImplementation(() => { throw new Error('invalid signature') })

    await validateSessionCookie(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.clearCookie).toHaveBeenCalledWith('lanonasis_session', expect.any(Object))
    expect(mockRes.clearCookie).toHaveBeenCalledWith('lanonasis_user', expect.any(Object))
    expect(mockReq.user).toBeUndefined()
    expect(findSessionByToken).not.toHaveBeenCalled()
  })

  it('should clear cookies and skip DB when JWT is expired', async () => {
    // Use real Date.now() — no fake timers needed for expiry check
    const expiredPayload = { ...validPayload, exp: Math.floor(Date.now() / 1000) - 60 }
    mockReq.cookies = { lanonasis_session: 'expired-token' }
    ;(verifyToken as any).mockReturnValue(expiredPayload)

    await validateSessionCookie(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.clearCookie).toHaveBeenCalledWith('lanonasis_session', expect.any(Object))
    expect(mockRes.clearCookie).toHaveBeenCalledWith('lanonasis_user', expect.any(Object))
    expect(mockReq.user).toBeUndefined()
    expect(findSessionByToken).not.toHaveBeenCalled()
  })

  it('should preserve cookie and attach user when DB throws an error', async () => {
    mockReq.cookies = { lanonasis_session: 'valid-session-token' }
    ;(verifyToken as any).mockReturnValue(validPayload)
    ;(findSessionByToken as any).mockRejectedValue(new Error('connection refused'))

    await validateSessionCookie(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.clearCookie).not.toHaveBeenCalled()
    expect(mockReq.user).toMatchObject({ sub: 'user-123' })
  })

  it('should preserve cookie and attach user when DB lookup times out', async () => {
    // Fake timers scoped to this test only — avoids interfering with Promise microtasks in others
    vi.useFakeTimers()
    mockReq.cookies = { lanonasis_session: 'valid-session-token' }
    ;(verifyToken as any).mockReturnValue(validPayload)
    ;(findSessionByToken as any).mockImplementation(() => new Promise(() => {})) // never resolves

    const middlewarePromise = validateSessionCookie(
      mockReq as Request,
      mockRes as Response,
      mockNext
    )
    // advanceTimersByTimeAsync advances fake clock AND flushes pending microtasks
    await vi.advanceTimersByTimeAsync(3001)
    await middlewarePromise

    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.clearCookie).not.toHaveBeenCalled()
    expect(mockReq.user).toMatchObject({ sub: 'user-123' })
  })
})
