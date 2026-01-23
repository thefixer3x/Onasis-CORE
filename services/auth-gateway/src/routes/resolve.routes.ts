/**
 * UAI Resolution Routes
 *
 * Provides UAI resolution with session caching.
 *
 * Architecture:
 * 1. User authenticates with any method (JWT, API key, session cookie)
 * 2. First request: Resolve UAI from database, cache it
 * 3. Subsequent requests: Return cached UAI (NO database hit)
 * 4. Cache expires (5 min default): Re-resolve on next request
 *
 * The UAI stays server-side - clients never see it directly.
 * All downstream services receive the UAI via X-UAI-Auth-Id header.
 */

import { Router, Request, Response } from 'express'
import { verifyToken, extractBearerToken, type JWTPayload } from '../utils/jwt.js'
import { validateAPIKey } from '../services/api-key.service.js'
import { resolveUAICached, type UAIResolutionResult } from '../services/uai-session-cache.service.js'
import { type AuthMethod } from '../services/identity-resolution.service.js'

const router = Router()

// Response interface for UAI resolution endpoint
interface UAIResolutionResponse {
  success: boolean
  authId?: string
  organizationId?: string
  authMethod?: string
  credentialId?: string
  email?: string
  fromCache?: boolean  // Indicates if UAI was served from cache
  error?: string
  code?: string
}

/**
 * Check SSO session cookie
 */
