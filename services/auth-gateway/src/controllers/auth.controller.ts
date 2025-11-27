import crypto from 'crypto'
import type { Request, Response } from 'express'
import { supabaseAdmin } from '../../db/client.js'
import { generateTokenPair } from '../utils/jwt.js'
import { createSession, revokeSession, getUserSessions } from '../services/session.service.js'
import { upsertUserAccount } from '../services/user.service.js'
import { logAuthEvent } from '../services/audit.service.js'
import * as apiKeyService from '../services/api-key.service.js'
import { redisClient } from '../services/cache.service.js'
import { logger } from '../utils/logger.js'

type Platform = 'mcp' | 'cli' | 'web' | 'api'

const SUPPORTED_PLATFORMS: Platform[] = ['cli', 'mcp', 'web', 'api']
const OAUTH_STATE_PREFIX = 'oauth_state:'
const OAUTH_STATE_TTL_SECONDS = 600

const OAUTH_PROVIDERS: Record<string, { supabaseProvider: string; scopes: string }> = {
  google: { supabaseProvider: 'google', scopes: 'email profile' },
  github: { supabaseProvider: 'github', scopes: 'user:email read:user' },
  linkedin_oidc: { supabaseProvider: 'linkedin_oidc', scopes: 'openid profile email' },
  discord: { supabaseProvider: 'discord', scopes: 'identify email' },
  apple: { supabaseProvider: 'apple', scopes: 'email name' },
}

interface OAuthStateData {
  provider: string
  redirect_uri: string
  project_scope?: string
  platform: Platform
}

function isSupportedPlatform(value?: string): value is Platform {
  return Boolean(value && SUPPORTED_PLATFORMS.includes(value as Platform))
}

function buildCallbackUrl(req: Request): string {
  const base = (process.env.AUTH_GATEWAY_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')
  return `${base}/v1/auth/oauth/callback`
}

function isValidRedirectUri(uri?: string): uri is string {
  if (!uri) return false
  try {
    new URL(uri)
    return true
  } catch {
    return false
  }
}

function appendTokensToRedirect(
  redirectUri: string,
  tokens: { access_token: string; refresh_token: string; expires_in: number },
  projectScope?: string,
  provider?: string
): string {
  try {
    const target = new URL(redirectUri)
    target.searchParams.set('access_token', tokens.access_token)
    target.searchParams.set('refresh_token', tokens.refresh_token)
    target.searchParams.set('expires_in', tokens.expires_in.toString())
    if (projectScope) {
      target.searchParams.set('project_scope', projectScope)
    }
    if (provider) {
      target.searchParams.set('provider', provider)
    }
    return target.toString()
  } catch {
    return redirectUri
  }
}

/**
 * GET /v1/auth/oauth
 * Initiate Supabase OAuth provider login
 */
export async function oauthProvider(req: Request, res: Response) {
  const providerKey = (req.query.provider as string | undefined)?.toLowerCase()
  const redirectUri = req.query.redirect_uri as string | undefined
  const projectScope = req.query.project_scope as string | undefined
  const platformInput = (req.query.platform as string | undefined)?.toLowerCase()
  const platform: Platform = isSupportedPlatform(platformInput) ? (platformInput as Platform) : 'web'

  if (!providerKey || !OAUTH_PROVIDERS[providerKey]) {
    return res.status(400).json({
      error: 'Invalid or unsupported provider',
      code: 'INVALID_PROVIDER',
    })
  }

  if (!isValidRedirectUri(redirectUri)) {
    return res.status(400).json({
      error: 'Valid redirect_uri is required',
      code: 'INVALID_REDIRECT_URI',
    })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const stateData: OAuthStateData = {
    provider: providerKey,
    redirect_uri: redirectUri,
    project_scope: projectScope,
    platform,
  }

  try {
    await redisClient.setex(
      `${OAUTH_STATE_PREFIX}${state}`,
      OAUTH_STATE_TTL_SECONDS,
      JSON.stringify(stateData)
    )
  } catch (error) {
    logger.error('Failed to persist OAuth state', { error })
    return res.status(500).json({
      error: 'Unable to initiate OAuth flow',
      code: 'OAUTH_STATE_ERROR',
    })
  }

  const providerConfig = OAUTH_PROVIDERS[providerKey]
  const callbackUrl = buildCallbackUrl(req)

  const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
    provider: providerConfig.supabaseProvider as any,
    options: {
      redirectTo: callbackUrl,
      scopes: providerConfig.scopes,
      queryParams: { state },
    },
  })

  if (error || !data?.url) {
    logger.warn('OAuth initiation failed', {
      provider: providerKey,
      project_scope: projectScope,
      platform,
      error: error?.message,
    })
    return res.status(400).json({
      error: error?.message || 'OAuth initiation failed',
      code: 'OAUTH_INIT_FAILED',
    })
  }

  await logAuthEvent({
    event_type: 'oauth_initiated',
    platform,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    success: true,
    metadata: { provider: providerKey, project_scope: projectScope },
  })

  return res.redirect(data.url)
}

