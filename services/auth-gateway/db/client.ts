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
