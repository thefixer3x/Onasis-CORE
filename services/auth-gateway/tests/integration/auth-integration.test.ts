/**
 * Comprehensive Authentication Integration Tests
 * 
 * Tests the complete authentication flow including:
 * - Login with email/password
 * - Session management
 * - Token refresh
 * - Logout
 * - Protected route access
 * - Multi-platform authentication (web, CLI, MCP, API)
 * 
 * These tests use mocked Supabase but test the full auth gateway logic.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock Supabase Admin client
const mockSupabaseAuth = {
  signInWithPassword: vi.fn(),
  getUserById: vi.fn(),
  signOut: vi.fn(),
}

const mockSupabaseAdmin = {
  auth: {
    admin: {
      getUserById: vi.fn(),
    },
    signInWithPassword: mockSupabaseAuth.signInWithPassword,
    signOut: mockSupabaseAuth.signOut,
  },
}

vi.mock('../../db/client.js', () => ({
  supabaseAdmin: mockSupabaseAdmin,
  dbPool: {
    query: vi.fn(),
  },
}))

// Mock JWT utilities
const mockGenerateTokenPair = vi.fn()
const mockVerifyToken = vi.fn()

vi.mock('../../src/utils/jwt.js', () => ({
  generateTokenPair: mockGenerateTokenPair,
  verifyToken: mockVerifyToken,
  extractBearerToken: vi.fn((authHeader?: string) => {
    if (!authHeader) return null
    return authHeader.replace('Bearer ', '')
  }),
}))

// Mock session service
const mockCreateSession = vi.fn()
const mockGetUserSessions = vi.fn()
const mockRevokeSession = vi.fn()

vi.mock('../../src/services/session.service.js', () => ({
  createSession: mockCreateSession,
  revokeSession: mockRevokeSession,
  getUserSessions: mockGetUserSessions,
}))

// Mock audit logging
const mockLogAuthEvent = vi.fn()
vi.mock('../../src/services/audit.service.js', () => ({
  logAuthEvent: mockLogAuthEvent,
}))

// Mock user account service
const mockUpsertUserAccount = vi.fn()
vi.mock('../../src/services/user.service.js', () => ({
  upsertUserAccount: mockUpsertUserAccount,
}))

describe('Auth Gateway Integration Tests', () => {
  let app: express.Application

  beforeAll(async () => {
    // Import app after mocks are set up
    const { default: createApp } = await import('../../src/index.js')
    app = createApp()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default successful responses
    mockGenerateTokenPair.mockReturnValue({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
    })
    
    mockCreateSession.mockResolvedValue({
      id: 'session-123',
      user_id: 'user-123',
      platform: 'web',
      expires_at: new Date(Date.now() + 3600000),
    })
    
    mockGetUserSessions.mockResolvedValue([])
    
    mockUpsertUserAccount.mockResolvedValue({
      user_id: 'user-123',
      email: 'test@example.com',
    })
  })

  describe('POST /v1/auth/login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        last_sign_in_at: new Date().toISOString(),
      }

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: {
          user: mockUser,
          session: {
            access_token: 'supabase-token',
            refresh_token: 'supabase-refresh',
          },
        },
        error: null,
      })

      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
          platform: 'web',
        })
        .expect(200)

      expect(response.body).toHaveProperty('access_token')
      expect(response.body).toHaveProperty('refresh_token')
      expect(response.body).toHaveProperty('user')
      expect(response.body.user.email).toBe('test@example.com')
      
      expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
      expect(mockUpsertUserAccount).toHaveBeenCalled()
      expect(mockCreateSession).toHaveBeenCalled()
      expect(mockLogAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'login_success',
          platform: 'web',
          success: true,
        })
      )
    })

    it('should reject login with invalid credentials', async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      })

      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
        .expect(401)

      expect(response.body).toHaveProperty('error')
      expect(response.body.error).toBe('Invalid credentials')
      expect(response.body.code).toBe('AUTH_INVALID_CREDENTIALS')
      
      expect(mockLogAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'login_failed',
          success: false,
        })
      )
    })

    it('should reject login with missing email', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          password: 'password123',
        })
        .expect(400)

      expect(response.body).toHaveProperty('error')
      expect(response.body.code).toBe('MISSING_CREDENTIALS')
    })

    it('should support different platforms (CLI, MCP, API)', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
      }

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null,
      })

      const platforms = ['cli', 'mcp', 'api', 'web']
      
      for (const platform of platforms) {
        await request(app)
          .post('/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123',
            platform,
          })
          .expect(200)

        expect(mockCreateSession).toHaveBeenCalledWith(
          expect.objectContaining({
            platform,
          })
        )
      }
    })

    it('should support project scope', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
      }

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null,
      })

      await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
          project_scope: 'lanonasis-maas',
        })
        .expect(200)

      expect(mockGenerateTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({
          project_scope: 'lanonasis-maas',
        })
      )
    })
  })

  describe('GET /v1/auth/session', () => {
    it('should return current session with valid token', async () => {
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }

      mockVerifyToken.mockReturnValue(mockPayload)

      const response = await request(app)
        .get('/v1/auth/session')
        .set('Authorization', 'Bearer valid-token')
        .expect(200)

      expect(response.body).toHaveProperty('user')
      expect(response.body.user.id).toBe('user-123')
      expect(response.body.user.email).toBe('test@example.com')
    })

    it('should return 401 with invalid token', async () => {
      mockVerifyToken.mockImplementation(() => {
        throw new Error('Invalid token')
      })

      const response = await request(app)
        .get('/v1/auth/session')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)

      expect(response.body).toHaveProperty('error')
    })

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/v1/auth/session')
        .expect(401)

      expect(response.body).toHaveProperty('error')
    })
  })

  describe('POST /v1/auth/logout', () => {
    it('should successfully logout and revoke session', async () => {
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }

      mockVerifyToken.mockReturnValue(mockPayload)
      mockRevokeSession.mockResolvedValue(true)

      const response = await request(app)
        .post('/v1/auth/logout')
        .set('Authorization', 'Bearer valid-token')
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('revoked', true)
      expect(mockRevokeSession).toHaveBeenCalled()
      expect(mockLogAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'logout',
          success: true,
        })
      )
    })
  })

  describe('GET /v1/auth/sessions', () => {
    it('should list all user sessions', async () => {
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
      }

      mockVerifyToken.mockReturnValue(mockPayload)
      mockGetUserSessions.mockResolvedValue([
        {
          id: 'session-1',
          platform: 'web',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 3600000),
        },
        {
          id: 'session-2',
          platform: 'cli',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 3600000),
        },
      ])

      const response = await request(app)
        .get('/v1/auth/sessions')
        .set('Authorization', 'Bearer valid-token')
        .expect(200)

      expect(Array.isArray(response.body.sessions)).toBe(true)
      expect(response.body.sessions.length).toBe(2)
    })
  })

  describe('POST /v1/auth/verify', () => {
    it('should verify valid token', async () => {
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }

      mockVerifyToken.mockReturnValue(mockPayload)

      const response = await request(app)
        .post('/v1/auth/verify')
        .set('Authorization', 'Bearer valid-token')
        .expect(200)

      expect(response.body).toHaveProperty('valid', true)
      expect(response.body).toHaveProperty('payload')
    })

    it('should reject invalid token', async () => {
      mockVerifyToken.mockImplementation(() => {
        throw new Error('Invalid token')
      })

      const response = await request(app)
        .post('/v1/auth/verify')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)

      expect(response.body).toHaveProperty('error')
    })
  })

  describe('POST /mcp/auth', () => {
    it('should authenticate MCP client with credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
      }

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null,
      })

      const response = await request(app)
        .post('/mcp/auth')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(200)

      expect(response.body).toHaveProperty('access_token')
      expect(response.body).toHaveProperty('token_type', 'Bearer')
    })
  })

  describe('POST /auth/cli-login', () => {
    it('should authenticate CLI client', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
      }

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null,
      })

      const response = await request(app)
        .post('/auth/cli-login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(200)

      expect(response.body).toHaveProperty('access_token')
      expect(response.body).toHaveProperty('token_type', 'Bearer')
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
          },
          session: {},
        },
        error: null,
      })

      mockCreateSession.mockRejectedValue(new Error('Database connection failed'))

      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(500)

      expect(response.body).toHaveProperty('error')
    })

    it('should handle Supabase service errors', async () => {
      mockSupabaseAuth.signInWithPassword.mockRejectedValue(
        new Error('Supabase service unavailable')
      )

      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(500)

      expect(response.body).toHaveProperty('error')
    })
  })
})
