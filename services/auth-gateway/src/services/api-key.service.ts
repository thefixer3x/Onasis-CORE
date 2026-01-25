import crypto from 'crypto'
import { supabaseAdmin } from '../../db/client.js'
import { appendEventWithOutbox } from './event.service.js'

export interface ApiKey {
  id: string
  name: string
  key?: string // Only returned on creation
  user_id: string
  access_level: string
  permissions: string[]
  service: string // 'all' or 'specific' - controls external service access
  service_scopes?: ServiceScope[] // Populated when service = 'specific'
  expires_at?: string
  last_used_at?: string
  created_at: string
  is_active: boolean
}

export interface ServiceScope {
  service_key: string
  allowed_actions?: string[]
  max_calls_per_minute?: number
  max_calls_per_day?: number
}

export interface ConfiguredService {
  service_key: string
  display_name: string
  category: string
  is_enabled: boolean
}

// Rate limits can be specified per service_key or globally
export type ServiceScopeRateLimit = Record<string, { per_minute?: number; per_day?: number }>

interface ApiKeyRecord {
  id: string
  name: string
  key_hash: string
  user_id: string
  access_level: string
  permissions?: string[]
  service?: string // 'all' or 'specific'
  expires_at?: string
  last_used_at?: string
  created_at: string
  is_active: boolean
}

// Valid scopes for API keys (using colon notation to match services.config.ts)
export const VALID_SCOPES = new Set([
  // Memory scopes
  'memories:read', 'memories:write', 'memories:delete', 'memories:*',
  // Secret vault scopes
  'secrets:read', 'secrets:write', 'secrets:*',
  // MCP scopes
  'mcp:read', 'mcp:write', 'mcp:connect', 'mcp:full', 'mcp:tools', 'mcp:resources', 'mcp:prompts', 'mcp:*',
  // Profile scopes
  'profile:read', 'profile:write', 'profile:*',
  // Project scopes
  'projects:read', 'projects:write', 'projects:*',
  // Analytics scopes
  'analytics:read', 'analytics:*',
  // AI scopes
  'ai:chat', 'ai:*',
  // Media scopes
  'media:tts', 'media:stt', 'media:transcribe', 'media:*',
  // Content scopes
  'content:tags', 'content:summary', 'content:embedding', 'content:*',
  // API access
  'api:access',
  // Admin scopes
  'admin:*',
  // Legacy full access (for backward compatibility)
  'legacy:full_access',
  // Wildcard (all permissions)
  '*'
])

/**
 * Generate a secure API key with lano_ prefix
 * Aligned with dashboard implementation
 */
export function generateSecureApiKey(): string {
  const prefix = 'lano_' // Lanonasis API key prefix (aligned with dashboard)
  const randomBytes = crypto.randomBytes(32).toString('hex')
  return `${prefix}${randomBytes}`
}

/**
 * Hash an API key for secure storage using SHA-256
 * Aligned with mcp-core and dashboard implementations
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

/**
 * Verify an API key against a SHA-256 hash
 * Aligned with platform-wide SHA-256 standard
 *
 * @param apiKey - The API key to verify (can be raw or pre-hashed)
 * @param hash - The stored hash to compare against
 * @param isPreHashed - If true, apiKey is already a SHA-256 hash (64 hex chars)
 */
export async function verifyApiKeyHash(apiKey: string, hash: string, isPreHashed: boolean = false): Promise<boolean> {
  // If the key is already a hash, compare directly (case-insensitive for hex)
  if (isPreHashed) {
    return apiKey.toLowerCase() === hash.toLowerCase()
  }
  // Otherwise, hash the raw key and compare
  const computedHash = crypto.createHash('sha256').update(apiKey).digest('hex')
  return computedHash === hash
}

/**
 * Validate and normalize scopes
 * Returns a clean array of valid scopes
 */
