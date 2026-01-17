import pg from 'pg'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

const { Pool } = pg

// =============================================================================
// DATABASE ARCHITECTURE
// =============================================================================
//
// This auth-gateway connects to TWO separate Supabase projects:
//
// 1. AUTH-GATEWAY DB (ptnrwrgzrsbocgxlpvhd.supabase.co)
//    - Environment: SUPABASE_URL=https://<project-ref>.supabase.co
//    - Purpose: Sessions, API keys, OAuth clients, events, outbox
//    - Schemas: auth_gateway, security_service
//
// 2. MAIN/USERS DB (mxtsd....supabase.co)
//    - Environment: MAIN_SUPABASE_URL=https://<project-ref>.supabase.co
//    - Purpose: User accounts & authentication (signIn, signUp)
//    - This is where users register and their credentials are stored
//
// IMPORTANT: User authentication MUST use the Main DB client, not Auth-Gateway DB!
//
// =============================================================================

/**
 * PostgreSQL Connection Pool - Auth-Gateway DB
 * Configured for Supabase Pooler (pgbouncer mode)
 */
export const dbPool = new Pool({
  connectionString: env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

/**
 * AUTH-GATEWAY DB Client (ptnrwrgzrsbocgxlpvhd.supabase.co)
 *
 * Used for:
 * - Sessions management
 * - API keys storage
 * - OAuth clients & authorization codes
 * - Audit events & outbox
 *
 * DO NOT use for user authentication!
 */
export const supabaseGateway = createClient(
  env.SUPABASE_URL=https://<project-ref>.supabase.co
  env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
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

// Alias for backward compatibility
export const supabaseAdmin = supabaseGateway

/**
 * MAIN/USERS DB Client (mxtsd....supabase.co)
 *
 * Used for:
 * - User authentication (signInWithPassword, signUp)
 * - User profile data
 *
 * This is the ONLY client that should be used for user auth!
 */
let _supabaseUsers: SupabaseClient

if (env.MAIN_SUPABASE_URL=https://<project-ref>.supabase.co
  _supabaseUsers = createClient(
    env.MAIN_SUPABASE_URL=https://<project-ref>.supabase.co
    env.MAIN_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
} else {
  // Warn loudly if Main DB credentials are missing
  console.warn('⚠️  WARNING: MAIN_SUPABASE_URL=https://<project-ref>.supabase.co
  console.warn('   User authentication will NOT work correctly!')
  console.warn('   Set these environment variables to point to your Users DB.')
  console.warn('')
  console.warn('   Current setup:')
  console.warn('   - SUPABASE_URL=https://<project-ref>.supabase.co
  console.warn('   - MAIN_SUPABASE_URL=https://<project-ref>.supabase.co
  console.warn('')

  // Fallback to Auth-Gateway DB (will cause auth failures but won't crash)
  _supabaseUsers = supabaseGateway
}

export const supabaseUsers = _supabaseUsers

// Alias for backward compatibility
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
