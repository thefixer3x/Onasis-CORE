import type { Request, Response, NextFunction } from 'express'
import { verifyToken, extractBearerToken, type JWTPayload } from '../utils/jwt.js'
import { validateAPIKey } from '../src/services/api-key.service.js'
import { resolveToUAI, type AuthMethod, type ResolvedIdentity } from '../services/identity-resolution.service.js'

/**
 * Unified user type for auth-gateway middleware
 * Combines JWT payload fields with internal user model fields
 *
 * The `universalId` (UAI - Universal Authentication Identifier) is the canonical
 * identity that all authentication methods resolve to. This enables:
 * - Single identity across all auth methods (JWT, API Key, OTP, etc.)
 * - Identity linking (user can have multiple auth methods)
 * - Cross-platform SSO without identity fragmentation
 */
export interface UnifiedUser {
  // Universal Authentication Identifier (UAI) - canonical identity
  // This is the SINGLE source of truth for user identity
  universalId?: string;

  // Primary identifiers (internal naming - legacy, use universalId for new code)
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

  // UAI-specific fields
  authMethod?: 'supabase_jwt' | 'api_key' | 'oauth_pkce' | 'magic_link' | 'otp_email' | 'sso_session' | 'mcp_token';
  credentialId?: string;
}

// Extend Express Request type to include user and scopes
declare module 'express' {
  interface Request {
    user?: UnifiedUser
    scopes?: string[]  // API key scopes/permissions
  }
}

const buildUnifiedUserFromJwt = (
  payload: JWTPayload,
  resolvedIdentity?: ResolvedIdentity | null
): UnifiedUser => ({
  // Universal Authentication Identifier (UAI) - the canonical identity
  universalId: resolvedIdentity?.authId,

  // Primary identifiers
  userId: payload.sub,
  organizationId: resolvedIdentity?.organizationId || payload.project_scope || 'unknown',
  role: payload.role,
  // Extract plan from JWT claims: check user_metadata, app_metadata, or direct claim
  plan: (payload.user_metadata?.plan as string) || (payload.app_metadata?.plan as string) || payload.plan || 'free',

  // JWT standard aliases (for code that uses req.user.sub, req.user.project_scope, etc.)
  sub: payload.sub,
  project_scope: payload.project_scope,
  platform: payload.platform,

  // Profile fields
  id: payload.sub,
  email: resolvedIdentity?.primaryEmail || payload.email,
  app_metadata: {
    project_scope: payload.project_scope,
    platform: payload.platform,
  },

  // UAI tracking fields
  authMethod: 'supabase_jwt',
  credentialId: resolvedIdentity?.credentialId,
})

const buildUnifiedUserFromApiKey = (options: {
  userId: string
  email: string
  role: string
  plan: string
  projectScope?: string
  permissions?: string[]
  userMetadata?: Record<string, unknown>
  resolvedIdentity?: ResolvedIdentity | null
}): UnifiedUser => ({
  // Universal Authentication Identifier (UAI) - the canonical identity
  universalId: options.resolvedIdentity?.authId,

  userId: options.userId,
  organizationId: options.resolvedIdentity?.organizationId || options.projectScope || 'unknown',
  role: options.role,
  plan: options.plan,
  id: options.userId,
  email: options.resolvedIdentity?.primaryEmail || options.email,
  user_metadata: options.userMetadata ?? {},
  app_metadata: {
    project_scope: options.projectScope,
    permissions: options.permissions,
  },

  // UAI tracking fields
  authMethod: 'api_key',
  credentialId: options.resolvedIdentity?.credentialId,
})

const getProjectScope = (user?: UnifiedUser): string | undefined => {
  if (!user) return undefined
  const appMeta = user.app_metadata as Record<string, unknown> | undefined
  const projectScope = appMeta?.project_scope
  if (typeof projectScope === 'string') return projectScope
  return user.organizationId
}

/**
 * Check for SSO session cookie (lanonasis_session)
 * This is the highest priority auth method for web requests
 */
