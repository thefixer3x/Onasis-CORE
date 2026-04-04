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

type MemoryKeyContext = 'personal' | 'team' | 'enterprise' | 'legacy';

export interface AuthContext {
  user_id: string;
  organization_id: string;
  access_level: string;
  email: string;
  is_master: boolean;
  api_key_id?: string;
  auth_source?: 'api_key' | 'auth_gateway' | 'supabase';
  project_scope?: string;
  permissions?: string[];
  key_context?: MemoryKeyContext;
}

const PROJECT_SCOPE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Create a Supabase client with service role for admin operations
 */
export function createSupabaseClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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
  const requestedProjectScope = normalizeProjectScope(req);

  // Try Authorization header
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Check if it's an API key format
    if (isApiKeyFormat(token)) {
      const result = await authenticateApiKey(supabase, token, requestedProjectScope);
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
    const result = await authenticateApiKey(supabase, apiKey, requestedProjectScope);
    if (result) {
      result.auth_source = 'api_key';
      return result;
    }
  }

  return null;
}

function normalizeProjectScope(req: Request): string | undefined {
  const value = req.headers.get('X-Project-Scope');
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter(Boolean);
}

function normalizeKeyContext(value: unknown): MemoryKeyContext | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'personal' || normalized === 'team' ||
    normalized === 'enterprise' || normalized === 'legacy'
  ) {
    return normalized;
  }
  return undefined;
}