export function normalizeScopes(scopes?: string[]): string[] {
  if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
    return ['legacy:full_access']
  }

  // Filter valid scopes (either in VALID_SCOPES set or matches pattern like "resource:action")
  // Supports both colon notation (standard) and dot notation (legacy, auto-converted)
  const colonPattern = /^[a-z_]+:(read|write|delete|connect|full|\*)$/
  const dotPattern = /^[a-z_]+\.(read|write|delete|connect|full|\*)$/

  const normalizedScopes = scopes.map(scope => {
    if (typeof scope !== 'string') return null
    let s = scope.trim().toLowerCase()

    // Convert legacy dot notation to colon notation
    if (dotPattern.test(s)) {
      s = s.replace('.', ':')
      console.warn(`[api-key.service] Auto-converting legacy dot scope "${scope}" to "${s}"`)
    }

    // Validate the scope
    if (VALID_SCOPES.has(s) || colonPattern.test(s)) {
      return s
    }
    return null
  }).filter((s): s is string => s !== null)

  // Warn about invalid scopes
  const invalidScopes = scopes.filter(s => {
    if (typeof s !== 'string') return true
    const scope = s.trim().toLowerCase()
    const converted = scope.replace('.', ':')
    return !VALID_SCOPES.has(scope) && !VALID_SCOPES.has(converted) &&
           !colonPattern.test(scope) && !colonPattern.test(converted) &&
           !dotPattern.test(scope)
  })
  if (invalidScopes.length > 0) {
    console.warn(`[api-key.service] Ignoring invalid scopes: ${invalidScopes.join(', ')}`)
  }

  // Ensure at least one valid scope
  return normalizedScopes.length > 0 ? normalizedScopes : ['legacy:full_access']
}

/**
 * Create a new API key for a user
 * Supports scoped permissions via the scopes parameter
 */