function checkSSOCookie(req: Request): JWTPayload | null {
  const sessionToken = req.cookies?.lanonasis_session
  if (!sessionToken) return null

  try {
    const payload = verifyToken(sessionToken)
    // Check if token is expired
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/**
 * Resolve identity to UAI (Universal Authentication Identifier)
 * This is a non-blocking enhancement - authentication proceeds even if UAI resolution fails
 */
async function resolveIdentityToUAI(
  method: AuthMethod,
  identifier: string,
  options?: { createIfMissing?: boolean; platform?: 'mcp' | 'cli' | 'web' | 'api'; ipAddress?: string; userAgent?: string }
): Promise<ResolvedIdentity | null> {
  try {
    return await resolveToUAI(method, identifier, {
      createIfMissing: options?.createIfMissing ?? false,
      platform: options?.platform,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    })
  } catch (error) {
    // UAI resolution is non-critical during migration phase
    // Log warning but don't fail authentication
    console.warn('UAI resolution failed (non-critical):', error instanceof Error ? error.message : 'Unknown error')
    return null
  }
}

/**
 * Middleware to verify authentication via SSO cookie, JWT token, or API key
 *
 * Authentication priority:
 * 1. SSO cookie (lanonasis_session) - for web browser requests
 * 2. JWT Bearer token (Authorization: Bearer <token>) - for API clients
 * 3. API Key (X-API-Key: <hashed_key>) - for programmatic access
 *
 * All auth methods now resolve to a Universal Authentication Identifier (UAI)
 * for canonical identity tracking across platforms.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip
  const userAgent = req.headers['user-agent'] as string

  // Priority 1: Check SSO session cookie first (web requests)
  const ssoPayload = checkSSOCookie(req)
  if (ssoPayload) {
    // Resolve to UAI (non-blocking)
    const resolvedIdentity = await resolveIdentityToUAI('sso_session', ssoPayload.sub, {
      createIfMissing: true,
      platform: 'web',
      ipAddress: clientIp,
      userAgent,
    })

    req.user = buildUnifiedUserFromJwt(ssoPayload, resolvedIdentity)
    req.scopes = ['*'] // SSO users get full access
    return next()
  }

  // Priority 2: Try JWT Bearer token
  const token = extractBearerToken(req.headers.authorization)

  if (token) {
    try {
      const payload = verifyToken(token)

      // Resolve to UAI (non-blocking)
      const resolvedIdentity = await resolveIdentityToUAI('supabase_jwt', payload.sub, {
        createIfMissing: true,
        platform: payload.platform,
        ipAddress: clientIp,
        userAgent,
      })

      req.user = buildUnifiedUserFromJwt(payload, resolvedIdentity)
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

        // Resolve to UAI using API key hash as identifier (non-blocking)
        const resolvedIdentity = await resolveIdentityToUAI('api_key', validation.userId, {
          createIfMissing: true,
          platform: 'api',
          ipAddress: clientIp,
          userAgent,
        })

        // Fetch user details from Supabase to get email and role
        const { supabaseAdmin } = await import('../db/client.js')
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
            resolvedIdentity,
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
            resolvedIdentity,
          })
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
 * Checks SSO cookie first, then JWT, then API key
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // Priority 1: Check SSO session cookie first
  const ssoPayload = checkSSOCookie(req)
  if (ssoPayload) {
    req.user = buildUnifiedUserFromJwt(ssoPayload)
    req.scopes = ['*']
    return next()
  }

  // Priority 2: Try JWT Bearer token
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

  // Priority 3: Try API key authentication (optional)
  const apiKey = req.headers['x-api-key'] as string
  if (apiKey) {
    try {
      const validation = await validateAPIKey(apiKey)
      if (validation.valid && validation.userId) {
        req.scopes = validation.permissions || ['legacy.full_access']

        const { supabaseAdmin } = await import('../db/client.js')
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
