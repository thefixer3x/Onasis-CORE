import { Pool, PoolClient } from '@neondatabase/serverless';
import { SupabaseClient } from '@supabase/supabase-js';

export const dbPool: Pool;

/**
 * Get a database client with search_path set to include security_service schema.
 * This is required for API key management tables (api_key_projects, stored_api_keys).
 */
export function getClientWithSchema(): Promise<PoolClient>;

export const supabaseAdmin: SupabaseClient;

export function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  timestamp?: string;
  error?: string;
}>;
