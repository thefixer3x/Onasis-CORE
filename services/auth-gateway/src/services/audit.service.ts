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

  // Phase 0.5 attribution fields
  /** Correlation ID from X-Request-ID, propagated across services. */
  request_id?: string
  /** Resolved organization at the time of the event. */
  organization_id?: string
  /** DB id of the API key used (when auth_source = 'api_key'). */
  api_key_id?: string
  /** Authentication source: jwt | oauth_token | api_key | sso */
  auth_source?: string
  /** Primary acting principal for the event. */
  actor_id?: string
  /** Principal type: user | agent | service */
  actor_type?: string
  /** Application routing scope from auth-gateway (not the tenant boundary). */
  project_scope?: string
  /** Logical ingress surface for central audit analysis. */
  route_source?: string
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function inferAuthSource(entry: AuditLogEntry): string | undefined {
  if (entry.auth_source) return entry.auth_source

  if (entry.event_type.startsWith('mcp_') || entry.platform === 'mcp') return 'mcp_password'
  if (entry.event_type.startsWith('cli_') || entry.platform === 'cli') return 'password'
  if (entry.event_type.startsWith('otp_')) return 'otp'
  if (entry.event_type.startsWith('device_')) return 'device_code'
  if (entry.event_type.startsWith('magic_link_')) return 'magic_link'
  if (
    entry.event_type.startsWith('oauth_') ||
    entry.event_type === 'authorize_request' ||
    entry.event_type.startsWith('token_')
  ) {
    return 'oauth'
  }

  if (entry.event_type === 'login_success' || entry.event_type === 'login_failed') {
    return 'password'
  }

  return undefined
}

function inferRouteSource(entry: AuditLogEntry, authSource?: string): string {
  if (entry.route_source) return entry.route_source

  const metadataRouteSource = getMetadataString(entry.metadata, 'route_source')
  if (metadataRouteSource) return metadataRouteSource

  if (entry.event_type.startsWith('mcp_') || entry.platform === 'mcp' || authSource === 'mcp_password') {
    return 'auth_gateway_mcp'
  }
  if (entry.event_type.startsWith('cli_') || entry.platform === 'cli') {
    return 'auth_gateway_cli'
  }
  if (entry.event_type.startsWith('otp_')) {
    return 'auth_gateway_otp'
  }
  if (entry.event_type.startsWith('device_')) {
    return 'auth_gateway_device'
  }
  if (entry.event_type.startsWith('magic_link_')) {
    return 'auth_gateway_magic_link'
  }
  if (
    entry.event_type.startsWith('oauth_') ||
    entry.event_type === 'authorize_request' ||
    entry.event_type.startsWith('token_') ||
    authSource === 'oauth'
  ) {
    return 'auth_gateway_oauth'
  }
  if (
    entry.event_type === 'login_success' ||
    entry.event_type === 'login_failed' ||
    entry.event_type === 'signup_success' ||
    entry.event_type === 'signup_failed' ||
    entry.event_type === 'logout'
  ) {
    return 'auth_gateway_web'
  }

  return 'auth_gateway'
}

/**
 * Log an authentication event to the audit log
 */
export async function logAuthEvent(entry: AuditLogEntry): Promise<void> {
  const client = await dbPool.connect()
  try {
    await client.query('BEGIN')

    const authSource = inferAuthSource(entry)
    const routeSource = inferRouteSource(entry, authSource)

    // Merge Phase 0.5 attribution fields into metadata so existing writes are
    // backward-compatible until auth_gateway.audit_log gains these columns.
    const enrichedMetadata = {
      ...(entry.metadata || {}),
      ...(entry.request_id     ? { request_id:     entry.request_id     } : {}),
      ...(entry.organization_id ? { organization_id: entry.organization_id } : {}),
      ...(entry.api_key_id     ? { api_key_id:     entry.api_key_id     } : {}),
      ...(authSource          ? { auth_source:    authSource          } : {}),
      ...(entry.actor_id       ? { actor_id:       entry.actor_id       } : {}),
      ...(entry.actor_type     ? { actor_type:     entry.actor_type     } : {}),
      ...(entry.project_scope  ? { project_scope:  entry.project_scope  } : {}),
      ...(routeSource         ? { route_source:   routeSource         } : {}),
    }

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
        enrichedMetadata,
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
          metadata: enrichedMetadata,
        },
        metadata: {
          ip_address: entry.ip_address,
          user_agent: entry.user_agent,
          ...(entry.request_id ? { request_id: entry.request_id } : {}),
          ...(entry.organization_id ? { organization_id: entry.organization_id } : {}),
          ...(entry.api_key_id ? { api_key_id: entry.api_key_id } : {}),
          ...(authSource ? { auth_source: authSource } : {}),
          ...(entry.actor_id ? { actor_id: entry.actor_id } : {}),
          ...(entry.actor_type ? { actor_type: entry.actor_type } : {}),
          ...(entry.project_scope ? { project_scope: entry.project_scope } : {}),
          ...(routeSource ? { route_source: routeSource } : {}),
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
