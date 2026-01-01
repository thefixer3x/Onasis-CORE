import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'

// Mock the env config
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test'
  }
}))

import {
  generateCSRFToken,
  validateCSRFToken,
  generateAuthorizeCSRF,
  validateTokenCSRF,
  enhanceStateParameter,
  doubleSubmitCookie,
  setCSRFCookie
} from '../../src/middleware/csrf.js'

describe('CSRF Protection', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
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

    it('should store clientId and sessionId', () => {
      const token = generateCSRFToken('client-123', 'session-456')
      expect(validateCSRFToken(token, 'client-123', 'session-456')).toBe(true)
    })
  })

  describe('validateCSRFToken', () => {
    it('should validate a valid token', () => {
      const token = generateCSRFToken()
      expect(validateCSRFToken(token)).toBe(true)
    })

    it('should reject an invalid token', () => {
      expect(validateCSRFToken('invalid-token')).toBe(false)
    })

    it('should reject token with wrong clientId', () => {
      const token = generateCSRFToken('client-123')
      expect(validateCSRFToken(token, 'wrong-client')).toBe(false)
    })

    it('should reject token with wrong sessionId', () => {
      const token = generateCSRFToken(undefined, 'session-123')
      expect(validateCSRFToken(token, undefined, 'wrong-session')).toBe(false)
    })

    it('should be one-time use (token consumed after validation)', () => {
      const token = generateCSRFToken()
      expect(validateCSRFToken(token)).toBe(true)
      expect(validateCSRFToken(token)).toBe(false) // Second use should fail
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

  describe('validateTokenCSRF', () => {
    it('should skip non-authorization_code grants', () => {
      mockReq.body = { grant_type: 'refresh_token' }

      validateTokenCSRF(mockReq as Request, mockRes as Response, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('should reject missing state parameter', () => {
      mockReq.body = { grant_type: 'authorization_code' }

      validateTokenCSRF(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'invalid_request',
        error_description: 'Missing or invalid state parameter'
      }))
    })

    it('should reject invalid state format', () => {
      mockReq.body = { grant_type: 'authorization_code', state: 'no-dot-separator' }

      validateTokenCSRF(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error_description: 'Invalid state parameter format'
      }))
    })

    it('should reject invalid CSRF token', () => {
      mockReq.body = {
        grant_type: 'authorization_code',
        state: 'userState.invalidCsrfToken'
      }

      validateTokenCSRF(mockReq as Request, mockRes as Response, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error_description: 'Invalid or expired CSRF token'
      }))
    })

    it('should validate correct CSRF token and extract user state', () => {
      const csrfToken = generateCSRFToken('test-client')
      mockReq.body = {
        grant_type: 'authorization_code',
        state: `myUserState.${csrfToken}`,
        client_id: 'test-client'
      }

      validateTokenCSRF(mockReq as Request, mockRes as Response, mockNext)

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
