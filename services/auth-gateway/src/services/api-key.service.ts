import crypto from 'crypto'
import { supabaseAdmin, supabaseUsers } from '../../db/client.js'
import { appendEventWithOutbox } from './event.service.js'

const AUTH_GATEWAY_API_KEYS_SCHEMA = 'security_service'

function authGatewayApiKeysTable() {
  return supabaseAdmin.schema(AUTH_GATEWAY_API_KEYS_SCHEMA).from('api_keys')
}

export interface ApiKey {
  id: string
  name: string
  description?: string | null
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
  description?: string | null
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
  // Three-part scopes (e.g. memories:personal:read, memories:team:*) are valid per D3 decision
  const colonPattern = /^[a-z_]+(:([a-z_]+|\*))+$/
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_ACCESS_LEVELS = new Set(['public', 'authenticated', 'team', 'admin', 'enterprise'])

function normalizeApiKeyDescription(description?: string | null): string | null | undefined {
  if (description === undefined) {
    return undefined
  }

  if (description === null) {
    return null
  }

  const normalized = description.trim()
  return normalized.length > 0 ? normalized : null
}

function resolveExpiresAt(expiresInDays?: number): string | undefined {
  if (expiresInDays === undefined) {
    return undefined
  }

  const parsed = Number(expiresInDays)
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error('expires_in_days must be a positive integer')
  }
  if (parsed > 3650) {
    throw new Error('expires_in_days exceeds maximum allowed (3650)')
  }

  return new Date(Date.now() + parsed * 24 * 60 * 60 * 1000).toISOString()
}

