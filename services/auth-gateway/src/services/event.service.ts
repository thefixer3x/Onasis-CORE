import crypto from 'node:crypto'
import type { PoolClient } from 'pg'
import { dbPool } from '../../db/client.js'

export type OutboxStatus = 'pending' | 'sent' | 'failed'

export interface AppendEventParams {
  aggregate_type: string
  aggregate_id: string
  event_type: string
  event_type_version?: number
  payload?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface AppendedEvent {
  eventId: string
  version: number
}

export interface PendingOutboxRow {
  outbox_id: number
  event_id: string
  aggregate_type: string
  aggregate_id: string
  version: number
  event_type: string
  event_type_version: number
  payload: Record<string, unknown>
  metadata: Record<string, unknown>
  destination: string
  attempts: number
  next_attempt_at: Date
  occurred_at: Date
}

const DEFAULT_EVENT_VERSION = 1
const DEFAULT_OUTBOX_DESTINATION = 'supabase'

/**
 * Internal helper to run a query and cleanly manage BEGIN/COMMIT/ROLLBACK
 * when a pooled client is not supplied by the caller.
 */
async function withClient<T>(
  client: PoolClient | null,
  fn: (c: PoolClient) => Promise<T>
): Promise<T> {
  const ownsClient = !client
  const cx = client ?? (await dbPool.connect())

  try {
    if (ownsClient) {
      await cx.query('BEGIN')
    }

    const result = await fn(cx)

    if (ownsClient) {
      await cx.query('COMMIT')
    }

    return result
  } catch (error) {
    if (ownsClient) {
      await cx.query('ROLLBACK')
    }
    throw error
  } finally {
    if (ownsClient) {
      cx.release()
    }
  }
}

/**
 * Append an event to auth_gateway.events.
 * Computes a per-aggregate version inside the transaction to preserve order.
 */
export async function appendEvent(
  params: AppendEventParams,
  client: PoolClient | null = null
): Promise<AppendedEvent> {
  return withClient(client, async (cx) => {
    const { rows } = await cx.query<{ next_version: number }>(
      `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM auth_gateway.events
        WHERE aggregate_type = $1 AND aggregate_id = $2
        FOR UPDATE
      `,
      [params.aggregate_type, params.aggregate_id]
    )

    const version = rows[0]?.next_version ?? 1
    const eventId = crypto.randomUUID()

    await cx.query(
      `
        INSERT INTO auth_gateway.events (
          event_id, aggregate_type, aggregate_id, version,
          event_type, event_type_version, payload, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        eventId,
        params.aggregate_type,
        params.aggregate_id,
        version,
        params.event_type,
        params.event_type_version ?? DEFAULT_EVENT_VERSION,
        params.payload ?? {},
        params.metadata ?? {},
      ]
    )

    return { eventId, version }
  })
}

/**
 * Enqueue the event for downstream delivery (Supabase projection, etc.).
 */
export async function enqueueOutbox(
  eventId: string,
  client: PoolClient | null = null,
  destination = DEFAULT_OUTBOX_DESTINATION
): Promise<void> {
  await withClient(client, async (cx) => {
    await cx.query(
      `
        INSERT INTO auth_gateway.outbox (
          event_id, destination, status, attempts, next_attempt_at
        ) VALUES ($1, $2, 'pending', 0, NOW())
      `,
      [eventId, destination]
    )
  })
}

/**
 * Convenience: append an event and enqueue it in a single transaction.
 */
export async function appendEventWithOutbox(
  params: AppendEventParams,
  client: PoolClient | null = null
): Promise<AppendedEvent> {
  return withClient(client, async (cx) => {
    const appended = await appendEvent(params, cx)
    await enqueueOutbox(appended.eventId, cx)
    return appended
  })
}

/**
 * Fetch pending outbox rows (joined with events) ready for delivery.
 */
export async function fetchPendingOutbox(limit = 50): Promise<PendingOutboxRow[]> {
  const client = await dbPool.connect()
  try {
    const { rows } = await client.query(
      `
        SELECT
          o.id AS outbox_id,
          o.event_id,
          o.destination,
          o.attempts,
          o.next_attempt_at,
          e.aggregate_type,
          e.aggregate_id,
          e.version,
          e.event_type,
          e.event_type_version,
          e.payload,
          e.metadata,
          e.occurred_at
        FROM auth_gateway.outbox o
        JOIN auth_gateway.events e ON e.event_id = o.event_id
        WHERE o.status = 'pending'
          AND o.next_attempt_at <= NOW()
        ORDER BY o.id ASC
        LIMIT $1
      `,
      [limit]
    )
    return rows as PendingOutboxRow[]
  } finally {
    client.release()
  }
}

export async function markOutboxSent(outboxId: number): Promise<void> {
  const client = await dbPool.connect()
  try {
    await client.query(
      `
        UPDATE auth_gateway.outbox
        SET status = 'sent', attempts = attempts + 1, error = NULL, updated_at = NOW()
        WHERE id = $1
      `,
      [outboxId]
    )
  } finally {
    client.release()
  }
}

export async function markOutboxFailed(
  outboxId: number,
  error: string,
  delaySeconds = 30
): Promise<void> {
  const client = await dbPool.connect()
  try {
    await client.query(
      `
        UPDATE auth_gateway.outbox
        SET
          status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
          attempts = attempts + 1,
          error = $2,
          next_attempt_at = NOW() + ($3 || ' seconds')::interval,
          updated_at = NOW()
        WHERE id = $1
      `,
      [outboxId, error.slice(0, 500), delaySeconds]
    )
  } finally {
    client.release()
  }
}

/**
 * Lightweight stats for health endpoint.
 */
export async function getOutboxStats(): Promise<{
  pending: number
  failed: number
  oldest_pending_seconds?: number
}> {
  const client = await dbPool.connect()
  try {
    const { rows: counts } = await client.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed
        FROM auth_gateway.outbox
      `
    )

    const { rows: oldestRows } = await client.query<{ age_seconds: number }>(
      `
        SELECT EXTRACT(EPOCH FROM (NOW() - o.next_attempt_at)) AS age_seconds
        FROM auth_gateway.outbox o
        WHERE o.status = 'pending'
        ORDER BY o.next_attempt_at ASC
        LIMIT 1
      `
    )

    return {
      pending: Number(counts[0]?.pending ?? 0),
      failed: Number(counts[0]?.failed ?? 0),
      oldest_pending_seconds: oldestRows[0]?.age_seconds
        ? Number(oldestRows[0].age_seconds)
        : undefined,
    }
  } finally {
    client.release()
  }
}