export async function createApiKey(
  user_id: string,
  params: {
    name: string
    access_level?: string
    expires_in_days?: number
    scopes?: string[]  // Scoped permissions for the API key
  }
): Promise<ApiKey> {
  try {
    // Validate parameters
    if (!params.name || typeof params.name !== 'string') {
      throw new Error('API key name is required')
    }

    // Validate access level
    const allowedAccess = new Set(['public', 'authenticated', 'team', 'admin', 'enterprise'])
    if (params.access_level && !allowedAccess.has(params.access_level)) {
      throw new Error('Invalid access_level. Allowed: public, authenticated, team, admin, enterprise')
    }

    // Validate and normalize scopes
    const permissions = normalizeScopes(params.scopes)

    // Validate and normalize expires_in_days
    let expiresDays: number | undefined = undefined
    if (params.expires_in_days !== undefined) {
      const n = Number(params.expires_in_days)
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        throw new Error('expires_in_days must be a positive integer')
      }
      // Upper bound to prevent excessively long-lived keys (10 years)
      if (n > 3650) {
        throw new Error('expires_in_days exceeds maximum allowed (3650)')
      }
      expiresDays = n
    }

    // Check for duplicate name
    const { data: existingByName } = await supabaseAdmin
      .from('api_keys')
      .select('id')
      .eq('user_id', user_id)
      .eq('name', params.name)
      .eq('is_active', true)
      .limit(1)

    if (existingByName && existingByName.length > 0) {
      throw new Error('An active API key with this name already exists')
    }

    // Generate secure API key
    const apiKey = generateSecureApiKey()
    const keyHash = await hashApiKey(apiKey)

    // Calculate expiration date
    let expiresAt: string | undefined
    if (expiresDays && expiresDays > 0) {
      expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString()
    }

    const apiKeyRecord = {
      id: `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: params.name,
      key_hash: keyHash,
      user_id,
      access_level: params.access_level || 'authenticated',
      permissions,  // Store scopes in permissions column
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      is_active: true,
    } as any

    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert(apiKeyRecord)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create API key: ${error.message}`)
    }

    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: data.id,
      event_type: 'ApiKeyCreated',
      payload: {
        user_id,
        access_level: data.access_level,
        permissions: data.permissions || permissions,
        expires_at: data.expires_at,
        name: data.name,
        created_at: data.created_at,
      },
      metadata: {
        source: 'auth-gateway',
      },
    })

    return {
      id: data.id,
      name: data.name,
      key: apiKey, // Only returned on creation
      user_id: data.user_id,
      access_level: data.access_level,
      permissions: data.permissions || permissions,
      service: data.service || 'all',
      expires_at: data.expires_at,
      created_at: data.created_at,
      is_active: data.is_active,
    }
  } catch (error) {
    throw new Error(`API key creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * List all API keys for a user
 * Includes service scope information
 */
export async function listApiKeys(user_id: string, params?: { active_only?: boolean; include_scopes?: boolean }): Promise<ApiKey[]> {
  try {
    let query = supabaseAdmin.from('api_keys').select('*').eq('user_id', user_id)

    // Apply filters
    if (params?.active_only !== false) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to list API keys: ${error.message}`)
    }

    // Fetch service scopes if requested
    const keys: ApiKey[] = await Promise.all(
      data.map(async (record: ApiKeyRecord) => {
        let serviceScopes: ServiceScope[] | undefined
        if (params?.include_scopes && record.service === 'specific') {
          serviceScopes = await getApiKeyServiceScopes(record.id)
        }

        return {
          id: record.id,
          name: record.name,
          user_id: record.user_id,
          access_level: record.access_level,
          permissions: record.permissions || [],
          service: record.service || 'all',
          service_scopes: serviceScopes,
          expires_at: record.expires_at,
          last_used_at: record.last_used_at,
          created_at: record.created_at,
          is_active: record.is_active,
        }
      })
    )

    return keys
  } catch (error) {
    throw new Error(`List API keys failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get a single API key by ID
 * Includes service scope information
 */
export async function getApiKey(key_id: string, user_id: string): Promise<ApiKey> {
  try {
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('id', key_id)
      .eq('user_id', user_id)
      .single()

    if (error || !data) {
      throw new Error('API key not found')
    }

    // Fetch service scopes if key has specific service access
    let serviceScopes: ServiceScope[] | undefined
    if (data.service === 'specific') {
      serviceScopes = await getApiKeyServiceScopes(key_id)
    }

    return {
      id: data.id,
      name: data.name,
      user_id: data.user_id,
      access_level: data.access_level,
      permissions: data.permissions || [],
      service: data.service || 'all',
      service_scopes: serviceScopes,
      expires_at: data.expires_at,
      last_used_at: data.last_used_at,
      created_at: data.created_at,
      is_active: data.is_active,
    }
  } catch (error) {
    throw new Error(`Get API key failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Update scopes for an existing API key
 */
export async function updateApiKeyScopes(key_id: string, user_id: string, scopes: string[]): Promise<ApiKey> {
  try {
    // Validate key exists
    const { data: existingKey, error: fetchError } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('id', key_id)
      .eq('user_id', user_id)
      .single()

    if (fetchError || !existingKey) {
      throw new Error('API key not found')
    }

    // Normalize scopes
    const permissions = normalizeScopes(scopes)

    // Update permissions
    const { data: updatedKey, error: updateError } = await supabaseAdmin
      .from('api_keys')
      .update({ permissions })
      .eq('id', key_id)
      .eq('user_id', user_id)
      .select()
      .single()

    if (updateError || !updatedKey) {
      throw new Error('Failed to update API key scopes')
    }

    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: updatedKey.id,
      event_type: 'ApiKeyScopesUpdated',
      payload: {
        user_id: updatedKey.user_id,
        old_permissions: existingKey.permissions || [],
        new_permissions: permissions,
      },
      metadata: {
        source: 'auth-gateway',
      },
    })

    return {
      id: updatedKey.id,
      name: updatedKey.name,
      user_id: updatedKey.user_id,
      access_level: updatedKey.access_level,
      permissions: updatedKey.permissions || permissions,
      service: updatedKey.service || 'all',
      expires_at: updatedKey.expires_at,
      last_used_at: updatedKey.last_used_at,
      created_at: updatedKey.created_at,
      is_active: updatedKey.is_active,
    }
  } catch (error) {
    throw new Error(`Update API key scopes failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Rotate an API key (generate new key value, keep same ID)
 */
export async function rotateApiKey(key_id: string, user_id: string): Promise<ApiKey> {
  try {
    // Get existing key
    const { data: existingKey, error: fetchError } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('id', key_id)
      .eq('user_id', user_id)
      .single()

    if (fetchError || !existingKey) {
      throw new Error('API key not found')
    }

    // Generate new key
    const newApiKey = generateSecureApiKey()
    const newKeyHash = await hashApiKey(newApiKey)

    // Update with new key
    const { data: updatedKey, error: updateError } = await supabaseAdmin
      .from('api_keys')
      .update({
        key_hash: newKeyHash,
        created_at: new Date().toISOString(),
      })
      .eq('id', key_id)
      .eq('user_id', user_id)
      .select()
      .single()

    if (updateError || !updatedKey) {
      throw new Error('Failed to rotate API key')
    }

    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: updatedKey.id,
      event_type: 'ApiKeyRotated',
      payload: {
        user_id: updatedKey.user_id,
        access_level: updatedKey.access_level,
        expires_at: updatedKey.expires_at,
      },
      metadata: {
        source: 'auth-gateway',
      },
    })

    return {
      id: updatedKey.id,
      name: updatedKey.name,
      key: newApiKey, // Return new key
      user_id: updatedKey.user_id,
      access_level: updatedKey.access_level,
      permissions: updatedKey.permissions || [],
      service: updatedKey.service || 'all',
      expires_at: updatedKey.expires_at,
      created_at: updatedKey.created_at,
      is_active: updatedKey.is_active,
    }
  } catch (error) {
    throw new Error(`Rotate API key failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Revoke an API key (soft delete - set is_active to false)
 */
export async function revokeApiKey(key_id: string, user_id: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', key_id)
      .eq('user_id', user_id)

    if (error) {
      throw new Error(`Failed to revoke API key: ${error.message}`)
    }

    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: key_id,
      event_type: 'ApiKeyRevoked',
      payload: {
        user_id,
        is_active: false,
      },
      metadata: {
        source: 'auth-gateway',
      },
    })

    return true
  } catch (error) {
    throw new Error(`Revoke API key failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Delete an API key (hard delete)
 */
export async function deleteApiKey(key_id: string, user_id: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('api_keys')
      .delete()
      .eq('id', key_id)
      .eq('user_id', user_id)

    if (error) {
      throw new Error(`Failed to delete API key: ${error.message}`)
    }

    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: key_id,
      event_type: 'ApiKeyDeleted',
      payload: {
        user_id,
      },
      metadata: {
        source: 'auth-gateway',
      },
    })

    return true
  } catch (error) {
    throw new Error(`Delete API key failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Update last_used_at timestamp for an API key
 */
export async function updateApiKeyUsage(key_id: string): Promise<void> {
  await supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key_id)
}

/**
 * Validate an API key
 * Supports migration period - accepts lano_, vx_, and lns_ prefixes
 */
export async function validateAPIKey(apiKey: string): Promise<{
  valid: boolean
  userId?: string
  projectScope?: string
  permissions?: string[]
  reason?: string
}> {
  try {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, reason: 'Invalid API key format' }
    }

    // Check if the key is already a SHA-256 hash (64 hex characters)
    // Some clients (like IDE extensions) hash keys client-side before sending
    const isHash = /^[a-f0-9]{64}$/i.test(apiKey.trim())

    if (!isHash) {
      // Only check prefixes for raw API keys, not hashes
      if (apiKey.startsWith('vx_')) {
        console.warn(
          `[api-key.service] DEPRECATED: API key with "vx_" prefix used (${apiKey.substring(0, 8)}...). ` +
          'Support for "vx_" keys will be removed soon. Please regenerate with "lano_" prefix.'
        )
      } else if (apiKey.startsWith('lns_')) {
        console.warn(
          `[api-key.service] DEPRECATED: API key with "lns_" prefix used (${apiKey.substring(0, 8)}...). ` +
          'This prefix has been replaced with "lano_". Please regenerate your API key.'
        )
      } else if (!apiKey.startsWith('lano_')) {
        // During migration, we're lenient but still validate the key
        console.warn(
          `[api-key.service] WARNING: API key with unknown prefix detected (${apiKey.substring(0, 8)}...). ` +
          'Expected "lano_" prefix. Key will still be validated against database.'
        )
      }
    }

    // Collect keys from multiple schemas (supporting migration from Neon to Supabase)
    // Priority: security_service > vsecure > public
    const allKeys: any[] = []

    // 1. Try security_service schema (primary location in Supabase after migration from Neon)
    try {
      const { data: securityServiceKeys, error: securityServiceError } = await supabaseAdmin
        .schema('security_service')
        .from('stored_api_keys')
        .select('*')
        .eq('status', 'active') // Use status enum if available

      if (securityServiceError) {
        // Check if it's a schema/table not found error (expected in some deployments)
        if (securityServiceError.code === '42P01' ||
          securityServiceError.message.includes('schema "security_service" does not exist') ||
          securityServiceError.message.includes('schema must be one of') ||
          securityServiceError.message.includes('relation') ||
          securityServiceError.message.includes('does not exist')) {
          // Schema doesn't exist - this is fine, continue to other schemas
        } else {
          console.warn('[api-key.service] security_service.stored_api_keys lookup error:', securityServiceError.message)
        }
      } else if (securityServiceKeys && securityServiceKeys.length > 0) {
        // Map security_service.stored_api_keys structure to common format
        securityServiceKeys.forEach((k: any) => {
          const isActive = k.status === 'active' || (k.is_active ?? true)
          if (isActive) {
            allKeys.push({
              ...k,
              key_hash: k.encrypted_value || k.key_hash, // stored_api_keys uses encrypted_value
              user_id: k.created_by || k.user_id || k.owner_id,
            })
          }
        })
      }
    } catch (err: any) {
      // Schema doesn't exist - this is fine, continue to other schemas
      if (err.message && !err.message.includes('schema') && !err.message.includes('does not exist')) {
        console.warn('[api-key.service] security_service schema access failed:', err.message)
      }
    }

    // 2. Try vsecure schema (if it exists in this deployment)
    // Note: vsecure schema may not be available in all Supabase instances
    // This was the original Neon schema, now migrated to security_service in Supabase
    try {
      const { data: vsecureKeys, error: vsecureError } = await supabaseAdmin
        .schema('vsecure')
        .from('lanonasis_api_keys')
        .select('*')

      if (vsecureError) {
        // Schema doesn't exist or table doesn't exist - this is expected in Supabase
        // Silently skip - no logging needed for expected missing schema
        if (!(vsecureError.code === '42P01' ||
          vsecureError.message.includes('schema "vsecure" does not exist') ||
          vsecureError.message.includes('schema must be one of') ||
          vsecureError.message.includes('relation') ||
          vsecureError.message.includes('does not exist'))) {
          // Only log unexpected errors (not schema-not-found errors)
          console.warn('[api-key.service] vsecure.lanonasis_api_keys lookup error:', vsecureError.message)
        }
      } else if (vsecureKeys && vsecureKeys.length > 0) {
        // Filter active keys by status/is_active flags if present
        vsecureKeys.forEach((k: any) => {
          const isActive =
            k.status ? k.status === 'active' : (k.is_active ?? true)
          if (isActive) allKeys.push(k)
        })
      }
    } catch (err: any) {
      // Schema doesn't exist - this is fine, continue to public schema
      // Don't log errors for missing schemas as this is expected in Supabase
      if (err.message && !err.message.includes('schema') && !err.message.includes('does not exist')) {
        console.warn('[api-key.service] vsecure schema access failed:', err.message)
      }
    }

    // 3. Legacy schema: public.api_keys (dashboard/user-generated keys)
    try {
      const { data: legacyKeys, error: legacyError } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('is_active', true)

      if (legacyError) {
        console.warn('[api-key.service] public.api_keys lookup error:', legacyError.message)
      } else if (legacyKeys && legacyKeys.length > 0) {
        allKeys.push(...legacyKeys)
      }
    } catch (err: any) {
      console.warn('[api-key.service] public.api_keys lookup failed:', err.message || err)
    }

    if (allKeys.length === 0) {
      return { valid: false, reason: 'No active API keys found' }
    }

    // Check each key hash (supports different column names)
    for (const keyRecord of allKeys) {
      const hashValue =
        keyRecord.key_hash ||
        keyRecord.hash ||
        keyRecord.hashed_value ||
        keyRecord.hashed_key
      if (!hashValue) {
        continue
      }

      // Pass isHash flag to prevent double-hashing when client sends pre-hashed key
      const isMatch = await verifyApiKeyHash(apiKey, hashValue, isHash)

      if (isMatch) {
        // Check expiration
        const expiresAtRaw = keyRecord.expires_at || keyRecord.expiration
        if (expiresAtRaw) {
          const expiresAt = new Date(expiresAtRaw)
          if (expiresAt < new Date()) {
            return { valid: false, reason: 'API key expired' }
          }
        }

        // Update last used timestamp
        if (keyRecord.id) {
          await updateApiKeyUsage(keyRecord.id)
        }

        // Return permissions (scopes) from the key record
        const permissions = keyRecord.permissions || keyRecord.scopes || ['legacy.full_access']

        return {
          valid: true,
          userId: keyRecord.user_id || keyRecord.owner_id || keyRecord.created_by,
          projectScope:
            keyRecord.project_scope ||
            keyRecord.access_level ||
            keyRecord.project_id ||
            keyRecord.organization_id,
          permissions,
        }
      }
    }

    return { valid: false, reason: 'API key not found' }
  } catch (error) {
    console.error('API key validation error:', error)
    return { valid: false, reason: 'Validation error' }
  }
}