function checkSSOCookie(req: Request): JWTPayload | null {
  const sessionToken = req.cookies?.lanonasis_session
  if (!sessionToken) return null

  try {
    const payload = verifyToken(sessionToken)
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/**
 * Resolve identity to UAI with caching
 *
 * First request hits the database, subsequent requests use cache.
 * Cache TTL is configurable (default 5 minutes).
 */
async function resolveIdentityCached(
  method: AuthMethod,
  identifier: string,
  options?: { platform?: string; ipAddress?: string; userAgent?: string }
): Promise<UAIResolutionResult | null> {
  try {
    return await resolveUAICached(method, identifier, {
      platform: options?.platform as 'mcp' | 'cli' | 'web' | 'api' | 'mobile' | 'sdk',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    })
  } catch (error) {
    console.error('UAI resolution error:', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

/**
 * GET /v1/auth/resolve
 *
 * Main UAI resolution endpoint with session caching.
 *
 * Flow:
 * 1. Extract auth credentials from request (cookie, JWT, API key)
 * 2. Check cache for resolved UAI (fast path - no DB hit)
 * 3. If not cached, resolve from database and cache result
 * 4. Return UAI in response headers
 *
 * Headers checked (in priority order):
 * 1. Cookie: lanonasis_session (SSO)
 * 2. Authorization: Bearer <jwt> (API)
 * 3. X-API-Key: <key> (Programmatic)
 *
 * Response headers set on success:
 * - X-UAI-Auth-Id: The canonical UAI (UUID)
 * - X-UAI-Organization: Organization/tenant ID
 * - X-UAI-Auth-Method: How user authenticated
 * - X-UAI-Credential-Id: Specific credential used
 * - X-UAI-Email: User's email (if available)
 * - X-UAI-From-Cache: 'true' if served from cache
 *
 * Returns 200 OK if authenticated, 401 if not.
 */
router.get('/', async (req: Request, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || ''
  const userAgent = req.headers['user-agent'] || ''

  let resolvedUAI: UAIResolutionResult | null = null
  let authMethod: AuthMethod | null = null

  // Priority 1: SSO Session Cookie
  const ssoPayload = checkSSOCookie(req)
  if (ssoPayload) {
    authMethod = 'sso_session'
    resolvedUAI = await resolveIdentityCached('sso_session', ssoPayload.sub, {
      platform: 'web',
      ipAddress: clientIp,
      userAgent,
    })
  }

  // Priority 2: JWT Bearer Token
  if (!resolvedUAI) {
    const token = extractBearerToken(req.headers.authorization)
    if (token) {
      try {
        const payload = verifyToken(token)
        authMethod = 'supabase_jwt'
        resolvedUAI = await resolveIdentityCached('supabase_jwt', payload.sub, {
          platform: payload.platform,
          ipAddress: clientIp,
          userAgent,
        })
      } catch {
        // Invalid JWT, continue to API key
      }
    }
  }

  // Priority 3: API Key
  if (!resolvedUAI) {
    const apiKey = req.headers['x-api-key'] as string
    if (apiKey) {
      try {
        const validation = await validateAPIKey(apiKey)
        if (validation.valid && validation.userId) {
          authMethod = 'api_key'
          // Use the API key hash as identifier for caching
          resolvedUAI = await resolveIdentityCached('api_key', validation.userId, {
            platform: 'api',
            ipAddress: clientIp,
            userAgent,
          })
        }
      } catch {
        // Invalid API key
      }
    }
  }

  // No valid authentication
  if (!resolvedUAI || !resolvedUAI.authId) {
    res.status(401)
    res.set('X-UAI-Error', 'Authentication required')
    return res.json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    } satisfies UAIResolutionResponse)
  }

  // Set UAI headers for downstream services
  res.set('X-UAI-Auth-Id', resolvedUAI.authId)
  res.set('X-UAI-Organization', resolvedUAI.organizationId || '')
  res.set('X-UAI-Auth-Method', authMethod || 'unknown')
  res.set('X-UAI-Credential-Id', resolvedUAI.credentialId || '')
  res.set('X-UAI-Email', resolvedUAI.email || '')
  res.set('X-UAI-From-Cache', resolvedUAI.fromCache ? 'true' : 'false')

  // Return success
  res.status(200).json({
    success: true,
    authId: resolvedUAI.authId,
    organizationId: resolvedUAI.organizationId || undefined,
    authMethod: authMethod || undefined,
    credentialId: resolvedUAI.credentialId,
    email: resolvedUAI.email || undefined,
    fromCache: resolvedUAI.fromCache,
  } satisfies UAIResolutionResponse)
})

/**
 * GET /v1/auth/resolve/debug
 *
 * Debug endpoint to inspect UAI resolution and cache status.
 * Only available in non-production environments.
 *
 * Query params:
 * - skipCache=true: Force database resolution (bypass cache)
 */
router.get('/debug', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || ''
  const userAgent = req.headers['user-agent'] || ''
  const skipCache = req.query.skipCache === 'true'

  // Show what auth methods are present
  const authMethods: Record<string, boolean> = {
    sso_cookie: !!req.cookies?.lanonasis_session,
    bearer_token: !!req.headers.authorization?.startsWith('Bearer '),
    api_key: !!req.headers['x-api-key'],
  }

  // Try resolution with cache inspection
  let resolution: UAIResolutionResult | { error: string; validation?: unknown } | null = null
  let method: string = 'none'

  const ssoPayload = checkSSOCookie(req)
  if (ssoPayload) {
    method = 'sso_session'
    resolution = await resolveUAICached('sso_session', ssoPayload.sub, {
      platform: 'web',
      ipAddress: clientIp,
      userAgent,
      skipCache,
    })
  } else if (req.headers.authorization?.startsWith('Bearer ')) {
    const token = extractBearerToken(req.headers.authorization)
    if (token) {
      try {
        const payload = verifyToken(token)
        method = 'supabase_jwt'
        resolution = await resolveUAICached('supabase_jwt', payload.sub, {
          platform: payload.platform,
          ipAddress: clientIp,
          userAgent,
          skipCache,
        })
      } catch (e) {
        resolution = { error: e instanceof Error ? e.message : 'JWT verification failed' }
      }
    }
  } else if (req.headers['x-api-key']) {
    try {
      const validation = await validateAPIKey(req.headers['x-api-key'] as string)
      if (validation.valid && validation.userId) {
        method = 'api_key'
        resolution = await resolveUAICached('api_key', validation.userId, {
          platform: 'api',
          ipAddress: clientIp,
          userAgent,
          skipCache,
        })
      } else {
        resolution = { error: 'Invalid API key', validation }
      }
    } catch (e) {
      resolution = { error: e instanceof Error ? e.message : 'API key validation failed' }
    }
  }

  res.json({
    authMethods,
    resolvedMethod: method,
    resolution,
    cacheStatus: {
      skipCache,
      fromCache: resolution && 'fromCache' in resolution ? resolution.fromCache : null,
    },
    headers: {
      authorization: req.headers.authorization ? '[PRESENT]' : undefined,
      'x-api-key': req.headers['x-api-key'] ? '[PRESENT]' : undefined,
      cookie: req.cookies?.lanonasis_session ? '[PRESENT]' : undefined,
    },
    clientIp,
    userAgent,
  })
})

export default router
