/**
 * Authentication middleware for Supabase Edge Functions
 * Supports: Bearer tokens (JWT/API keys), X-API-Key header
 *
 * Token validation priority:
 * 1. API key format (lano_*, lms_*, vibe_*, sk_*, pk_*, master_*)
 * 2. Auth-gateway JWT (via /oauth/introspect)
 * 3. Supabase JWT (via supabase.auth.getUser)
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthContext {
  user_id: string;
  organization_id: string;
  access_level: string;
  email: string;
  is_master: boolean;
  api_key_id?: string;
  auth_source?: 'api_key' | 'auth_gateway' | 'supabase';
}

/**
 * Create a Supabase client with service role for admin operations
 */
export function createSupabaseClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );
}

/**
 * Authenticate an incoming request
 * Supports:
 * 1. Bearer token (API key format: lano_*, lms_*, vibe_*, sk_*, pk_*)
 * 2. Bearer token (auth-gateway JWT via /oauth/introspect)
 * 3. Bearer token (Supabase JWT via supabase.auth.getUser)
 * 4. X-API-Key header
 */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const supabase = createSupabaseClient();

  // Try Authorization header
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Check if it's an API key format
    if (isApiKeyFormat(token)) {
      const result = await authenticateApiKey(supabase, token);
      if (result) {
        result.auth_source = 'api_key';
        return result;
      }
    }

    // Try auth-gateway introspection first (prevents bad_jwt errors)
    const authGatewayResult = await authenticateViaAuthGateway(supabase, token);
    if (authGatewayResult) {
      return authGatewayResult;
    }

    // Fall back to Supabase JWT validation
    const supabaseResult = await authenticateViaSupabase(supabase, token);
    if (supabaseResult) {
      return supabaseResult;
    }
  }

  // Try X-API-Key header
  const apiKey = req.headers.get('X-API-Key');
  if (apiKey) {
    const result = await authenticateApiKey(supabase, apiKey);
    if (result) {
      result.auth_source = 'api_key';
      return result;
    }
  }

  return null;
}

/**
 * Authenticate via auth-gateway's /oauth/introspect endpoint
 * This handles auth-gateway issued JWTs (from OAuth flows, OTP, etc.)
 */
async function authenticateViaAuthGateway(
  supabase: SupabaseClient,
  token: string
): Promise<AuthContext | null> {
  const authGatewayUrl = Deno.env.get('AUTH_GATEWAY_URL') || 'https://auth.lanonasis.com';

  try {
    const response = await fetch(`${authGatewayUrl}/oauth/introspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `token=${encodeURIComponent(token)}`,
    });

    if (!response.ok) {
      console.log('[auth] Auth-gateway introspect returned non-OK status:', response.status);
      return null;
    }

    const data = await response.json();

    // RFC 7662: inactive tokens return { active: false }
    if (!data.active) {
      console.log('[auth] Token not active according to auth-gateway');
      return null;
    }

    // Token is valid - extract user info
    const userId = data.sub || data.user_id;
    if (!userId) {
      console.log('[auth] No user ID in introspection response');
      return null;
    }

    // Fetch organization from users table
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id, email')
      .eq('id', userId)
      .single();

    console.log(`[auth] Auth-gateway validation successful for user: ${userId}`);

    return {
      user_id: userId,
      organization_id: userData?.organization_id || userId,
      access_level: data.scope?.split(' ')[0] || 'authenticated',
      email: userData?.email || data.email || '',
      is_master: data.scope?.includes('admin') || false,
      auth_source: 'auth_gateway',
    };
  } catch (error) {
    // Auth-gateway unavailable or network error - fall back to Supabase
    console.log('[auth] Auth-gateway introspect failed, will try Supabase:', error);
    return null;
  }
}

/**
 * Authenticate via Supabase's auth.getUser()
 * This handles native Supabase JWTs
 */
async function authenticateViaSupabase(
  supabase: SupabaseClient,
  token: string
): Promise<AuthContext | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Don't log this as an error - it's expected for non-Supabase tokens
      console.log('[auth] Supabase JWT validation failed:', error?.message || 'No user');
      return null;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id, email')
      .eq('id', user.id)
      .single();

    if (userData) {
      console.log(`[auth] Supabase validation successful for user: ${user.id}`);
      return {
        user_id: user.id,
        organization_id: userData.organization_id,
        access_level: 'authenticated',
        email: userData.email || user.email || '',
        is_master: false,
        auth_source: 'supabase',
      };
    }

    return null;
  } catch (error) {
    console.log('[auth] Supabase validation error:', error);
    return null;
  }
}

/**
 * Check if a token looks like an API key
 */
function isApiKeyFormat(token: string): boolean {
  return /^(lano_|lms_|vibe_|sk_|pk_|master_)/.test(token);
}

/**
 * Authenticate using an API key
 */
async function authenticateApiKey(
  supabase: SupabaseClient,
  apiKey: string
): Promise<AuthContext | null> {
  console.log(`[auth] Authenticating API key: ${apiKey.substring(0, 10)}...`);

  // First, try to find by exact key match (plaintext stored keys)
  let keyData = await findApiKeyByPlaintext(supabase, apiKey);

  // If not found, try by hash
  if (!keyData) {
    const keyHash = await hashApiKey(apiKey);
    console.log(`[auth] Trying hash lookup: ${keyHash.substring(0, 16)}...`);
    keyData = await findApiKeyByHash(supabase, keyHash);
  }

  if (!keyData) {
    console.error('[auth] API key not found in database');
    return null;
  }

  console.log(`[auth] Found key: ${keyData.name}, user_id: ${keyData.user_id}`);

  // Check if active
  if (!keyData.is_active) {
    console.log('[auth] API key is inactive');
    return null;
  }

  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    console.log('[auth] API key expired');
    return null;
  }

  // Get user's organization from users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('organization_id, email')
    .eq('id', keyData.user_id)
    .single();

  if (userError || !userData) {
    console.error('[auth] User lookup failed:', userError?.message);
    return null;
  }

  const organizationId = userData.organization_id;
  const email = userData?.email || '';

  // Update last_used_at (fire and forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyData.id)
    .then(() => {});

  // Check if master/admin key
  const isMaster =
    keyData.access_level === 'admin' ||
    keyData.access_level === 'enterprise' ||
    keyData.name?.toLowerCase().includes('master') ||
    keyData.name?.toLowerCase().includes('admin');

  console.log(`[auth] Auth successful - org: ${organizationId}, master: ${isMaster}`);

  return {
    user_id: keyData.user_id,
    organization_id: organizationId,
    access_level: keyData.access_level || 'authenticated',
    email: email,
    is_master: isMaster,
    api_key_id: keyData.id
  };
}

/**
 * Find API key by plaintext key value
 */
async function findApiKeyByPlaintext(
  supabase: SupabaseClient,
  apiKey: string
): Promise<ApiKeyRecord | null> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, access_level, name, is_active, expires_at')
    .eq('key', apiKey)
    .maybeSingle();

  if (error) {
    console.error('[auth] Plaintext key lookup error:', error.message);
    return null;
  }
  return data;
}

/**
 * Find API key by hash
 */
async function findApiKeyByHash(
  supabase: SupabaseClient,
  keyHash: string
): Promise<ApiKeyRecord | null> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, access_level, name, is_active, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error) {
    console.error('[auth] Hash key lookup error:', error.message);
    return null;
  }
  return data;
}

interface ApiKeyRecord {
  id: string;
  user_id: string;
  access_level: string;
  name: string;
  is_active: boolean;
  expires_at?: string;
}

/**
 * Hash an API key using SHA-256
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
