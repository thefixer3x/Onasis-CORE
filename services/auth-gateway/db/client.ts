import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

const { Pool } = pg

/**
 * PostgreSQL Connection Pool
 * Configured for Supabase Pooler (pgbouncer mode)
 *
 * Important: When using Supabase Transaction Pooler (port 6543):
 * - Prepared statements are disabled (pgbouncer compatibility)
 * - Connection pooling is handled by Supabase
 */
export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

export const supabaseAdmin = createClient(
  env.SUPABASE_URL || '',
  env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  }
)

export async function checkDatabaseHealth() {
  try {
    const client = await dbPool.connect()
    const result = await client.query('SELECT NOW() AS current_time')
    client.release()
    return { healthy: true, timestamp: result.rows[0]?.current_time }
  } catch (error) {
    return { healthy: false, error: (error as Error).message }
  }
}

/**
 * Get a database client with security_service schema set
 * Used for API key management operations
 */
export async function getClientWithSchema() {
  const client = await dbPool.connect()
  // Set the search_path to security_service schema
  await client.query('SET search_path TO security_service, public')
  return client
}
