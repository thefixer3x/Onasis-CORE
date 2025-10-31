import type { Request, Response } from 'express'
import { supabaseAdmin } from '../../db/client.js'
import { generateTokenPair } from '../utils/jwt.js'
import { createSession, revokeSession, getUserSessions } from '../services/session.service.js'
import { upsertUserAccount } from '../services/user.service.js'
import { logAuthEvent } from '../services/audit.service.js'

/**
 * POST /v1/auth/login
 * Password-based login
 */
export async function login(req: Request, res: Response) {
  const { email, password, project_scope, platform = 'web', return_to } = req.body

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required',
      code: 'MISSING_CREDENTIALS',
    })
  }

  try {
    // Authenticate with Supabase
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      await logAuthEvent({
        event_type: 'login_failed',
        platform,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: false,
        error_message: error?.message || 'Invalid credentials',
        metadata: { email },
      })

      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'AUTH_INVALID_CREDENTIALS',
      })
    }

    await upsertUserAccount({
      user_id: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      provider: data.user.app_metadata?.provider,
      raw_metadata: data.user.user_metadata || {},
      last_sign_in_at: data.user.last_sign_in_at || null,
    })

    // Generate custom JWT tokens
    const tokens = generateTokenPair({
      sub: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      project_scope,
      platform: platform as 'mcp' | 'cli' | 'web' | 'api',
    })

    // Create session
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await createSession({
      user_id: data.user.id,
      platform: platform as 'mcp' | 'cli' | 'web' | 'api',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: project_scope ? [project_scope] : undefined,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      expires_at: expiresAt,
    })

    // Log successful login
    await logAuthEvent({
      event_type: 'login_success',
      user_id: data.user.id,
      platform,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
      metadata: { project_scope },
    })

    // Set HTTP-only session cookie for web platform
    if (platform === 'web') {
      const cookieDomain = process.env.COOKIE_DOMAIN || '.lanonasis.com'
      const isProduction = process.env.NODE_ENV === 'production'
      
      res.cookie('lanonasis_session', tokens.access_token, {
        domain: cookieDomain,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      })
      
      // Also set a readable cookie for user info (not sensitive)
      res.cookie('lanonasis_user', JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
      }), {
        domain: cookieDomain,
        httpOnly: false, // Readable by JavaScript
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      })
    }

    return res.json({
      ...tokens,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
      },
      redirect_to: return_to || undefined,
    })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  }
}

/**
 * POST /v1/auth/logout
 * Revoke current session
 */
export async function logout(req: Request, res: Response) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({
      error: 'No token provided',
      code: 'MISSING_TOKEN',
    })
  }

  const token = authHeader.slice(7)

  try {
    const revoked = await revokeSession(token)

    if (req.user) {
      await logAuthEvent({
        event_type: 'logout',
        user_id: req.user.sub,
        platform: req.user.platform,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
      })
    }

    // Clear session cookies
    const cookieDomain = process.env.COOKIE_DOMAIN || '.lanonasis.com'
    res.clearCookie('lanonasis_session', {
      domain: cookieDomain,
      path: '/',
    })
    res.clearCookie('lanonasis_user', {
      domain: cookieDomain,
      path: '/',
    })

    return res.json({
      success: true,
      revoked,
    })
  } catch (error) {
    console.error('Logout error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  }
}

/**
 * GET /v1/auth/session
 * Get current session info
 */
export async function getSession(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({
      error: 'No active session',
      code: 'NO_SESSION',
    })
  }

  try {
    const sessions = await getUserSessions(req.user.sub)

    return res.json({
      user: {
        id: req.user.sub,
        email: req.user.email,
        role: req.user.role,
        project_scope: req.user.project_scope,
        platform: req.user.platform,
      },
      sessions: sessions.length,
    })
  } catch (error) {
    console.error('Get session error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  }
}

/**
 * POST /v1/auth/verify
 * Verify a token and return payload (requires auth header)
 */
export async function verifyToken(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
    })
  }

  return res.json({
    valid: true,
    payload: req.user,
  })
}

/**
 * POST /auth/verify (CLI-friendly)
 * Verify a token sent in request body
 * Used by CLI and other clients that can't set auth headers easily
 */
export async function verifyTokenBody(req: Request, res: Response) {
  const { token } = req.body

  if (!token) {
    return res.status(400).json({
      valid: false,
      error: 'Token is required',
    })
  }

  // Handle CLI tokens (format: cli_timestamp_hex)
  if (token.startsWith('cli_')) {
    const parts = token.split('_')
    if (parts.length !== 3) {
      return res.json({
        valid: false,
        error: 'Invalid CLI token format',
      })
    }

    const timestamp = parseInt(parts[1], 10)
    const now = Date.now()
    const tokenAge = now - timestamp
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days

    if (tokenAge > maxAge) {
      return res.json({
        valid: false,
        error: 'CLI token expired',
      })
    }

    return res.json({
      valid: true,
      type: 'cli_token',
      user: {
        id: 'cli_user',
        email: 'cli@lanonasis.com',
        role: 'authenticated',
      },
      expires_at: new Date(timestamp + maxAge).toISOString(),
    })
  }

  // Handle JWT tokens
  try {
    const { verifyToken: verify } = await import('../utils/jwt')
    const payload = verify(token)

    return res.json({
      valid: true,
      type: 'jwt',
      user: {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      },
      expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    })
  } catch (error: any) {
    return res.json({
      valid: false,
      error: error.message || 'Invalid token',
    })
  }
}

/**
 * GET /v1/auth/sessions
 * Get all active sessions for current user
 */
export async function listSessions(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const sessions = await getUserSessions(req.user.sub)

    return res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        platform: s.platform,
        ip_address: s.ip_address,
        user_agent: s.user_agent,
        created_at: s.created_at,
        last_used_at: s.last_used_at,
        expires_at: s.expires_at,
      })),
    })
  } catch (error) {
    console.error('List sessions error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  }
}
