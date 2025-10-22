import { type StringValue } from 'ms'
import jwt, { type JwtPayload, type Secret, type SignOptions } from 'jsonwebtoken'
import { env } from '../../config/env'

export interface JWTPayload {
  sub: string // user_id
  email: string
  role: string
  project_scope?: string
  platform?: 'mcp' | 'cli' | 'web' | 'api'
  iat?: number
  exp?: number
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * Generate access and refresh tokens for a user
 */
export function generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp'>): TokenPair {
  const secret = env.JWT_SECRET=REDACTED_JWT_SECRET
  const accessOptions: SignOptions = { expiresIn: env.JWT_EXPIRY as StringValue }
  const refreshOptions: SignOptions = { expiresIn: '30d' as StringValue }

  const accessToken = jwt.sign(payload as JwtPayload, secret, accessOptions)

  const refreshToken = jwt.sign({ sub: payload.sub, type: 'refresh' } as JwtPayload, secret, refreshOptions)

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
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET=REDACTED_JWT_SECRET
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
