/**
 * UAI Router Middleware
 *
 * This is THE convergence point for all authentication methods.
 * Every request passes through here - no exceptions.
 *
 * Flow:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ANY REQUEST (Cookie, JWT, API Key, PKCE, MCP Token, etc.)      │
 * │                            │                                    │
 * │                            ▼                                    │
 * │                   ┌─────────────────┐                           │
 * │                   │  UAI ROUTER     │                           │
 * │                   │  MIDDLEWARE     │                           │
 * │                   │                 │                           │
 * │                   │  1. Extract     │                           │
 * │                   │  2. Resolve     │◄── Cache (Redis/Memory)   │
 * │                   │  3. Attach      │                           │
 * │                   │  4. Continue    │                           │
 * │                   └────────┬────────┘                           │
 * │                            │                                    │
 * │                            ▼                                    │
 * │              req.uai = { authId, orgId, ... }                   │
 * │              X-UAI-Auth-Id header set                           │
 * │                                                                 │
 * │                   Route handlers now have UAI                   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * The UAI is the ONLY identifier that downstream services see.
 * They don't need to know HOW the user authenticated.
 */

import { Request, Response, NextFunction } from 'express'
import { verifyToken, extractBearerToken } from '../utils/jwt.js'
import { validateAPIKey } from '../services/api-key.service.js'
import { resolveUAICached, type UAIResolutionResult } from '../services/uai-session-cache.service.js'
import type { AuthMethod } from '../services/identity-resolution.service.js'

// Extend Express Request to include UAI
declare module 'express-serve-static-core' {
  interface Request {
    uai?: UAIContext
  }
}

/**
 * UAI Context - attached to every authenticated request
 */
export interface UAIContext {
  /** The Universal Authentication Identifier - THE canonical identity */
  authId: string
  /** Organization/tenant ID */
  organizationId: string | null
  /** User's email (if available) */
  email: string | null
  /** How the user authenticated (jwt, api_key, cookie, etc.) */
  authMethod: AuthMethod
  /** Specific credential used */
  credentialId: string
  /** Whether UAI was served from cache */
  fromCache: boolean
  /** Original user_id from auth provider (for backward compatibility) */
  originalUserId?: string
}

/**
 * Options for UAI Router middleware
 */
export interface UAIRouterOptions {
  /** If true, requests without auth will continue (req.uai will be undefined) */
  allowAnonymous?: boolean
  /** Skip UAI resolution for these paths (e.g., health checks) */
  skipPaths?: string[]
  /** Custom error handler */
  onAuthError?: (req: Request, res: Response, error: string) => void
}

/**
 * Check SSO session cookie
 */
function checkSSOCookie(req: Request): { sub: string } | null {
  const sessionToken = req.cookies?.lanonasis_session
  if (!sessionToken) return null

  try {
    const payload = verifyToken(sessionToken)
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null
    }
    return { sub: payload.sub }
  } catch {
    return null
  }
}

/**
 * Extract MCP token from request
 */
function extractMCPToken(req: Request): string | null {
  // MCP tokens can come in different headers
  const mcpAuth = req.headers['x-mcp-auth'] as string
  if (mcpAuth) return mcpAuth

  // Or as a special bearer token type
  const auth = req.headers.authorization
  if (auth?.startsWith('MCP ')) {
    return auth.slice(4)
  }

  return null
}

/**
 * UAI Router Middleware Factory
 *
 * Creates middleware that resolves ALL auth methods to UAI.
 * This is the SINGLE convergence point for authentication.
 *
 * Usage:
 *   app.use(uaiRouter())  // Require auth on all routes
 *   app.use(uaiRouter({ allowAnonymous: true }))  // Allow public routes
 *   app.use('/api', uaiRouter())  // Only on /api routes
 */