// ============================================================================
// SERVICE SCOPING METHODS
// These methods manage which external services (Stripe, GitHub, etc.) an API key can access
// ============================================================================

/**
 * Get user's configured external services
 * Returns services the user has set up in their profile
 */
export async function getUserConfiguredServices(user_id: string): Promise<ConfiguredService[]> {
  try {
    // Try to get from user_mcp_services table (primary source)
    const { data: userServices, error } = await supabaseAdmin
      .from('user_mcp_services')
      .select(`
        service_key,
        is_enabled,
        mcp_service_catalog (
          display_name,
          category
        )
      `)
      .eq('user_id', user_id)

    if (error) {
      // Table might not exist in this deployment
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.warn('[api-key.service] user_mcp_services table not found, returning empty list')
        return []
      }
      throw error
    }

    return (userServices || []).map((s: any) => ({
      service_key: s.service_key,
      display_name: s.mcp_service_catalog?.display_name || s.service_key,
      category: s.mcp_service_catalog?.category || 'other',
      is_enabled: s.is_enabled ?? true,
    }))
  } catch (error) {
    console.error('[api-key.service] getUserConfiguredServices error:', error)
    return []
  }
}

/**
 * Get service scopes for an API key
 * Returns the list of external services this key can access
 */
export async function getApiKeyServiceScopes(key_id: string): Promise<ServiceScope[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('api_key_scopes')
      .select('service_key, allowed_actions, max_calls_per_minute, max_calls_per_day')
      .eq('api_key_id', key_id)

    if (error) {
      // Table might not exist
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return []
      }
      throw error
    }

    return (data || []).map((s: any) => ({
      service_key: s.service_key,
      allowed_actions: s.allowed_actions || undefined,
      max_calls_per_minute: s.max_calls_per_minute || undefined,
      max_calls_per_day: s.max_calls_per_day || undefined,
    }))
  } catch (error) {
    console.error('[api-key.service] getApiKeyServiceScopes error:', error)
    return []
  }
}