/**
 * GET /v1/auth/oauth/callback
 * Handle Supabase OAuth callback and issue tokens
 */
export async function oauthCallback(req: Request, res: Response) {
  const code = req.query.code as string | undefined
  const state = req.query.state as string | undefined
  const oauthError = req.query.error as string | undefined

  if (oauthError) {
    return res.redirect(`/web/login?error=${encodeURIComponent(oauthError)}`)
  }

  if (!code || !state) {
    return res.redirect('/web/login?error=Missing%20OAuth%20parameters')
  }

  let stateData: OAuthStateData | null = null
  const stateKey = `${OAUTH_STATE_PREFIX}${state}`

  try {
    const stored = await redisClient.get(stateKey)
    if (stored) {
      stateData = JSON.parse(stored) as OAuthStateData
    }
    await redisClient.del(stateKey)
  } catch (error) {
    logger.error('Failed to read OAuth state', { error, state })
  }

  if (!stateData) {
    return res.redirect('/web/login?error=Invalid%20or%20expired%20OAuth%20state')
  }

  const platform: Platform = isSupportedPlatform(stateData.platform)
    ? stateData.platform
    : 'web'
  const redirectUri =
    stateData.redirect_uri ||
    process.env.DASHBOARD_URL ||
    'https://dashboard.lanonasis.com'

  try {
    const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code)

    if (error || !data?.user || !data?.session) {
      logger.warn('OAuth callback exchange failed', {
        state,
        provider: stateData.provider,
        platform,
        error: error?.message,
      })
      return res.redirect(
        `/web/login?error=${encodeURIComponent('OAuth authentication failed')}`
      )
    }

    await upsertUserAccount({
      user_id: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      provider: data.user.app_metadata?.provider || stateData.provider,
      raw_metadata: data.user.user_metadata || {},
      last_sign_in_at: data.user.last_sign_in_at || null,
    })

    if (stateData.project_scope) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
          user_metadata: {
            ...data.user.user_metadata,
            project_scope: stateData.project_scope,
          },
        })
      } catch (updateError) {
        logger.warn('Failed to persist project scope to Supabase user', {
          userId: data.user.id,
          project_scope: stateData.project_scope,
          error: updateError instanceof Error ? updateError.message : updateError,
        })
      }
    }

    const tokens = generateTokenPair({
      sub: data.user.id,
      email: data.user.email!,
      role: data.user.role || 'authenticated',
      project_scope: stateData.project_scope,
      platform,
    })

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await createSession({
      user_id: data.user.id,
      platform,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: stateData.project_scope ? [stateData.project_scope] : undefined,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      expires_at: expiresAt,
      metadata: { provider: stateData.provider },
    })

    await logAuthEvent({
      event_type: 'oauth_login_success',
      user_id: data.user.id,
      platform,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
      metadata: {
        provider: stateData.provider,
        project_scope: stateData.project_scope,
      },
    })

    if (platform === 'web') {
      const cookieDomain = process.env.COOKIE_DOMAIN || '.lanonasis.com'
      const isProduction = process.env.NODE_ENV === 'production'

      res.cookie('lanonasis_session', tokens.access_token, {
        domain: cookieDomain,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      })

      res.cookie(
        'lanonasis_user',
        JSON.stringify({
          id: data.user.id,
          email: data.user.email,
          role: data.user.role,
        }),
        {
          domain: cookieDomain,
          httpOnly: false,
          secure: isProduction,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: '/',
        }
      )

      return res.redirect(redirectUri)
    }

    // CLI, MCP, and API consumers receive tokens via redirect URI
    const redirectWithTokens = appendTokensToRedirect(
      redirectUri,
      tokens,
      stateData.project_scope,
      stateData.provider
    )
    return res.redirect(redirectWithTokens)
  } catch (error) {
    logger.error('Unhandled OAuth callback error', { error, state })

    await logAuthEvent({
      event_type: 'oauth_login_failed',
      platform,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: false,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      metadata: { provider: stateData.provider },
    })

    return res.redirect(
      `/web/login?error=${encodeURIComponent('OAuth authentication failed')}`
    )
  }
}

