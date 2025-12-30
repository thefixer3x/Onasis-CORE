import { Pool, PoolClient } from 'pg';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * PostgreSQL Connection Pool
 * Configured for Supabase Pooler (pgbouncer mode)
 */
export const dbPool: Pool;

/**
 * Get a database client with search_path set to include security_service schema.
 * This is required for API key management tables (api_key_projects, stored_api_keys).
 */
export function getClientWithSchema(): Promise<PoolClient>;

/**
 * Supabase Admin Client
 * Initialized with service_role key for admin operations
 */
export const supabaseAdmin: SupabaseClient;

export function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  timestamp?: string;
  error?: string;
}>;