/**
 * Set service scopes for an API key
 * Replaces all existing scopes with the new list
 * @param key_id - API key ID
 * @param user_id - User ID (for ownership verification)
 * @param service_keys - Array of service keys to allow
 * @param rate_limits - Optional per-service rate limits
 */
export async function setApiKeyServiceScopes(
  key_id: string,
  user_id: string,
  service_keys: string[],
  rate_limits?: Record<string, { per_minute?: number; per_day?: number }>
): Promise<ServiceScope[]> {
  try {
    // Verify key ownership
    const { data: keyData, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('id, user_id, service')
      .eq('id', key_id)
      .eq('user_id', user_id)
      .single()

    if (keyError || !keyData) {
      throw new Error('API key not found or access denied')
    }

    // Validate service_keys against user's configured services
    const userServices = await getUserConfiguredServices(user_id)
    const validServiceKeys = new Set(userServices.filter(s => s.is_enabled).map(s => s.service_key))

    const invalidKeys = service_keys.filter(k => !validServiceKeys.has(k))
    if (invalidKeys.length > 0) {
      throw new Error(`Invalid or unconfigured services: ${invalidKeys.join(', ')}`)
    }

    // Delete existing scopes
    await supabaseAdmin
      .from('api_key_scopes')
      .delete()
      .eq('api_key_id', key_id)

    // Insert new scopes
    if (service_keys.length > 0) {
      const scopeRecords = service_keys.map(service_key => ({
        api_key_id: key_id,
        service_key,
        allowed_actions: [], // Allow all actions by default
        max_calls_per_minute: rate_limits?.[service_key]?.per_minute || null,
        max_calls_per_day: rate_limits?.[service_key]?.per_day || null,
      }))

      const { error: insertError } = await supabaseAdmin
        .from('api_key_scopes')
        .insert(scopeRecords)

      if (insertError) {
        throw new Error(`Failed to set service scopes: ${insertError.message}`)
      }
    }

    // Update the key's service field to 'specific' if scopes are set
    const newServiceValue = service_keys.length > 0 ? 'specific' : 'all'
    await supabaseAdmin
      .from('api_keys')
      .update({ service: newServiceValue })
      .eq('id', key_id)

    // Log the event
    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: key_id,
      event_type: 'ApiKeyServiceScopesUpdated',
      payload: {
        user_id,
        service_keys,
        service_type: newServiceValue,
      },
      metadata: {
        source: 'auth-gateway',
      },
    })

    return getApiKeyServiceScopes(key_id)
  } catch (error) {
    throw new Error(`Set service scopes failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check if an API key has access to a specific external service
 * Memory services are ALWAYS allowed
 */
export async function apiKeyHasServiceAccess(key_id: string, service_key: string): Promise<boolean> {
  try {
    // Memory services are always allowed
    const memoryServices = ['memory', 'memories', 'context', 'search', 'embeddings']
    if (memoryServices.some(m => service_key.toLowerCase().includes(m))) {
      return true
    }

    // Get the key's service field
    const { data: keyData, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('service')
      .eq('id', key_id)
      .eq('is_active', true)
      .single()

    if (keyError || !keyData) {
      return false
    }

    // If service = 'all', allow everything
    if (keyData.service === 'all' || !keyData.service) {
      return true
    }

    // If service = 'specific', check the scopes table
    const { data: scopeData, error: scopeError } = await supabaseAdmin
      .from('api_key_scopes')
      .select('service_key')
      .eq('api_key_id', key_id)
      .eq('service_key', service_key)
      .single()

    if (scopeError || !scopeData) {
      return false
    }

    return true
  } catch (error) {
    console.error('[api-key.service] apiKeyHasServiceAccess error:', error)
    return false
  }
}

/**
 * Create API key with service scopes
 * Extended version of createApiKey that supports external service scoping
 */
export async function createApiKeyWithServiceScopes(
  user_id: string,
  params: {
    name: string
    access_level?: string
    expires_in_days?: number
    scopes?: string[] // Permission scopes (memories:read, etc.)
    service_type?: 'all' | 'specific' // External service access type
    service_keys?: string[] // If service_type = 'specific', which services
    rate_limits?: Record<string, { per_minute?: number; per_day?: number }>
  }
): Promise<ApiKey> {
  // Create the base API key
  const apiKey = await createApiKey(user_id, {
    name: params.name,
    access_level: params.access_level,
    expires_in_days: params.expires_in_days,
    scopes: params.scopes,
  })

  // Set service field
  const serviceType = params.service_type || 'all'
  await supabaseAdmin
    .from('api_keys')
    .update({ service: serviceType })
    .eq('id', apiKey.id)

  // Set service scopes if specific
  let serviceScopes: ServiceScope[] = []
  if (serviceType === 'specific' && params.service_keys && params.service_keys.length > 0) {
    serviceScopes = await setApiKeyServiceScopes(
      apiKey.id,
      user_id,
      params.service_keys,
      params.rate_limits
    )
  }

  return {
    ...apiKey,
    service: serviceType,
    service_scopes: serviceScopes,
  }
}
