import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'

// Mock the dependencies
vi.mock('../../src/utils/jwt.js', () => ({
  verifyToken: vi.fn(),
  extractBearerToken: vi.fn()
}))

vi.mock('../../src/services/api-key.service.js', () => ({
  validateAPIKey: vi.fn()
}))

const mockGetUserById = vi.fn()

vi.mock('../../db/client.js', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: mockGetUserById
      }
    }
  }
}))

import { verifyToken, extractBearerToken } from '../../src/utils/jwt.js'
import { validateAPIKey } from '../../src/services/api-key.service.js'

// Import after mocks are set up
const authModule = await import('../../src/middleware/auth.js')
const { requireAuth, requireScope, requireScopes, requireAllScopes, optionalAuth, hasScope } = authModule

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
    mockReq = {
      headers: {}
    }
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    }
    mockNext = vi.fn()
  })

  describe('requireAuth', () => {
    it('should authenticate with valid JWT token', async () => {
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        project_scope: 'lanonasis-maas',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600
      }

      ;(extractBearerToken as any).mockReturnValue('valid-token')
      ;(verifyToken as any).mockReturnValue(mockPayload)

      await requireAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.user).toEqual(mockPayload)
      expect(mockReq.scopes).toEqual(['*'])
    })

    it('should return 401 when no token or API key provided', async () => {
      (extractBearerToken as any).mockReturnValue(null)

      await requireAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No token provided',
        code: 'AUTH_TOKEN_MISSING'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    // TODO: This test requires dynamic import mocking which doesn't work reliably with ESM
    it.skip('should try API key when JWT is invalid', async () => {
      ;(extractBearerToken as any).mockReturnValue('invalid-token')
      ;(verifyToken as any).mockImplementation(() => {
        throw new Error('Invalid token')
      })
      
      mockReq.headers = { 'x-api-key': 'lano_test_key' }
      ;(validateAPIKey as any).mockResolvedValue({
        valid: true,
        userId: 'user-456',
        permissions: ['memories.read'],
        projectScope: 'test-project'
      })

      // Mock the Supabase getUserById call
      mockGetUserById.mockResolvedValue({
        data: {
          user: {
            email: 'apikey@example.com',
            user_metadata: { role: 'admin' }
          }
        },
        error: null
      })

      await requireAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(validateAPIKey).toHaveBeenCalledWith('lano_test_key')
      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.user).toBeDefined()
      expect(mockReq.user?.sub).toBe('user-456')
      expect(mockReq.user?.email).toBe('apikey@example.com')
      expect(mockReq.scopes).toEqual(['memories.read'])
    })

    it('should return 401 when API key validation fails', async () => {
      (extractBearerToken as any).mockReturnValue(null)
      mockReq.headers = { 'x-api-key': 'invalid_key' }
      ;(validateAPIKey as any).mockResolvedValue({
        valid: false,
        userId: null,
        permissions: [],
        projectScope: null
      })

      await requireAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('requireScope', () => {
    it('should pass when user has matching scope', () => {
      mockReq.user = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        project_scope: 'lanonasis-maas',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600
      }

      const middleware = requireScope('lanonasis-maas')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should return 403 when scope does not match', () => {
      mockReq.user = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        project_scope: 'other-project',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600
      }

      const middleware = requireScope('lanonasis-maas')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'SCOPE_INSUFFICIENT'
      }))
    })

    it('should return 401 when no user is attached', () => {
      const middleware = requireScope('lanonasis-maas')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'AUTH_REQUIRED'
      }))
    })
  })

  describe('requireScopes', () => {
    beforeEach(() => {
      mockReq.user = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        project_scope: 'lanonasis-maas',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600
      }
    })

    it('should pass when user has exact scope', () => {
      mockReq.scopes = ['memories.read']

      const middleware = requireScopes('memories.read')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should pass when user has wildcard scope', () => {
      mockReq.scopes = ['*']

      const middleware = requireScopes('memories.read')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should pass when user has resource wildcard scope', () => {
      mockReq.scopes = ['memories.*']

      const middleware = requireScopes('memories.read')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should pass with legacy.full_access scope', () => {
      mockReq.scopes = ['legacy.full_access']

      const middleware = requireScopes('memories.read')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should pass when user has any of multiple required scopes', () => {
      mockReq.scopes = ['memories.write']

      const middleware = requireScopes('memories.read', 'memories.write')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should return 403 when user lacks required scope', () => {
      mockReq.scopes = ['profile.read']

      const middleware = requireScopes('memories.read')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'SCOPE_INSUFFICIENT',
        required: ['memories.read'],
        provided: ['profile.read']
      }))
    })

    it('should use legacy.full_access as default when no scopes set', () => {
      mockReq.scopes = undefined

      const middleware = requireScopes('memories.read')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('requireAllScopes', () => {
    beforeEach(() => {
      mockReq.user = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        project_scope: 'lanonasis-maas',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600
      }
    })

    it('should pass when user has all required scopes', () => {
      mockReq.scopes = ['memories.read', 'memories.write', 'profile.read']

      const middleware = requireAllScopes('memories.read', 'memories.write')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should return 403 when user is missing some scopes', () => {
      mockReq.scopes = ['memories.read']

      const middleware = requireAllScopes('memories.read', 'memories.write')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'SCOPE_INSUFFICIENT',
        missing: ['memories.write']
      }))
    })

    it('should pass with wildcard scope', () => {
      mockReq.scopes = ['*']

      const middleware = requireAllScopes('memories.read', 'profile.write')
      middleware(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('optionalAuth', () => {
    it('should attach user when valid token provided', async () => {
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        project_scope: 'lanonasis-maas',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600
      }

      ;(extractBearerToken as any).mockReturnValue('valid-token')
      ;(verifyToken as any).mockReturnValue(mockPayload)

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.user).toEqual(mockPayload)
    })

    it('should continue without user when no token provided', async () => {
      (extractBearerToken as any).mockReturnValue(null)

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.user).toBeUndefined()
    })

    it('should continue without user when token is invalid', async () => {
      ;(extractBearerToken as any).mockReturnValue('invalid-token')
      ;(verifyToken as any).mockImplementation(() => {
        throw new Error('Invalid token')
      })

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.user).toBeUndefined()
    })
  })

  describe('hasScope', () => {
    it('should return true for exact scope match', () => {
      mockReq.scopes = ['memories.read']
      expect(hasScope(mockReq as Request, 'memories.read')).toBe(true)
    })

    it('should return true for wildcard scope', () => {
      mockReq.scopes = ['*']
      expect(hasScope(mockReq as Request, 'memories.read')).toBe(true)
    })

    it('should return true for resource wildcard', () => {
      mockReq.scopes = ['memories.*']
      expect(hasScope(mockReq as Request, 'memories.read')).toBe(true)
    })

    it('should return false when scope not present', () => {
      mockReq.scopes = ['profile.read']
      expect(hasScope(mockReq as Request, 'memories.read')).toBe(false)
    })

    it('should use legacy.full_access as default', () => {
      mockReq.scopes = undefined
      expect(hasScope(mockReq as Request, 'memories.read')).toBe(true)
    })
  })
})
