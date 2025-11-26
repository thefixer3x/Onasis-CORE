import crypto from 'crypto'
import { supabaseAdmin } from '../../db/client.js'

export interface ApiKey {
  id: string
  name: string
  key?: string // Only returned on creation
  user_id: string
  access_level: string
  permissions: string[]
  expires_at?: string
  last_used_at?: string
  created_at: string
  is_active: boolean
}

interface ApiKeyRecord {
  id: string
  name: string
  key_hash: string
  user_id: string
  access_level: string
  permissions?: string[]
  expires_at?: string
  last_used_at?: string
  created_at: string
  is_active: boolean
}

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
 */
export async function verifyApiKeyHash(apiKey: string, hash: string): Promise<boolean> {
  const computedHash = crypto.createHash('sha256').update(apiKey).digest('hex')
  return computedHash === hash
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(
  user_id: string,
  params: {
    name: string
    access_level?: string
    expires_in_days?: number
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

    return {
      id: data.id,
      name: data.name,
      key: apiKey, // Only returned on creation
      user_id: data.user_id,
      access_level: data.access_level,
      permissions: [],
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
 */
export async function listApiKeys(user_id: string, params?: { active_only?: boolean }): Promise<ApiKey[]> {
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

    return data.map((record: ApiKeyRecord) => ({
      id: record.id,
      name: record.name,
      user_id: record.user_id,
      access_level: record.access_level,
      permissions: record.permissions || [],
      expires_at: record.expires_at,
      last_used_at: record.last_used_at,
      created_at: record.created_at,
      is_active: record.is_active,
    }))
  } catch (error) {
    throw new Error(`List API keys failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get a single API key by ID
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

    return {
      id: data.id,
      name: data.name,
      user_id: data.user_id,
      access_level: data.access_level,
      permissions: data.permissions || [],
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

    return {
      id: updatedKey.id,
      name: updatedKey.name,
      key: newApiKey, // Return new key
      user_id: updatedKey.user_id,
      access_level: updatedKey.access_level,
      permissions: updatedKey.permissions || [],
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

    // Check for deprecated prefixes and log warnings
    if (apiKey.startsWith('vx_')) {
      console.warn(
        `⚠️  DEPRECATED: API key with "vx_" prefix used (${apiKey.substring(0, 8)}...). ` +
        'Support for "vx_" keys will be removed soon. Please regenerate with "lano_" prefix.'
      )
    } else if (apiKey.startsWith('lns_')) {
      console.warn(
        `⚠️  DEPRECATED: API key with "lns_" prefix used (${apiKey.substring(0, 8)}...). ` +
        'This prefix has been replaced with "lano_". Please regenerate your API key.'
      )
    } else if (!apiKey.startsWith('lano_')) {
      // During migration, we're lenient but still validate the key
      console.warn(
        `⚠️  WARNING: API key with unknown prefix detected (${apiKey.substring(0, 8)}...). ` +
        'Expected "lano_" prefix. Key will still be validated against database.'
      )
    }

    // Collect keys from both vsecure (new) and public (legacy) schemas
    const allKeys: any[] = []

    // New schema: vsecure.lanonasis_api_keys
    try {
      const { data: vsecureKeys, error: vsecureError } = await supabaseAdmin
        .schema('vsecure')
        .from('lanonasis_api_keys')
        .select('*')

      if (vsecureError) {
        console.warn('vsecure.lanonasis_api_keys lookup error:', vsecureError.message)
      } else if (vsecureKeys && vsecureKeys.length > 0) {
        // Filter active keys by status/is_active flags if present
        vsecureKeys.forEach((k: any) => {
          const isActive =
            k.status ? k.status === 'active' : (k.is_active ?? true)
          if (isActive) allKeys.push(k)
        })
      }
    } catch (err) {
      console.warn('vsecure.lanonasis_api_keys lookup failed:', err)
    }

    // Legacy schema: public.api_keys
    try {
      const { data: legacyKeys, error: legacyError } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('is_active', true)

      if (legacyError) {
        console.warn('public.api_keys lookup error:', legacyError.message)
      } else if (legacyKeys && legacyKeys.length > 0) {
        allKeys.push(...legacyKeys)
      }
    } catch (err) {
      console.warn('public.api_keys lookup failed:', err)
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

      const isMatch = await verifyApiKeyHash(apiKey, hashValue)

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

        return {
          valid: true,
          userId: keyRecord.user_id || keyRecord.owner_id || keyRecord.created_by,
          projectScope:
            keyRecord.project_scope ||
            keyRecord.access_level ||
            keyRecord.project_id ||
            keyRecord.organization_id,
          permissions: keyRecord.permissions || keyRecord.scopes || [],
        }
      }
    }

    return { valid: false, reason: 'API key not found' }
  } catch (error) {
    console.error('API key validation error:', error)
    return { valid: false, reason: 'Validation error' }
  }
}