/**
 * POST /v1/auth/token/exchange
 * Exchange Supabase JWT for auth-gateway tokens
 * This bridges Dashboard's Supabase auth with the unified token system
 */
export async function exchangeSupabaseToken(req: Request, res: Response) {
  const supabaseAccessToken = req.headers.authorization?.replace('Bearer ', '')
  const projectScope = req.body.project_scope || req.headers['x-project-scope'] as string | undefined
  const platform = (req.body.platform as Platform) || 'web'

  if (!supabaseAccessToken) {
    return res.status(401).json({
      error: 'Supabase access token required in Authorization header',
      code: 'TOKEN_MISSING',
    })
  }

  try {
    // Verify Supabase token and get user
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(supabaseAccessToken)

    if (error || !user) {
      logger.warn('Invalid Supabase token presented for exchange', {
        error: error?.message,
        ip: req.ip,
      })
      return res.status(401).json({
        error: 'Invalid or expired Supabase token',
        code: 'TOKEN_INVALID',
      })
    }

    // Sync user to Neon database
    await upsertUserAccount({
      user_id: user.id,
      email: user.email!,
      role: user.role || 'authenticated',
      provider: user.app_metadata?.provider || 'supabase-direct',
      raw_metadata: user.user_metadata || {},
      last_sign_in_at: user.last_sign_in_at || null,
    })

    // Generate auth-gateway tokens (SHA-256 hashed opaque tokens)
    const tokens = generateTokenPair({
      sub: user.id,
      email: user.email!,
      role: user.role || 'authenticated',
      project_scope: projectScope || user.user_metadata?.project_scope || 'lanonasis-maas',
      platform,
    })

    // Create session in Neon
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await createSession({
      user_id: user.id,
      platform,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: projectScope ? [projectScope] : user.user_metadata?.project_scope ? [user.user_metadata.project_scope] : undefined,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      expires_at: expiresAt,
      metadata: {
        provider: 'supabase-exchange',
        original_provider: user.app_metadata?.provider,
        exchanged_at: new Date().toISOString(),
      },
    })

    // Log the token exchange event
    await logAuthEvent({
      event_type: 'token_exchange',
      user_id: user.id,
      platform,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
      metadata: {
        source: 'supabase',
        original_provider: user.app_metadata?.provider,
        project_scope: projectScope,
      },
    })

    logger.info('Token exchange successful', {
      user_id: user.id,
      email: user.email,
      platform,
      project_scope: projectScope,
    })

    // Return auth-gateway tokens (these work with all your services)
    return res.json({
      token_type: 'Bearer',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        project_scope: projectScope || user.user_metadata?.project_scope,
      },
    })
  } catch (error) {
    logger.error('Token exchange failed', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      ip: req.ip,
    })

    await logAuthEvent({
      event_type: 'token_exchange',
      platform,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: false,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })

    return res.status(500).json({
      error: 'Token exchange failed',
      code: 'EXCHANGE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

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
    const { verifyToken: verify } = await import('../utils/jwt.js')
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Invalid token'
    return res.json({
      valid: false,
      error: errorMessage,
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

/**
 * Verify API key endpoint - validates vendor key
 */
export async function verifyAPIKey(req: Request, res: Response) {
  const apiKey = req.headers['x-api-key'] as string
  
  if (!apiKey) {
    return res.status(400).json({
      error: 'API key required',
      code: 'API_KEY_MISSING',
      message: 'Please provide an API key in the X-API-Key header'
    })
  }
  
  try {
    const validation = await apiKeyService.validateAPIKey(apiKey)
    
    if (!validation.valid) {
      return res.status(401).json({
        valid: false,
        error: 'Invalid API key',
        code: 'API_KEY_INVALID',
        reason: validation.reason,
        message: 'The provided API key is not valid'
      })
    }
    
    return res.json({
      valid: true,
      userId: validation.userId,
      projectScope: validation.projectScope,
      permissions: validation.permissions,
      message: 'API key is valid'
    })
  } catch (error) {
    console.error('API key verification error:', error)
    return res.status(500).json({
      valid: false,
      error: 'Internal server error',
      code: 'VERIFICATION_ERROR',
      message: 'Failed to verify API key'
    })
  }
}

/**
 * POST /api/v1/auth/api-keys
 * Create a new API key
 */
export async function createApiKey(req: Request, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      })
    }

    const apiKey = await apiKeyService.createApiKey(req.user.sub, req.body)
    
    return res.json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key, // Only returned on creation
        access_level: apiKey.access_level,
        created_at: apiKey.created_at
      }
    })
  } catch (error) {
    console.error('API key creation error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * GET /api/v1/auth/api-keys
 * List all API keys for the authenticated user
 */
export async function listApiKeys(req: Request, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      })
    }

    const apiKeys = await apiKeyService.listApiKeys(req.user.sub, req.query)
    
    return res.json({
      success: true,
      data: apiKeys
    })
  } catch (error) {
    console.error('API key listing error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * GET /api/v1/auth/api-keys/:keyId
 * Get a specific API key
 */
export async function getApiKey(req: Request, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      })
    }

    const apiKey = await apiKeyService.getApiKey(req.params.keyId, req.user.sub)
    
    return res.json({
      success: true,
      data: apiKey
    })
  } catch (error) {
    console.error('Get API key error:', error)
    return res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * POST /api/v1/auth/api-keys/:keyId/rotate
 * Rotate an API key (generate new key value)
 */
export async function rotateApiKey(req: Request, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      })
    }

    const apiKey = await apiKeyService.rotateApiKey(req.params.keyId, req.user.sub)
    
    return res.json({
      success: true,
      message: 'API key rotated successfully',
      data: apiKey
    })
  } catch (error) {
    console.error('Rotate API key error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * POST /api/v1/auth/api-keys/:keyId/revoke
 * Revoke an API key (soft delete)
 */
export async function revokeApiKey(req: Request, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      })
    }

    const success = await apiKeyService.revokeApiKey(req.params.keyId, req.user.sub)
    
    return res.json({
      success,
      message: 'API key revoked successfully'
    })
  } catch (error) {
    console.error('Revoke API key error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * DELETE /api/v1/auth/api-keys/:keyId
 * Delete an API key (hard delete)
 */
export async function deleteApiKey(req: Request, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      })
    }

    const success = await apiKeyService.deleteApiKey(req.params.keyId, req.user.sub)
    
    return res.json({
      success,
      message: 'API key deleted successfully'
    })
  } catch (error) {
    console.error('Delete API key error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
