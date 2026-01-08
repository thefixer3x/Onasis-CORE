import type { Request, Response, NextFunction } from 'express'
import { verifyToken, extractBearerToken, type JWTPayload } from '../utils/jwt.js'
import { validateAPIKey } from '../services/api-key.service.js'

// Extend Express Request type to include user and scopes
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
      scopes?: string[]  // API key scopes/permissions
    }
  }
}

/**
 * Middleware to verify JWT token or API key and attach user to request
 * Supports both authentication methods:
 * - JWT Bearer token: Authorization: Bearer <token>
 * - API Key: X-API-Key: <hashed_key>
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Try JWT token first
  const token = extractBearerToken(req.headers.authorization)

  if (token) {
    try {
      const payload = verifyToken(token)
      req.user = payload
      // JWT tokens get full access by default
      req.scopes = ['*']
      return next()
    } catch (error) {
      // JWT invalid, try API key fallback
    }
  }

  // Try API key authentication
  const apiKey = req.headers['x-api-key'] as string
  if (apiKey) {
    try {
      const validation = await validateAPIKey(apiKey)
      if (validation.valid && validation.userId) {
        // Attach scopes from API key validation
        req.scopes = validation.permissions || ['legacy.full_access']

        // Fetch user details from Supabase to get email and role
        const { supabaseAdmin } = await import('../../db/client.js')
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(validation.userId)

        if (userError || !userData?.user) {
          // Fallback: use minimal payload if user lookup fails
          req.user = {
            sub: validation.userId,
            email: `${validation.userId}@api-key.local`,
            role: 'authenticated',
            project_scope: validation.projectScope || 'lanonasis-maas',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
          }
        } else {
          // Create full user payload from API key validation and user data
          req.user = {
            sub: validation.userId,
            email: userData.user.email || `${validation.userId}@api-key.local`,
            role: userData.user.user_metadata?.role || 'authenticated',
            project_scope: validation.projectScope || 'lanonasis-maas',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
          }
        }
        return next()
      }
    } catch (error) {
      // API key validation failed
      console.error('API key validation error:', error)
    }
  }

  if (req.user) {
    req.scopes = req.scopes ?? ['*']
    return next()
  }

  // No valid authentication found
  return res.status(401).json({
    error: 'No token provided',
    code: 'AUTH_TOKEN_MISSING',
  })
}

/**
 * Middleware to verify project scope matches required scope
 * @deprecated Use requireScopes() for more flexible scope checking
 */
export function requireScope(requiredScope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      })
    }

    if (req.user.project_scope !== requiredScope) {
      return res.status(403).json({
        error: 'Insufficient scope',
        code: 'SCOPE_INSUFFICIENT',
        required: requiredScope,
        provided: req.user.project_scope,
      })
    }

    next()
  }
}

/**
 * Check if a scope matches a required scope pattern
 * Supports wildcards: 'memories.*' matches 'memories.read', 'memories.write'
 * '*' matches everything
 */
function scopeMatches(userScope: string, requiredScope: string): boolean {
  // Exact match
  if (userScope === requiredScope) return true

  // Full wildcard
  if (userScope === '*') return true

  // Legacy full access
  if (userScope === 'legacy.full_access') return true

  // Resource wildcard (e.g., 'memories.*' matches 'memories.read')
  if (userScope.endsWith('.*')) {
    const resource = userScope.slice(0, -2)
    return requiredScope.startsWith(resource + '.')
  }

  // Check if required scope is a wildcard and user has specific permission
  if (requiredScope.endsWith('.*')) {
    const resource = requiredScope.slice(0, -2)
    return userScope.startsWith(resource + '.')
  }

  return false
}

/**
 * Middleware to verify API key has required scopes
 * Supports multiple scopes - user must have at least one matching scope
 *
 * @example
 * // Require read access to memories
 * router.get('/memories', requireAuth, requireScopes('memories.read'), handler)
 *
 * @example
 * // Require any memory access
 * router.get('/memories', requireAuth, requireScopes('memories.*'), handler)
 *
 * @example
 * // Accept either read or write (any of the scopes)
 * router.post('/memories', requireAuth, requireScopes('memories.write', 'memories.*'), handler)
 */
export function requireScopes(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      })
    }

    // Get user's scopes (default to legacy full access for backward compatibility)
    const userScopes = req.scopes || ['legacy.full_access']

    // Check if user has ANY of the required scopes
    const hasScope = requiredScopes.some(required =>
      userScopes.some(userScope => scopeMatches(userScope, required))
    )

    if (!hasScope) {
      return res.status(403).json({
        error: 'Insufficient scope',
        code: 'SCOPE_INSUFFICIENT',
        required: requiredScopes,
        provided: userScopes,
      })
    }

    next()
  }
}

/**
 * Middleware to require ALL specified scopes (AND logic)
 *
 * @example
 * // Require both read and write access
 * router.post('/admin', requireAuth, requireAllScopes('admin.*', 'profile.write'), handler)
 */
export function requireAllScopes(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      })
    }

    // Get user's scopes (default to legacy full access for backward compatibility)
    const userScopes = req.scopes || ['legacy.full_access']

    // Check if user has ALL of the required scopes
    const missingScopes = requiredScopes.filter(required =>
      !userScopes.some(userScope => scopeMatches(userScope, required))
    )

    if (missingScopes.length > 0) {
      return res.status(403).json({
        error: 'Missing required scopes',
        code: 'SCOPE_INSUFFICIENT',
        required: requiredScopes,
        missing: missingScopes,
        provided: userScopes,
      })
    }

    next()
  }
}

/**
 * Optional auth middleware - attaches user if token is valid, but doesn't require it
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization)

  if (token) {
    try {
      const payload = verifyToken(token)
      req.user = payload
      req.scopes = ['*']
      return next()
    } catch {
      // Invalid token, but we don't fail the request
    }
  }

  // Try API key authentication (optional)
  const apiKey = req.headers['x-api-key'] as string
  if (apiKey) {
    try {
      const validation = await validateAPIKey(apiKey)
      if (validation.valid && validation.userId) {
        req.scopes = validation.permissions || ['legacy.full_access']

        const { supabaseAdmin } = await import('../../db/client.js')
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(validation.userId)

        req.user = {
          sub: validation.userId,
          email: userData?.user?.email || `${validation.userId}@api-key.local`,
          role: userData?.user?.user_metadata?.role || 'authenticated',
          project_scope: validation.projectScope || 'lanonasis-maas',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        }
      }
    } catch {
      // Invalid API key, but we don't fail the request
    }
  }

  next()
}

/**
 * Helper to check if current request has a specific scope
 * Useful for conditional logic within handlers
 */
export function hasScope(req: Request, scope: string): boolean {
  const userScopes = req.scopes || ['legacy.full_access']
  return userScopes.some(userScope => scopeMatches(userScope, scope))
}
