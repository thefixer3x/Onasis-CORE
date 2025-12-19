import { dbPool } from '../../db/client.js'
import { appendEventWithOutbox } from './event.service.js'

export interface AuditLogEntry {
  event_type: string
  user_id?: string
  client_id?: string
  platform?: string
  ip_address?: string
  user_agent?: string
  success: boolean
  error_message?: string
  metadata?: Record<string, unknown>
}

/**
 * Log an authentication event to the audit log
 */
export async function logAuthEvent(entry: AuditLogEntry): Promise<void> {
  const client = await dbPool.connect()
  try {
    await client.query('BEGIN')

    // Local audit table for immediate visibility
    await client.query(
      `
        INSERT INTO auth_gateway.audit_log (
          event_type, user_id, client_id, platform,
          ip_address, user_agent, success, error_message, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        entry.event_type,
        entry.user_id || null,
        entry.client_id || null,
        entry.platform || null,
        entry.ip_address || null,
        entry.user_agent || null,
        entry.success,
        entry.error_message || null,
        entry.metadata || {},
      ]
    )

    // Event + outbox for Supabase projection
    await appendEventWithOutbox(
      {
        aggregate_type: entry.user_id ? 'user' : 'client',
        aggregate_id: entry.user_id || entry.client_id || 'anonymous',
        event_type: 'AuthEventLogged',
        event_type_version: 1,
        payload: {
          event_type: entry.event_type,
          success: entry.success,
          platform: entry.platform,
          error_message: entry.error_message,
          metadata: entry.metadata || {},
        },
        metadata: {
          ip_address: entry.ip_address,
          user_agent: entry.user_agent,
        },
      },
      client
    )

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    // Log errors but don't fail the request
    console.error('Failed to write audit log or event:', error)
  } finally {
    client.release()
  }
}

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(
  userId: string,
  limit = 100
): Promise<AuditLogEntry[]> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      SELECT * FROM auth_gateway.audit_log
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [userId, limit]
    )
    return result.rows as AuditLogEntry[]
  } finally {
    client.release()
  }
}

/**
 * Get failed authentication attempts
 */
export async function getFailedAuthAttempts(
  minutes = 15
): Promise<AuditLogEntry[]> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      SELECT * FROM auth_gateway.audit_log
      WHERE success = false
        AND created_at > NOW() - INTERVAL '${minutes} minutes'
      ORDER BY created_at DESC
      `
    )
    return result.rows as AuditLogEntry[]
  } finally {
    client.release()
  }
}