function inferKeyContextFromPermissions(
  permissions: string[],
): MemoryKeyContext | undefined {
  const normalized = permissions.map((permission) => permission.toLowerCase());
  if (normalized.some((permission) => permission.startsWith('memories:personal:'))) {
    return 'personal';
  }
  if (normalized.some((permission) => permission.startsWith('memories:team:'))) {
    return 'team';
  }
  if (normalized.some((permission) => permission.startsWith('memories:enterprise:'))) {
    return 'enterprise';
  }
  return undefined;
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

    // Fail closed: if org cannot be resolved, reject the request
    if (!userData?.organization_id) {
      console.log('[auth] No organization_id found for user, denying access:', userId);
      return null;
    }

    console.log(`[auth] Auth-gateway validation successful for user: ${userId}`);

    return {
      user_id: userId,
      organization_id: userData.organization_id,
      access_level: data.scope?.split(' ')[0] || 'authenticated',
      email: userData?.email || data.email || '',
      is_master: data.scope?.includes('admin') || false,
      auth_source: 'auth_gateway',
      project_scope: data.project_scope || undefined,
      permissions: typeof data.scope === 'string'
        ? data.scope.split(' ').map((scope: string) => scope.trim()).filter(Boolean)
        : [],
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
        permissions: ['*'],
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
  return /^(lano_|lms_|lns_|vibe_|sk_|pk_|master_)/.test(token);
}

/**
 * Authenticate using an API key
 */
async function authenticateApiKey(
  supabase: SupabaseClient,
  apiKey: string,
  requestedProjectScope?: string,
): Promise<AuthContext | null> {
  console.log(`[auth] Authenticating API key: ${apiKey.substring(0, 10)}...`);

  const gatewayResult = await authenticateApiKeyViaAuthGateway(
    supabase,
    apiKey,
    requestedProjectScope,
  );
  if (gatewayResult) {
    return gatewayResult;
  }

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

  // Fail closed: reject if org cannot be resolved
  if (!userData.organization_id) {
    console.error('[auth] No organization_id for API key user, denying access:', keyData.user_id);
    return null;
  }

  const organizationId = userData.organization_id;
  const email = userData?.email || '';
  const validatedProjectScope = await resolveProjectScopeForApiKey(
    supabase,
    keyData.user_id,
    organizationId,
    requestedProjectScope,
  );

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
  const permissions = normalizePermissions(keyData.permissions);
  const keyContext = normalizeKeyContext(keyData.key_context) ??
    inferKeyContextFromPermissions(permissions) ??
    'legacy';

  console.log(`[auth] Auth successful - org: ${organizationId}, master: ${isMaster}`);

  return {
    user_id: keyData.user_id,
    organization_id: organizationId,
    access_level: keyData.access_level || 'authenticated',
    email: email,
    is_master: isMaster,
    api_key_id: keyData.id,
    project_scope: validatedProjectScope,
    permissions,
    key_context: keyContext,
  };
}

async function authenticateApiKeyViaAuthGateway(
  supabase: SupabaseClient,
  apiKey: string,
  requestedProjectScope?: string,
): Promise<AuthContext | null> {
  const authGatewayUrl = Deno.env.get('AUTH_GATEWAY_URL') || 'https://auth.lanonasis.com';

  try {
    const response = await fetch(`${authGatewayUrl}/v1/auth/verify-api-key`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      console.log('[auth] Auth-gateway API key verification returned non-OK status:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.valid || !data.userId) {
      return null;
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id, email')
      .eq('id', data.userId)
      .single();

    if (userError || !userData?.organization_id) {
      console.log('[auth] Auth-gateway API key verification could not hydrate organization:', userError?.message || 'missing organization');
      return null;
    }

    const validatedProjectScope = await resolveProjectScopeForApiKey(
      supabase,
      data.userId,
      userData.organization_id,
      requestedProjectScope || data.projectScope || undefined,
    );
    const permissions = normalizePermissions(data.permissions);
    const keyContext = normalizeKeyContext(data.keyContext) ??
      inferKeyContextFromPermissions(permissions) ??
      'legacy';
    const isMaster = apiKey.startsWith('master_') ||
      permissions.includes('*') ||
      permissions.includes('admin.*');

    console.log(`[auth] Auth-gateway API key verification successful for user: ${data.userId}`);

    return {
      user_id: data.userId,
      organization_id: userData.organization_id,
      access_level: 'authenticated',
      email: userData.email || '',
      is_master: isMaster,
      api_key_id: typeof data.keyId === 'string' ? data.keyId : undefined,
      auth_source: 'api_key',
      project_scope: validatedProjectScope || data.projectScope || undefined,
      permissions,
      key_context: keyContext,
    };
  } catch (error) {
    console.log('[auth] Auth-gateway API key verification failed, falling back to local key store:', error);
    return null;
  }
}

async function resolveProjectScopeForApiKey(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  requestedProjectScope?: string,
): Promise<string | undefined> {
  const scope = requestedProjectScope?.trim();
  if (!scope) return undefined;

  try {
    if (PROJECT_SCOPE_UUID_REGEX.test(scope)) {
      const { data, error } = await supabase
        .from('api_key_projects')
        .select('id, owner_id, team_members')
        .eq('id', scope)
        .eq('organization_id', organizationId)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('[auth] Project scope UUID lookup failed:', error.message);
        return undefined;
      }

      if (!data?.id) return undefined;
      const teamMembers = Array.isArray(data.team_members) ? data.team_members : [];
      return data.owner_id === userId || teamMembers.includes(userId) ? scope : undefined;
    }

    const { data, error } = await supabase
      .from('api_key_projects')
      .select('id, name, owner_id, team_members, settings')
      .eq('organization_id', organizationId)
      .limit(100);

    if (error) {
      console.warn('[auth] Project scope name/slug lookup failed:', error.message);
      return undefined;
    }

    const normalizedScope = scope.toLowerCase();
    const match = (data || []).find((project: Record<string, unknown>) => {
      const teamMembers = Array.isArray(project.team_members) ? project.team_members : [];
      const settings = project.settings && typeof project.settings === 'object'
        ? project.settings as Record<string, unknown>
        : {};
      const slug = typeof settings.slug === 'string' ? settings.slug.toLowerCase() : '';
      const name = typeof project.name === 'string' ? project.name.toLowerCase() : '';
      const member = project.owner_id === userId || teamMembers.includes(userId);
      return member && (name === normalizedScope || slug === normalizedScope);
    });

    return match?.id ? scope : undefined;
  } catch (error) {
    console.warn('[auth] Project scope validation failed:', error);
    return undefined;
  }
}

/**
 * Find API key by plaintext key value
 */
async function findApiKeyByPlaintext(
  supabase: SupabaseClient,
  apiKey: string
): Promise<ApiKeyRecord | null> {
  return await findApiKeyRecord(supabase, 'key', apiKey, '[auth] Plaintext key lookup');
}

/**
 * Find API key by hash
 */
async function findApiKeyByHash(
  supabase: SupabaseClient,
  keyHash: string
): Promise<ApiKeyRecord | null> {
  return await findApiKeyRecord(supabase, 'key_hash', keyHash, '[auth] Hash key lookup');
}

async function findApiKeyRecord(
  supabase: SupabaseClient,
  column: 'key' | 'key_hash',
  value: string,
  logPrefix: string,
): Promise<ApiKeyRecord | null> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, access_level, name, is_active, expires_at, permissions, key_context')
    .eq(column, value)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('key_context')) {
      const fallback = await supabase
        .from('api_keys')
        .select('id, user_id, access_level, name, is_active, expires_at, permissions')
        .eq(column, value)
        .maybeSingle();

      if (fallback.error) {
        console.error(`${logPrefix} error:`, fallback.error.message);
        return null;
      }
      return fallback.data;
    }
    console.error(`${logPrefix} error:`, error.message);
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
  permissions?: string[];
  key_context?: string | null;
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
