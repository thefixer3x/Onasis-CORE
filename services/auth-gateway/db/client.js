import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
neonConfig.webSocketConstructor = ws;
export const dbPool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});

/**
 * Get a database client with search_path set to include security_service schema
 * This is required for API key management tables (api_key_projects, stored_api_keys)
 */
export async function getClientWithSchema() {
    const client = await dbPool.connect();
    await client.query("SET search_path TO security_service, public");
    return client;
}
export const supabaseAdmin = createClient(env.SUPABASE_URL || '', env.SUPABASE_SERVICE_ROLE_KEY || '', {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
    db: {
        schema: 'public',
    },
});
export async function checkDatabaseHealth() {
    try {
        const client = await dbPool.connect();
        const result = await client.query('SELECT NOW() AS current_time');
        client.release();
        return { healthy: true, timestamp: result.rows[0]?.current_time };
    }
    catch (error) {
        return { healthy: false, error: error.message };
    }
}
