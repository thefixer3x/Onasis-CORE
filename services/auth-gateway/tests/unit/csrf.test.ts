import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'

// Mock the env config
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test'
  }
}))

const csrfRecords = new Map<string, { created: number; clientId?: string; sessionId?: string }>()

vi.mock('../../src/services/csrf-store.js', () => ({
  PostgresCSRFStore: {
    set: vi.fn(async (token: string, data: { created: number; clientId?: string; sessionId?: string }) => {
      csrfRecords.set(token, data)
    }),
    consume: vi.fn(async (token: string) => {
      const record = csrfRecords.get(token) ?? null
      if (record) {
        csrfRecords.delete(token)
      }
      return record
    })
  }
}))

import {
  generateCSRFToken,
  validateCSRFTokenAsync,
  generateAuthorizeCSRF,
  validateTokenCSRFAsync,
  enhanceStateParameter,
  doubleSubmitCookie,
  setCSRFCookie
} from '../../src/middleware/csrf.ts'

describe('CSRF Protection', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
    csrfRecords.clear()
    mockReq = {
      method: 'GET',
      query: {},
      body: {},
      cookies: {},
      get: vi.fn()
    }
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis()
    }
    mockNext = vi.fn()
  })

  describe('generateCSRFToken', () => {
    it('should generate a 64-character hex token', () => {
      const token = generateCSRFToken()
      expect(token).toHaveLength(64)
      expect(token).toMatch(/^[a-f0-9]+$/)
    })

    it('should generate unique tokens', () => {
      const token1 = generateCSRFToken()
      const token2 = generateCSRFToken()
      expect(token1).not.toBe(token2)
    })

    it('should store clientId and sessionId', async () => {
      const token = generateCSRFToken('client-123', 'session-456')
      await expect(validateCSRFTokenAsync(token, 'client-123', 'session-456')).resolves.toBe(true)
    })
  })

  describe('validateCSRFTokenAsync', () => {
    it('should validate a valid token', async () => {
      const token = generateCSRFToken()
      await expect(validateCSRFTokenAsync(token)).resolves.toBe(true)
    })

    it('should reject an invalid token', async () => {
      await expect(validateCSRFTokenAsync('invalid-token')).resolves.toBe(false)
    })

    it('should reject token with wrong clientId', async () => {
      const token = generateCSRFToken('client-123')
      await expect(validateCSRFTokenAsync(token, 'wrong-client')).resolves.toBe(false)
    })

    it('should reject token with wrong sessionId', async () => {
      const token = generateCSRFToken(undefined, 'session-123')
      await expect(validateCSRFTokenAsync(token, undefined, 'wrong-session')).resolves.toBe(false)
    })

    it('should be one-time use (token consumed after validation)', async () => {
      const token = generateCSRFToken()
      await expect(validateCSRFTokenAsync(token)).resolves.toBe(true)
      await expect(validateCSRFTokenAsync(token)).resolves.toBe(false) // Second use should fail
    })
  })

  describe('generateAuthorizeCSRF', () => {
    it('should generate CSRF token for authorization requests', () => {
      mockReq.method = 'GET'
      mockReq.query = { response_type: 'code', client_id: 'test-client' }

      generateAuthorizeCSRF(mockReq as Request, mockRes as Response, mockNext)

      expect(mockReq.csrfToken).toBeDefined()
      expect(mockReq.csrfToken).toHaveLength(64)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should skip non-GET requests', () => {
      mockReq.method = 'POST'
      mockReq.query = { response_type: 'code' }

      generateAuthorizeCSRF(mockReq as Request, mockRes as Response, mockNext)

      expect(mockReq.csrfToken).toBeUndefined()
      expect(mockNext).toHaveBeenCalled()
    })

    it('should skip requests without response_type', () => {
      mockReq.method = 'GET'
      mockReq.query = {}

      generateAuthorizeCSRF(mockReq as Request, mockRes as Response, mockNext)

      expect(mockReq.csrfToken).toBeUndefined()
      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('validateTokenCSRFAsync', () => {
    it('should skip non-authorization_code grants', async () => {
      mockReq.body = { grant_type: 'refresh_token' }

      await validateTokenCSRFAsync(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('should allow missing state parameter for compatibility', async () => {
      mockReq.body = { grant_type: 'authorization_code' }

      await validateTokenCSRFAsync(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('should allow plain state without CSRF suffix', async () => {
      mockReq.body = { grant_type: 'authorization_code', state: 'no-dot-separator' }

      await validateTokenCSRFAsync(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.originalState).toBe('no-dot-separator')
    })

    it('should reject invalid CSRF token when suffix is present', async () => {
      mockReq.body = {
        grant_type: 'authorization_code',
        state: 'userState.invalidCsrfToken'
      }

      await validateTokenCSRFAsync(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error_description: 'Invalid or expired CSRF token'
      }))
    })

    it('should validate correct CSRF token and extract user state', async () => {
      const csrfToken = generateCSRFToken('test-client')
      mockReq.body = {
        grant_type: 'authorization_code',
        state: `myUserState.${csrfToken}`,
        client_id: 'test-client'
      }

      await validateTokenCSRFAsync(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockReq.originalState).toBe('myUserState')
    })
  })

  describe('enhanceStateParameter', () => {
    it('should combine user state with CSRF token', () => {
      const result = enhanceStateParameter('myState', 'csrfToken123')
      expect(result).toBe('myState.csrfToken123')
    })
  })

  describe('doubleSubmitCookie', () => {
    it('should skip GET requests', () => {
      mockReq.method = 'GET'

      doubleSubmitCookie(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should skip OPTIONS requests', () => {
      mockReq.method = 'OPTIONS'

      doubleSubmitCookie(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should skip in non-production environment', () => {
      mockReq.method = 'POST'

      doubleSubmitCookie(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('setCSRFCookie', () => {
    it('should set CSRF cookie on GET requests without existing cookie', () => {
      mockReq.method = 'GET'
      mockReq.cookies = {}

      setCSRFCookie(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'csrf-token',
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          sameSite: 'strict',
          maxAge: 15 * 60 * 1000
        })
      )
      expect(mockNext).toHaveBeenCalled()
    })

    it('should not set cookie if already exists', () => {
      mockReq.method = 'GET'
      mockReq.cookies = { 'csrf-token': 'existing-token' }

      setCSRFCookie(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.cookie).not.toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalled()
    })

    it('should not set cookie on non-GET requests', () => {
      mockReq.method = 'POST'
      mockReq.cookies = {}

      setCSRFCookie(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.cookie).not.toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalled()
    })
  })
})