export function uaiRouter(options: UAIRouterOptions = {}) {
  const {
    allowAnonymous = false,
    skipPaths = ['/health', '/healthz', '/ready', '/metrics'],
    onAuthError,
  } = options

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip paths that don't need auth (health checks, etc.)
    if (skipPaths.some(path => req.path === path || req.path.startsWith(path))) {
      return next()
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || ''
    const userAgent = req.headers['user-agent'] || ''

    let resolvedUAI: UAIResolutionResult | null = null
    let authMethod: AuthMethod | null = null
    let originalUserId: string | undefined

    // ═══════════════════════════════════════════════════════════════════
    // TRY ALL AUTH METHODS IN PRIORITY ORDER
    // ═══════════════════════════════════════════════════════════════════

    // Priority 1: SSO Session Cookie (web dashboard)
    const ssoPayload = checkSSOCookie(req)
    if (ssoPayload) {
      authMethod = 'sso_session'
      originalUserId = ssoPayload.sub
      resolvedUAI = await resolveUAICached('sso_session', ssoPayload.sub, {
        platform: 'web',
        ipAddress: clientIp,
        userAgent,
      })
    }

    // Priority 2: JWT Bearer Token (API, SDK)
    if (!resolvedUAI) {
      const token = extractBearerToken(req.headers.authorization)
      if (token) {
        try {
          const payload = verifyToken(token)
          authMethod = 'supabase_jwt'
          originalUserId = payload.sub
          resolvedUAI = await resolveUAICached('supabase_jwt', payload.sub, {
            platform: payload.platform || 'api',
            ipAddress: clientIp,
            userAgent,
          })
        } catch {
          // Invalid JWT, continue to next method
        }
      }
    }

    // Priority 3: API Key (programmatic access)
    if (!resolvedUAI) {
      const apiKey = req.headers['x-api-key'] as string
      if (apiKey) {
        try {
          const validation = await validateAPIKey(apiKey)
          if (validation.valid && validation.userId) {
            authMethod = 'api_key'
            originalUserId = validation.userId
            resolvedUAI = await resolveUAICached('api_key', validation.userId, {
              platform: 'api',
              ipAddress: clientIp,
              userAgent,
            })
          }
        } catch {
          // Invalid API key, continue
        }
      }
    }

    // Priority 4: MCP Token (AI assistants)
    if (!resolvedUAI) {
      const mcpToken = extractMCPToken(req)
      if (mcpToken) {
        try {
          // MCP tokens are JWTs with mcp_token method
          const payload = verifyToken(mcpToken)
          authMethod = 'mcp_token'
          originalUserId = payload.sub
          resolvedUAI = await resolveUAICached('mcp_token', payload.sub, {
            platform: 'mcp',
            ipAddress: clientIp,
            userAgent,
          })
        } catch {
          // Invalid MCP token, continue
        }
      }
    }

    // Priority 5: OAuth PKCE code (if present in query/body)
    // This would typically be handled by a specific OAuth endpoint,
    // but we check here for completeness
    if (!resolvedUAI && req.query.code && req.query.code_verifier) {
      // PKCE flow would be handled by oauth routes
      // This is just a placeholder - actual PKCE exchange happens elsewhere
    }

    // ═══════════════════════════════════════════════════════════════════
    // HANDLE RESULT
    // ═══════════════════════════════════════════════════════════════════

    if (!resolvedUAI) {
      // No valid authentication found
      if (allowAnonymous) {
        // Allow anonymous access - req.uai will be undefined
        return next()
      }

      // Authentication required
      const error = 'Authentication required'
      if (onAuthError) {
        return onAuthError(req, res, error)
      }

      res.status(401)
      res.set('X-UAI-Error', error)
      return res.json({
        success: false,
        error,
        code: 'AUTH_REQUIRED',
        hint: 'Provide authentication via Cookie, Authorization header, or X-API-Key',
      })
    }

    // ═══════════════════════════════════════════════════════════════════
    // ATTACH UAI TO REQUEST
    // ═══════════════════════════════════════════════════════════════════

    // Set UAI context on request object
    req.uai = {
      authId: resolvedUAI.authId,
      organizationId: resolvedUAI.organizationId,
      email: resolvedUAI.email,
      authMethod: authMethod!,
      credentialId: resolvedUAI.credentialId,
      fromCache: resolvedUAI.fromCache,
      originalUserId,
    }

    // Set UAI headers for downstream services / proxied requests
    res.set('X-UAI-Auth-Id', resolvedUAI.authId)
    res.set('X-UAI-Organization', resolvedUAI.organizationId || '')
    res.set('X-UAI-Auth-Method', authMethod || '')
    res.set('X-UAI-Credential-Id', resolvedUAI.credentialId || '')
    res.set('X-UAI-Email', resolvedUAI.email || '')
    res.set('X-UAI-From-Cache', resolvedUAI.fromCache ? 'true' : 'false')

    // Also set on request headers for internal forwarding
    req.headers['x-uai-auth-id'] = resolvedUAI.authId
    req.headers['x-uai-organization'] = resolvedUAI.organizationId || ''
    req.headers['x-uai-auth-method'] = authMethod || ''

    // Continue to route handler
    next()
  }
}

/**
 * Require UAI middleware - strict version that always requires auth
 */
export const requireUAI = uaiRouter({ allowAnonymous: false })

/**
 * Optional UAI middleware - allows anonymous access
 */
export const optionalUAI = uaiRouter({ allowAnonymous: true })

/**
 * Helper: Get UAI from request (throws if not present)
 */
export function getUAI(req: Request): UAIContext {
  if (!req.uai) {
    throw new Error('UAI not resolved - ensure uaiRouter middleware is applied')
  }
  return req.uai
}

/**
 * Helper: Get UAI auth_id from request (throws if not present)
 */
export function getAuthId(req: Request): string {
  return getUAI(req).authId
}

export default uaiRouter
