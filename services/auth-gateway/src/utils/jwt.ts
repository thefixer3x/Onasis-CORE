import { type StringValue } from 'ms'
import jwt, { type JwtPayload, type Secret, type SignOptions } from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { getIdentityService, type AuthMethod } from '../services/identity-resolution.service.js'

export interface JWTPayload {
  sub: string // user_id
  /** Universal Authentication Identifier - THE canonical identity (optional for backward compatibility) */
  uai?: string
  email: string
  role: string
  project_scope?: string
  platform?: 'mcp' | 'cli' | 'web' | 'api'
  /** User's subscription plan (extracted from metadata or direct claim) */
  plan?: string
  /** Supabase user_metadata - may contain plan info */
  user_metadata?: Record<string, unknown>
  /** Supabase app_metadata - may contain plan info */
  app_metadata?: Record<string, unknown>
  /** Organization/tenant ID from UAI resolution */
  organization_id?: string
  iat?: number
  exp?: number
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * Input payload for token generation (before UAI resolution)
 */
export interface TokenGenerationInput {
  sub: string // user_id from auth provider
  email: string
  role: string
  project_scope?: string
  platform?: 'mcp' | 'cli' | 'web' | 'api'
  plan?: string
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
  /** Auth method used for login - determines how to resolve UAI */
  authMethod?: AuthMethod
}

/**
 * Generate access and refresh tokens with UAI embedded
 *
 * This is the CORRECT model:
 * 1. Resolve UAI once at token generation time
 * 2. Embed UAI in token - all services read it directly
 * 3. No per-request proxy resolution needed
 *
 * @param input - User data from authentication
 * @returns TokenPair with UAI-enriched access token
 */
export async function generateTokenPairWithUAI(input: TokenGenerationInput): Promise<TokenPair> {
  const identityService = getIdentityService()
  const authMethod = input.authMethod || 'supabase_jwt'

  // Resolve or create UAI for this user
  const identity = await identityService.resolveIdentity(authMethod, input.sub, {
    createIfMissing: true,
    platform: input.platform,
    metadata: {
      email: input.email,
      role: input.role,
      plan: input.plan,
    }
  })

  if (!identity) {
    throw new Error('Failed to resolve UAI for user')
  }

  // Build payload with UAI
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: input.sub,
    uai: identity.authId, // THE canonical identity
    email: input.email || identity.primaryEmail || '',
    role: input.role,
    project_scope: input.project_scope,
    platform: input.platform,
    plan: input.plan,
    user_metadata: input.user_metadata,
    app_metadata: input.app_metadata,
    organization_id: identity.organizationId || undefined,
  }

  return generateTokenPairSync(payload)
}

/**
 * Generate tokens synchronously (when UAI is already known)
 * Use generateTokenPairWithUAI() for new logins
 */
export function generateTokenPairSync(payload: Omit<JWTPayload, 'iat' | 'exp'>): TokenPair {
  const secret = env.JWT_SECRET;
  const accessOptions: SignOptions = { expiresIn: env.JWT_EXPIRY as StringValue }
  const refreshOptions: SignOptions = { expiresIn: '30d' as StringValue }

  const accessToken = jwt.sign(payload as JwtPayload, secret, accessOptions)

  // Refresh token includes UAI for seamless refresh
  const refreshToken = jwt.sign(
    { sub: payload.sub, uai: payload.uai, type: 'refresh' } as JwtPayload,
    secret,
    refreshOptions
  )

  // Calculate expiry in seconds
  const expiresIn = env.JWT_EXPIRY.endsWith('d')
    ? Number.parseInt(env.JWT_EXPIRY.slice(0, -1)) * 86400
    : Number.parseInt(env.JWT_EXPIRY.slice(0, -1)) * 3600

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
  }
}

/**
 * @deprecated Use generateTokenPairWithUAI() for new code
 * Legacy sync function - kept for backward compatibility during migration
 */
export function generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp'>): TokenPair {
  // If UAI is already in payload, use sync version
  if (payload.uai) {
    return generateTokenPairSync(payload)
  }

  // Legacy path - generate token without UAI (will be resolved per-request)
  // This should be phased out
  console.warn('generateTokenPair called without UAI - use generateTokenPairWithUAI() instead')
  const legacyPayload = { ...payload, uai: payload.sub } // Fallback: use sub as uai
  return generateTokenPairSync(legacyPayload)
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired')
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token')
    }
    throw new Error('Token verification failed')
  }
}

/**
 * Decode token without verification (for inspection only)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload
  } catch {
    return null
  }
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}