function mapApiKeyRecord(record: ApiKeyRecord, serviceScopes?: ServiceScope[]): ApiKey {
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? null,
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
    description?: string | null
    scopes?: string[]  // Scoped permissions for the API key
    organization_id?: string  // Required by security_service.api_keys FK
  }
): Promise<ApiKey> {
  try {
    // Validate parameters
    if (!params.name || typeof params.name !== 'string') {
      throw new Error('API key name is required')
    }

    // Validate access level
    if (params.access_level && !ALLOWED_ACCESS_LEVELS.has(params.access_level)) {
      throw new Error('Invalid access_level. Allowed: public, authenticated, team, admin, enterprise')
    }

    // Validate and normalize scopes
    const permissions = normalizeScopes(params.scopes)

    // Resolve organization_id — required by security_service.api_keys (FK constraint)
    // Auth controller guarantees every issued token carries a valid org UUID.
    const organization_id = params.organization_id
    if (!organization_id || !UUID_RE.test(organization_id)) {
      throw new Error('No organization found for this session. Please log out and log in again.')
    }

    // Check for duplicate name
    const { data: existingByName } = await authGatewayApiKeysTable()
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
    const expiresAt = resolveExpiresAt(params.expires_in_days)
    const description = normalizeApiKeyDescription(params.description)

    const apiKeyRecord = {
      id: crypto.randomUUID(),
      name: params.name,
      description,
      key_hash: keyHash,
      organization_id,
      user_id,
      access_level: params.access_level || 'authenticated',
      permissions,  // Store scopes in permissions column
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      is_active: true,
    } as any

    const { data, error } = await authGatewayApiKeysTable()
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
      ...mapApiKeyRecord(data),
      key: apiKey, // Only returned on creation
      permissions: data.permissions || permissions,
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
    let query = authGatewayApiKeysTable().select('*').eq('user_id', user_id)

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
          ...mapApiKeyRecord(record, serviceScopes),
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
    const { data, error } = await authGatewayApiKeysTable()
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

    return mapApiKeyRecord(data, serviceScopes)
  } catch (error) {
    throw new Error(`Get API key failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Update mutable platform API key fields
 */
export async function updateApiKey(
  key_id: string,
  user_id: string,
  params: {
    name?: string
    description?: string | null
    access_level?: string
    expires_in_days?: number
    clear_expiry?: boolean
    scopes?: string[]
  }
): Promise<ApiKey> {
  try {
    const { data: existingKey, error: fetchError } = await authGatewayApiKeysTable()
      .select('*')
      .eq('id', key_id)
      .eq('user_id', user_id)
      .single()

    if (fetchError || !existingKey) {
      throw new Error('API key not found')
    }

    const updatePayload: Record<string, unknown> = {}
    const changedFields: string[] = []

    if (params.name !== undefined) {
      const normalizedName = params.name.trim()
      if (normalizedName.length === 0) {
        throw new Error('API key name is required')
      }

      if (normalizedName !== existingKey.name) {
        const { data: duplicateByName } = await authGatewayApiKeysTable()
          .select('id')
          .eq('user_id', user_id)
          .eq('name', normalizedName)
          .eq('is_active', true)
          .limit(1)

        if (duplicateByName && duplicateByName.some((record: { id: string }) => record.id !== key_id)) {
          throw new Error('An active API key with this name already exists')
        }
      }

      updatePayload.name = normalizedName
      changedFields.push('name')
    }

    if (params.description !== undefined) {
      updatePayload.description = normalizeApiKeyDescription(params.description)
      changedFields.push('description')
    }

    if (params.access_level !== undefined) {
      if (!ALLOWED_ACCESS_LEVELS.has(params.access_level)) {
        throw new Error('Invalid access_level. Allowed: public, authenticated, team, admin, enterprise')
      }

      updatePayload.access_level = params.access_level
      changedFields.push('access_level')
    }

    if (params.clear_expiry && params.expires_in_days !== undefined) {
      throw new Error('Cannot set expires_in_days and clear_expiry together')
    }

    if (params.clear_expiry) {
      updatePayload.expires_at = null
      changedFields.push('expires_at')
    } else if (params.expires_in_days !== undefined) {
      updatePayload.expires_at = resolveExpiresAt(params.expires_in_days)
      changedFields.push('expires_at')
    }

    if (params.scopes !== undefined) {
      updatePayload.permissions = normalizeScopes(params.scopes)
      changedFields.push('permissions')
    }

    if (changedFields.length === 0) {
      throw new Error('At least one updatable field is required')
    }

    const { data: updatedKey, error: updateError } = await authGatewayApiKeysTable()
      .update(updatePayload)
      .eq('id', key_id)
      .eq('user_id', user_id)
      .select()
      .single()

    if (updateError || !updatedKey) {
      throw new Error('Failed to update API key')
    }

    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: updatedKey.id,
      event_type: 'ApiKeyUpdated',
      payload: {
        user_id: updatedKey.user_id,
        changed_fields: changedFields,
        previous: {
          name: existingKey.name,
          description: existingKey.description ?? null,
          access_level: existingKey.access_level,
          permissions: existingKey.permissions || [],
          expires_at: existingKey.expires_at ?? null,
        },
        current: {
          name: updatedKey.name,
          description: updatedKey.description ?? null,
          access_level: updatedKey.access_level,
          permissions: updatedKey.permissions || [],
          expires_at: updatedKey.expires_at ?? null,
        },
      },
      metadata: {
        source: 'auth-gateway',
      },
    })

    let serviceScopes: ServiceScope[] | undefined
    if (updatedKey.service === 'specific') {
      serviceScopes = await getApiKeyServiceScopes(key_id)
    }

    return mapApiKeyRecord(updatedKey, serviceScopes)
  } catch (error) {
    throw new Error(`Update API key failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Update scopes for an existing API key
 */
export async function updateApiKeyScopes(key_id: string, user_id: string, scopes: string[]): Promise<ApiKey> {
  return updateApiKey(key_id, user_id, { scopes })
}

/**
 * Rotate an API key (generate new key value, keep same ID)
 */
export async function rotateApiKey(key_id: string, user_id: string): Promise<ApiKey> {
  try {
    // Get existing key
    const { data: existingKey, error: fetchError } = await authGatewayApiKeysTable()
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
    const { data: updatedKey, error: updateError } = await authGatewayApiKeysTable()
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
    const { error } = await authGatewayApiKeysTable()
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
    const { error } = await authGatewayApiKeysTable()
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
  await authGatewayApiKeysTable()
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
  organizationId?: string
  projectScope?: string
  permissions?: string[]
  reason?: string
  /** DB primary key of the matched api_key record. Used for audit attribution. */
  keyId?: string
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

    // Lookup order:
    // Step 0: supabaseAdmin → security_service.api_keys (auth-gateway DB, ptnrwrgzrsbocgxlpvhd) — PRIMARY store for API-managed keys
    // Step 1: supabaseUsers → security_service.stored_api_keys (main Supabase, mxtsdgkwzjzlttpotole) — vault table
    // Step 2: supabaseUsers → vsecure.lanonasis_api_keys (main Supabase) — legacy Neon-migrated keys
    // Step 3: supabaseUsers → public.api_keys (main Supabase) — MaaS/dashboard keys
    const allKeys: any[] = []

    // 0. Auth-gateway canonical store: security_service.api_keys (ptnrwrgzrsbocgxlpvhd)
    // This is where createApiKey/rotateApiKey/revokeApiKey write via supabaseAdmin
    try {
      const { data: gwKeys, error: gwError } = await authGatewayApiKeysTable()
        .select('*')
        .eq('is_active', true)

      if (gwError) {
        if (!(gwError.code === '42P01' ||
          gwError.message?.includes('does not exist') ||
          gwError.message?.includes('schema must be one of'))) {
          console.warn('[api-key.service] security_service.api_keys (auth-gw) lookup error:', gwError.message)
        }
      } else if (gwKeys && gwKeys.length > 0) {
        gwKeys.forEach((k: any) => {
          // Map last_used → last_used_at for consistent field name
          allKeys.push({ ...k, last_used_at: k.last_used_at ?? k.last_used })
        })
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('schema') && !err.message.includes('does not exist')) {
        console.warn('[api-key.service] auth-gw security_service.api_keys access failed:', err.message)
      }
    }

    // 1. security_service.stored_api_keys (vault-style table, encrypted_value column)
    try {
      const { data: securityServiceKeys, error: securityServiceError } = await supabaseUsers
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
      const { data: vsecureKeys, error: vsecureError } = await supabaseUsers
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
      const { data: legacyKeys, error: legacyError } = await supabaseUsers
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
        const permissions = keyRecord.permissions || keyRecord.scopes || ['legacy:full_access']

        return {
          valid: true,
          userId: keyRecord.user_id || keyRecord.owner_id || keyRecord.created_by,
          organizationId: keyRecord.organization_id,
          projectScope:
            keyRecord.project_scope ||
            keyRecord.access_level ||
            keyRecord.project_id ||
            keyRecord.organization_id,
          permissions,
          keyId: keyRecord.id ?? undefined,
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
    const { data: keyData, error: keyError } = await authGatewayApiKeysTable()
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
    await authGatewayApiKeysTable()
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
    const { data: keyData, error: keyError } = await authGatewayApiKeysTable()
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
    description?: string | null
    scopes?: string[] // Permission scopes (memories:read, etc.)
    service_type?: 'all' | 'specific' // External service access type
    service_keys?: string[] // If service_type = 'specific', which services
    rate_limits?: Record<string, { per_minute?: number; per_day?: number }>
    organization_id?: string  // Required by security_service.api_keys FK
  }
): Promise<ApiKey> {
  // Create the base API key
  const apiKey = await createApiKey(user_id, {
    name: params.name,
    access_level: params.access_level,
    expires_in_days: params.expires_in_days,
    description: params.description,
    scopes: params.scopes,
    organization_id: params.organization_id,
  })

  // Set service field
  const serviceType = params.service_type || 'all'
  await authGatewayApiKeysTable()
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
