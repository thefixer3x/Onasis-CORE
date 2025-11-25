import type { Request, Response, NextFunction } from 'express'
import { verifyToken, extractBearerToken, type JWTPayload } from '../utils/jwt.js'
import { validateAPIKey } from '../services/api-key.service.js'

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
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

  // No valid authentication found
  return res.status(401).json({
    error: 'No token provided',
    code: 'AUTH_TOKEN_MISSING',
  })
}

/**
 * Middleware to verify project scope matches required scope
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
 * Optional auth middleware - attaches user if token is valid, but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization)

  if (!token) {
    return next()
  }

  try {
    const payload = verifyToken(token)
    req.user = payload
  } catch {
    // Invalid token, but we don't fail the request
  }

  next()
}
