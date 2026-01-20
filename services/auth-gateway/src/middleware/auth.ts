import type { Request, Response, NextFunction } from 'express'
import { verifyToken, extractBearerToken, type JWTPayload } from '../utils/jwt.js'
import { validateAPIKey } from '../services/api-key.service.js'

/**
 * Unified user type for auth-gateway middleware
 * Combines JWT payload fields with internal user model fields
 */
export interface UnifiedUser {
  // Primary identifiers (internal naming)
  userId: string;
  organizationId: string;
  role: string;
  plan: string;

  // JWT standard claims (aliases)
  sub?: string;
  project_scope?: string;
  platform?: 'mcp' | 'cli' | 'web' | 'api';

  // Optional profile fields
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

// Extend Express Request type to include user and scopes
declare module 'express' {
  interface Request {
    user?: UnifiedUser
    scopes?: string[]  // API key scopes/permissions
  }
}

const buildUnifiedUserFromJwt = (payload: JWTPayload): UnifiedUser => ({
  // Primary identifiers
  userId: payload.sub,
  organizationId: payload.project_scope ?? 'unknown',
  role: payload.role,
  // Extract plan from JWT claims: check user_metadata, app_metadata, or direct claim
  plan: (payload.user_metadata?.plan as string) || (payload.app_metadata?.plan as string) || payload.plan || 'free',

  // JWT standard aliases (for code that uses req.user.sub, req.user.project_scope, etc.)
  sub: payload.sub,
  project_scope: payload.project_scope,
  platform: payload.platform,

  // Profile fields
  id: payload.sub,
  email: payload.email,
  app_metadata: {
    project_scope: payload.project_scope,
    platform: payload.platform,
  },
})

const buildUnifiedUserFromApiKey = (options: {
  userId: string
  email: string
  role: string
  plan: string
  projectScope?: string
  permissions?: string[]
  userMetadata?: Record<string, unknown>
}): UnifiedUser => ({
  userId: options.userId,
  organizationId: options.projectScope ?? 'unknown',
  role: options.role,
  plan: options.plan,
  id: options.userId,
  email: options.email,
  user_metadata: options.userMetadata ?? {},
  app_metadata: {
    project_scope: options.projectScope,
    permissions: options.permissions,
  },
})

const getProjectScope = (user?: UnifiedUser): string | undefined => {
  if (!user) return undefined
  const appMeta = user.app_metadata as Record<string, unknown> | undefined
  const projectScope = appMeta?.project_scope
  if (typeof projectScope === 'string') return projectScope
  return user.organizationId
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
      req.user = buildUnifiedUserFromJwt(payload)
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

        const projectScope = validation.projectScope || 'unknown'
        const plan = typeof userData?.user?.user_metadata?.plan === 'string'
          ? userData.user.user_metadata.plan
          : 'free'
        const role = typeof userData?.user?.user_metadata?.role === 'string'
          ? userData.user.user_metadata.role
          : 'authenticated'

        if (userError || !userData?.user) {
          // Fallback: use minimal payload if user lookup fails
          req.user = buildUnifiedUserFromApiKey({
            userId: validation.userId,
            email: `${validation.userId}@api-key.local`,
            role,
            plan,
            projectScope,
            permissions: validation.permissions,
          })
        } else {
          // Create full user payload from API key validation and user data
          req.user = buildUnifiedUserFromApiKey({
            userId: validation.userId,
            email: userData.user.email || `${validation.userId}@api-key.local`,
            role,
            plan,
            projectScope,
            permissions: validation.permissions,
            userMetadata: userData.user.user_metadata ?? {},
          })
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

    const projectScope = getProjectScope(req.user)
    if (projectScope !== requiredScope) {
      return res.status(403).json({
        error: 'Insufficient scope',
        code: 'SCOPE_INSUFFICIENT',
        required: requiredScope,
        provided: projectScope,
      })
    }

    next()
  }
}

/**
 * Check if a scope matches a required scope pattern
 * Supports both colon notation (standard: 'memories:read') and dot notation (legacy: 'memories.read')
 * Wildcards: 'memories:*' matches 'memories:read', 'memories:write'
 * '*' matches everything
 */
function scopeMatches(userScope: string, requiredScope: string): boolean {
  // Exact match
  if (userScope === requiredScope) return true

  // Full wildcard
  if (userScope === '*') return true

  // Legacy full access (supports both notations)
  if (userScope === 'legacy:full_access' || userScope === 'legacy.full_access') return true

  // Normalize both scopes to colon notation for comparison
  const normalizedUser = userScope.replace('.', ':')
  const normalizedRequired = requiredScope.replace('.', ':')

  // Exact match after normalization
  if (normalizedUser === normalizedRequired) return true

  // Resource wildcard with colon notation (e.g., 'memories:*' matches 'memories:read')
  if (normalizedUser.endsWith(':*')) {
    const resource = normalizedUser.slice(0, -2)
    return normalizedRequired.startsWith(resource + ':')
  }

  // Resource wildcard with dot notation (legacy: 'memories.*' matches 'memories.read')
  if (userScope.endsWith('.*')) {
    const resource = userScope.slice(0, -2)
    if (requiredScope.startsWith(resource + '.') || normalizedRequired.startsWith(resource + ':')) {
      return true
    }
  }

  // Check if required scope is a wildcard and user has specific permission
  if (normalizedRequired.endsWith(':*')) {
    const resource = normalizedRequired.slice(0, -2)
    return normalizedUser.startsWith(resource + ':')
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
      req.user = buildUnifiedUserFromJwt(payload)
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

        const projectScope = validation.projectScope || 'unknown'
        const plan = typeof userData?.user?.user_metadata?.plan === 'string'
          ? userData.user.user_metadata.plan
          : 'free'
        const role = typeof userData?.user?.user_metadata?.role === 'string'
          ? userData.user.user_metadata.role
          : 'authenticated'

        req.user = buildUnifiedUserFromApiKey({
          userId: validation.userId,
          email: userData?.user?.email || `${validation.userId}@api-key.local`,
          role,
          plan,
          projectScope,
          permissions: validation.permissions,
          userMetadata: userData?.user?.user_metadata ?? {},
        })
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
