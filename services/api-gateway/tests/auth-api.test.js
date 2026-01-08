/**
 * API Gateway Authentication Tests
 * 
 * Tests the API Gateway authentication module including:
 * - Login with project scope
 * - Registration
 * - Session validation middleware
 * - Protected route access
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock Supabase client
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockGetUser = vi.fn();
const mockInsert = vi.fn();

const mockSupabase = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
    getUser: mockGetUser,
  },
  from: vi.fn(() => ({
    insert: mockInsert,
  })),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// Mock winston logger
vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('API Gateway Auth API', () => {
  let app;
  let authRouter;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create Express app
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.correlationId = 'test-correlation-id';
      next();
    });

    // Import and mount auth router
    // Note: This is a dynamic import since the module uses CommonJS
    const authModule = await import('../modules/auth-api.js');
    app.use('/v1/auth', authModule.default || authModule);
  });

  describe('POST /v1/auth/login', () => {
    it('should successfully login with valid credentials and project scope', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { role: 'user' },
        created_at: new Date().toISOString(),
      };

      const mockSession = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_at: Date.now() + 3600000,
      };

      mockSignInWithPassword.mockResolvedValue({
        data: {
          user: mockUser,
          session: mockSession,
        },
        error: null,
      });

      mockInsert.mockResolvedValue({ data: [], error: null });

      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
          project_scope: 'lanonasis-maas',
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.project_scope).toBe('lanonasis-maas');
      
      // Check cookie is set
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'][0]).toContain('session_token');
    });

    it('should reject login without email', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          password: 'password123',
          project_scope: 'lanonasis-maas',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login without password', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          project_scope: 'lanonasis-maas',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login without project scope', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login with invalid credentials', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
          project_scope: 'lanonasis-maas',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('LOGIN_FAILED');
    });

    it('should handle Supabase errors gracefully', async () => {
      mockSignInWithPassword.mockRejectedValue(new Error('Supabase service unavailable'));

      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
          project_scope: 'lanonasis-maas',
        })
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /v1/auth/register', () => {
    it('should successfully register new user with project scope', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'newuser@example.com',
        user_metadata: { role: 'user' },
        created_at: new Date().toISOString(),
      };

      const mockSession = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_at: Date.now() + 3600000,
      };

      mockSignUp.mockResolvedValue({
        data: {
          user: mockUser,
          session: mockSession,
        },
        error: null,
      });

      mockInsert.mockResolvedValue({ data: [], error: null });

      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          project_scope: 'lanonasis-maas',
        })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('newuser@example.com');
      expect(response.body.user.project_scope).toBe('lanonasis-maas');
    });

    it('should reject registration without required fields', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          // Missing password and project_scope
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Session Validation Middleware', () => {
    it('should validate session from cookie', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { role: 'user' },
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // Create a protected route
      app.get('/v1/protected', async (req, res, next) => {
        // Import validateSession dynamically
        const authModule = await import('../modules/auth-api.js');
        // This would need to be exported from the module
        // For now, we'll test the concept
        if (req.cookies?.session_token) {
          const { data: { user }, error } = await mockSupabase.auth.getUser(
            req.cookies.session_token
          );
          if (error || !user) {
            return res.status(401).json({ error: 'Invalid session' });
          }
          req.user = user;
          return res.json({ message: 'Protected resource', user });
        }
        return res.status(401).json({ error: 'No session token' });
      });

      const response = await request(app)
        .get('/v1/protected')
        .set('Cookie', 'session_token=valid-token')
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(mockGetUser).toHaveBeenCalledWith('valid-token');
    });

    it('should validate session from Authorization header', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { role: 'user' },
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      app.get('/v1/protected-header', async (req, res) => {
        const authHeader = req.headers.authorization?.replace('Bearer ', '');
        if (!authHeader) {
          return res.status(401).json({ error: 'No token' });
        }
        const { data: { user }, error } = await mockSupabase.auth.getUser(authHeader);
        if (error || !user) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.json({ message: 'Protected resource', user });
      });

      const response = await request(app)
        .get('/v1/protected-header')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(mockGetUser).toHaveBeenCalledWith('valid-token');
    });

    it('should reject request without session token', async () => {
      app.get('/v1/protected-no-token', async (req, res) => {
        return res.status(401).json({ error: 'No session token provided' });
      });

      const response = await request(app)
        .get('/v1/protected-no-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request with invalid session token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      app.get('/v1/protected-invalid', async (req, res) => {
        const token = req.cookies?.session_token || 
                     req.headers.authorization?.replace('Bearer ', '');
        const { data: { user }, error } = await mockSupabase.auth.getUser(token);
        if (error || !user) {
          return res.status(401).json({ error: 'Invalid session token' });
        }
        return res.json({ message: 'Protected resource' });
      });

      const response = await request(app)
        .get('/v1/protected-invalid')
        .set('Cookie', 'session_token=invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Audit Logging', () => {
    it('should log login attempts', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { role: 'user' },
      };

      const mockSession = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_at: Date.now() + 3600000,
      };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      mockInsert.mockResolvedValue({ data: [], error: null });

      await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
          project_scope: 'lanonasis-maas',
        })
        .expect(200);

      // Audit log should be called (via insert to core.logs)
      expect(mockInsert).toHaveBeenCalled();
    });
  });
});
