import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket

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

/**
 * Main DB Supabase client (for event projection and user data)
 * Uses MAIN_SUPABASE_URL if available, otherwise falls back to SUPABASE_URL
 */
export const supabaseUsers = createClient(
  env.MAIN_SUPABASE_URL || env.SUPABASE_URL || '',
  env.MAIN_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
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

/**
 * Supabase Auth client (for authentication operations)
 * Alias for supabaseUsers (Main DB) for backward compatibility
 */
export const supabaseAuth = supabaseUsers

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
