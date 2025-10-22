import { dbPool } from '../../db/client'
import crypto from 'node:crypto'

export interface CreateSessionParams {
  user_id: string
  platform: 'mcp' | 'cli' | 'web' | 'api'
  access_token: string
  refresh_token: string
  client_id?: string
  scope?: string[]
  ip_address?: string
  user_agent?: string
  expires_at: Date
  metadata?: Record<string, unknown>
}

export interface Session {
  id: string
  user_id: string
  platform: string
  token_hash: string
  refresh_token_hash: string | null
  client_id: string | null
  scope: string[] | null
  ip_address: string | null
  user_agent: string | null
  expires_at: Date
  created_at: Date
  last_used_at: Date | null
  metadata: Record<string, unknown>
}

/**
 * Hash token for secure storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Create a new session
 */
export async function createSession(params: CreateSessionParams): Promise<Session> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      INSERT INTO auth_gateway.sessions (
        user_id, platform, token_hash, refresh_token_hash,
        client_id, scope, ip_address, user_agent,
        expires_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
      `,
      [
        params.user_id,
        params.platform,
        hashToken(params.access_token),
        params.refresh_token ? hashToken(params.refresh_token) : null,
        params.client_id || null,
        params.scope || null,
        params.ip_address || null,
        params.user_agent || null,
        params.expires_at,
        params.metadata || {},
      ]
    )
    return result.rows[0] as Session
  } finally {
    client.release()
  }
}

/**
 * Find session by access token
 */
export async function findSessionByToken(token: string): Promise<Session | null> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      SELECT * FROM auth_gateway.sessions
      WHERE token_hash = $1
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [hashToken(token)]
    )
    return (result.rows[0] as Session) || null
  } finally {
    client.release()
  }
}

/**
 * Update session last_used_at timestamp
 */
export async function touchSession(sessionId: string): Promise<void> {
  const client = await dbPool.connect()
  try {
    await client.query(
      `
      UPDATE auth_gateway.sessions
      SET last_used_at = NOW()
      WHERE id = $1
      `,
      [sessionId]
    )
  } finally {
    client.release()
  }
}

/**
 * Revoke session by token
 */
export async function revokeSession(token: string): Promise<boolean> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      DELETE FROM auth_gateway.sessions
      WHERE token_hash = $1
      RETURNING id
      `,
      [hashToken(token)]
    )
    const affected = result.rowCount ?? 0
    return affected > 0
  } finally {
    client.release()
  }
}

/**
 * Revoke all sessions for a user
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      DELETE FROM auth_gateway.sessions
      WHERE user_id = $1
      RETURNING id
      `,
      [userId]
    )
    return result.rowCount ?? 0
  } finally {
    client.release()
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      DELETE FROM auth_gateway.sessions
      WHERE expires_at < NOW()
      RETURNING id
      `
    )
    return result.rowCount ?? 0
  } finally {
    client.release()
  }
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<Session[]> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      SELECT * FROM auth_gateway.sessions
      WHERE user_id = $1
        AND expires_at > NOW()
      ORDER BY last_used_at DESC
      `,
      [userId]
    )
    return result.rows as Session[]
  } finally {
    client.release()
  }
}
