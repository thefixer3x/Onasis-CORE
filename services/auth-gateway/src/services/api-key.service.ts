import crypto from 'crypto'
import { dbPool, supabaseAdmin, supabaseUsers } from '../../db/client.js'
import { appendEventWithOutbox } from './event.service.js'

const AUTH_GATEWAY_API_KEYS_SCHEMA = 'security_service'

function authGatewayApiKeysTable() {
  return supabaseAdmin.schema(AUTH_GATEWAY_API_KEYS_SCHEMA).from('api_keys')
}

export type ApiKeyContext = 'personal' | 'team' | 'enterprise'

interface CanonicalApiKeyRow extends Record<string, unknown> {
  id: string
  name: string
  description?: string | null
  key_hash: string
  organization_id?: string
  user_id: string
  access_level?: string
  key_context?: ApiKeyContext | null
  permissions?: unknown
  service?: string | null
  last_used?: string | null
  last_used_at?: string | null
  expires_at?: string | null
  created_at: string
  is_active: boolean
}

let canonicalApiKeyColumnsPromise: Promise<Set<string>> | null = null

function shouldFallbackToDirectDb(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const message = (error.message || '').toLowerCase()
  return (
    error.code === '42P01' ||
    message.includes('invalid api key') ||
    message.includes('schema must be one of') ||
    message.includes('does not exist') ||
    message.includes('relation') ||
    message.includes('schema')
  )
}

async function getCanonicalApiKeyColumns(): Promise<Set<string>> {
  if (!canonicalApiKeyColumnsPromise) {
    canonicalApiKeyColumnsPromise = dbPool
      .query<{ column_name: string }>(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'security_service'
          AND table_name = 'api_keys'
        `
      )
      .then(({ rows }) => new Set(rows.map(row => row.column_name)))
      .catch(error => {
        canonicalApiKeyColumnsPromise = null
        throw error
      })
  }

  return canonicalApiKeyColumnsPromise
}

function normalizePermissionsValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string')
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string')
      }
    } catch {
      return value.trim().length > 0 ? [value] : []
    }
  }

  return []
}

function readApiKeyContextValue(value: unknown): ApiKeyContext | null {
  if (typeof value === 'string' && VALID_API_KEY_CONTEXTS.has(value as ApiKeyContext)) {
    return value as ApiKeyContext
  }

  return null
}

function mapCanonicalApiKeyRow(row: CanonicalApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    description: (row.description as string | null | undefined) ?? null,
    key_hash: row.key_hash,
    user_id: row.user_id,
    access_level: typeof row.access_level === 'string' ? row.access_level : 'authenticated',
    key_context: readApiKeyContextValue(row.key_context),
    permissions: normalizePermissionsValue(row.permissions),
    service: typeof row.service === 'string' ? row.service : 'all',
    expires_at: typeof row.expires_at === 'string' ? row.expires_at : undefined,
    last_used_at:
      typeof row.last_used_at === 'string'
        ? row.last_used_at
        : typeof row.last_used === 'string'
          ? row.last_used
          : undefined,
    created_at: row.created_at,
    is_active: Boolean(row.is_active),
  }
}

async function hasActiveCanonicalKeyWithName(userId: string, name: string, excludeKeyId?: string): Promise<boolean> {
  const { rows } = await dbPool.query<{ id: string }>(
    `
    SELECT id
    FROM security_service.api_keys
    WHERE user_id = $1
      AND name = $2
      AND is_active = true
      ${excludeKeyId ? 'AND id <> $3' : ''}
    LIMIT 1
    `,
    excludeKeyId ? [userId, name, excludeKeyId] : [userId, name]
  )

  return rows.length > 0
}

async function insertCanonicalApiKeyDirect(record: {
  id: string
  name: string
  description?: string | null
  key_hash: string
  organization_id: string
  user_id: string
  access_level: string
  key_context?: ApiKeyContext | null
  permissions: string[]
  expires_at?: string
  created_at: string
  is_active: boolean
  service?: string
}): Promise<ApiKeyRecord> {
  const columns = await getCanonicalApiKeyColumns()
  const fieldNames = [
    'id',
    'name',
    'key_hash',
    'organization_id',
    'user_id',
    'access_level',
    'permissions',
    'expires_at',
    'created_at',
    'is_active',
  ]
  const values: unknown[] = [
    record.id,
    record.name,
    record.key_hash,
    record.organization_id,
    record.user_id,
    record.access_level,
    JSON.stringify(record.permissions),
    record.expires_at ?? null,
    record.created_at,
    record.is_active,
  ]

  if (columns.has('service')) {
    fieldNames.push('service')
    values.push(record.service ?? 'all')
  }

  if (columns.has('description')) {
    fieldNames.push('description')
    values.push(record.description ?? null)
  }

  if (columns.has('key_context') && record.key_context !== undefined) {
    fieldNames.push('key_context')
    values.push(record.key_context ?? null)
  }

  const placeholders = values.map((_, index) => `$${index + 1}`)
  const { rows } = await dbPool.query<CanonicalApiKeyRow>(
    `
    INSERT INTO security_service.api_keys (${fieldNames.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *
    `,
    values
  )

  return mapCanonicalApiKeyRow(rows[0])
}

async function listCanonicalApiKeysDirect(userId: string, activeOnly = true): Promise<ApiKeyRecord[]> {
  const params: unknown[] = [userId]
  const activeFilter = activeOnly ? 'AND is_active = true' : ''
  const { rows } = await dbPool.query<CanonicalApiKeyRow>(
    `
    SELECT *
    FROM security_service.api_keys
    WHERE user_id = $1
    ${activeFilter}
    ORDER BY created_at DESC
    `,
    params
  )

  return rows.map(mapCanonicalApiKeyRow)
}

async function getCanonicalApiKeyDirect(keyId: string, userId: string): Promise<ApiKeyRecord | null> {
  const { rows } = await dbPool.query<CanonicalApiKeyRow>(
    `
    SELECT *
    FROM security_service.api_keys
    WHERE id = $1
      AND user_id = $2
    LIMIT 1
    `,
    [keyId, userId]
  )

  return rows[0] ? mapCanonicalApiKeyRow(rows[0]) : null
}

async function updateCanonicalApiKeyDirect(
  keyId: string,
  userId: string,
  updatePayload: Record<string, unknown>
): Promise<ApiKeyRecord | null> {
  const columns = await getCanonicalApiKeyColumns()
  const assignments: string[] = []
  const values: unknown[] = []

  for (const [field, rawValue] of Object.entries(updatePayload)) {
    let column = field
    let value = rawValue

    if (field === 'last_used_at') {
      column = columns.has('last_used_at') ? 'last_used_at' : 'last_used'
    }

    if (!columns.has(column)) {
      continue
    }

    if (field === 'permissions') {
      value = JSON.stringify(rawValue)
    }

    values.push(value)
    assignments.push(`${column} = $${values.length}`)
  }

  if (assignments.length === 0) {
    return getCanonicalApiKeyDirect(keyId, userId)
  }

  values.push(keyId, userId)
  const { rows } = await dbPool.query<CanonicalApiKeyRow>(
    `
    UPDATE security_service.api_keys
    SET ${assignments.join(', ')}
    WHERE id = $${values.length - 1}
      AND user_id = $${values.length}
    RETURNING *
    `,
    values
  )

  return rows[0] ? mapCanonicalApiKeyRow(rows[0]) : null
}

async function updateCanonicalApiKeyByIdDirect(
  keyId: string,
  updatePayload: Record<string, unknown>
): Promise<void> {
  const columns = await getCanonicalApiKeyColumns()
  const assignments: string[] = []
  const values: unknown[] = []

  for (const [field, rawValue] of Object.entries(updatePayload)) {
    let column = field
    let value = rawValue

    if (field === 'last_used_at') {
      column = columns.has('last_used_at') ? 'last_used_at' : 'last_used'
    }

    if (!columns.has(column)) {
      continue
    }

    if (field === 'permissions') {
      value = JSON.stringify(rawValue)
    }

    values.push(value)
    assignments.push(`${column} = $${values.length}`)
  }

  if (assignments.length === 0) {
    return
  }

  values.push(keyId)
  await dbPool.query(
    `
    UPDATE security_service.api_keys
    SET ${assignments.join(', ')}
    WHERE id = $${values.length}
    `,
    values
  )
}

async function deleteCanonicalApiKeyDirect(keyId: string, userId: string): Promise<boolean> {
  const result = await dbPool.query(
    `
    DELETE FROM security_service.api_keys
    WHERE id = $1
      AND user_id = $2
    `,
    [keyId, userId]
  )

  return Boolean(result.rowCount)
}

export interface ApiKey {
  id: string
  name: string
  description?: string | null
  key?: string // Only returned on creation
  user_id: string
  access_level: string
  key_context?: ApiKeyContext | null
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
  key_context?: ApiKeyContext | null
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

const VALID_API_KEY_CONTEXTS = new Set<ApiKeyContext>(['personal', 'team', 'enterprise'])

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

function normalizeApiKeyContext(value?: string | null): ApiKeyContext | null | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.length === 0) {
    return null
  }

  if (VALID_API_KEY_CONTEXTS.has(normalized as ApiKeyContext)) {
    return normalized as ApiKeyContext
  }

  throw new Error('Invalid key_context. Allowed: personal, team, enterprise')
}

function getContextDefaultScope(keyContext: ApiKeyContext): string {
  switch (keyContext) {
    case 'personal':
      return 'memories:personal:*'
    case 'team':
      return 'memories:team:*'
    case 'enterprise':
      return 'memories:*'
  }
}

function resolveApiKeyPermissions(scopes: string[] | undefined, keyContext: ApiKeyContext | null | undefined): string[] {
  if (!keyContext) {
    return normalizeScopes(scopes)
  }

  const normalizedScopes = scopes && scopes.length > 0 ? normalizeScopes(scopes) : []
  const requiredScope = getContextDefaultScope(keyContext)

  return normalizedScopes.includes(requiredScope)
    ? normalizedScopes
    : normalizeScopes([...normalizedScopes, requiredScope])
}

function resolveValidatedKeyContext(value: unknown): ApiKeyContext | 'legacy' {
  return readApiKeyContextValue(value) ?? 'legacy'
}

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
    key_context: record.key_context ?? null,
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
    key_context?: ApiKeyContext | null
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
    const keyContext = normalizeApiKeyContext(params.key_context)
    const permissions = resolveApiKeyPermissions(params.scopes, keyContext)

    // Resolve organization_id — required by security_service.api_keys (FK constraint)
    // Auth controller guarantees every issued token carries a valid org UUID.
    const organization_id = params.organization_id
    if (!organization_id || !UUID_RE.test(organization_id)) {
      throw new Error('No organization found for this session. Please log out and log in again.')
    }

    // Check for duplicate name
    let duplicateExists = false
    const duplicateLookup = await authGatewayApiKeysTable()
      .select('id')
      .eq('user_id', user_id)
      .eq('name', params.name)
      .eq('is_active', true)
      .limit(1)

    if (duplicateLookup.error && shouldFallbackToDirectDb(duplicateLookup.error)) {
      console.warn('[api-key.service] Falling back to direct DB duplicate check:', duplicateLookup.error.message)
      duplicateExists = await hasActiveCanonicalKeyWithName(user_id, params.name)
    } else if (duplicateLookup.error) {
      throw new Error(`Failed to check existing API keys: ${duplicateLookup.error.message}`)
    } else {
      duplicateExists = Boolean(duplicateLookup.data && duplicateLookup.data.length > 0)
    }

    if (duplicateExists) {
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

    if (keyContext !== undefined) {
      apiKeyRecord.key_context = keyContext
    }

    const insertResult = await authGatewayApiKeysTable()
      .insert(apiKeyRecord)
      .select()
      .single()

    const data = insertResult.error && shouldFallbackToDirectDb(insertResult.error)
      ? await insertCanonicalApiKeyDirect({
          ...apiKeyRecord,
          access_level: apiKeyRecord.access_level,
          key_context: apiKeyRecord.key_context,
          permissions,
          service: 'all',
        })
      : insertResult.data

    if (!data) {
      throw new Error(`Failed to create API key: ${insertResult.error?.message || 'No API key returned'}`)
    }

    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: data.id,
      event_type: 'ApiKeyCreated',
      payload: {
        user_id,
        access_level: data.access_level,
        key_context: data.key_context ?? keyContext ?? null,
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

    const result = await query.order('created_at', { ascending: false })
    const data = result.error && shouldFallbackToDirectDb(result.error)
      ? await listCanonicalApiKeysDirect(user_id, params?.active_only !== false)
      : result.data

    if (!data) {
      throw new Error(`Failed to list API keys: ${result.error?.message || 'No API keys returned'}`)
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
    const result = await authGatewayApiKeysTable()
      .select('*')
      .eq('id', key_id)
      .eq('user_id', user_id)
      .single()

    const data = result.error && shouldFallbackToDirectDb(result.error)
      ? await getCanonicalApiKeyDirect(key_id, user_id)
      : result.data

    if (!data) {
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
    const existingResult = await authGatewayApiKeysTable()
      .select('*')
      .eq('id', key_id)
      .eq('user_id', user_id)
      .single()

    const existingKey = existingResult.error && shouldFallbackToDirectDb(existingResult.error)
      ? await getCanonicalApiKeyDirect(key_id, user_id)
      : existingResult.data

    if (!existingKey) {
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
        const duplicateResult = await authGatewayApiKeysTable()
          .select('id')
          .eq('user_id', user_id)
          .eq('name', normalizedName)
          .eq('is_active', true)
          .limit(1)

        const duplicateExists = duplicateResult.error && shouldFallbackToDirectDb(duplicateResult.error)
          ? await hasActiveCanonicalKeyWithName(user_id, normalizedName, key_id)
          : Boolean(
              duplicateResult.data &&
              duplicateResult.data.some((record: { id: string }) => record.id !== key_id)
            )

        if (duplicateExists) {
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

    const updateResult = await authGatewayApiKeysTable()
      .update(updatePayload)
      .eq('id', key_id)
      .eq('user_id', user_id)
      .select()
      .single()

    const updatedKey = updateResult.error && shouldFallbackToDirectDb(updateResult.error)
      ? await updateCanonicalApiKeyDirect(key_id, user_id, updatePayload)
      : updateResult.data

    if (!updatedKey) {
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
    const existingResult = await authGatewayApiKeysTable()
      .select('*')
      .eq('id', key_id)
      .eq('user_id', user_id)
      .single()

    const existingKey = existingResult.error && shouldFallbackToDirectDb(existingResult.error)
      ? await getCanonicalApiKeyDirect(key_id, user_id)
      : existingResult.data

    if (!existingKey) {
      throw new Error('API key not found')
    }

    // Generate new key
    const newApiKey = generateSecureApiKey()
    const newKeyHash = await hashApiKey(newApiKey)

    // Update with new key
    const updateResult = await authGatewayApiKeysTable()
      .update({
        key_hash: newKeyHash,
        created_at: new Date().toISOString(),
      })
      .eq('id', key_id)
      .eq('user_id', user_id)
      .select()
      .single()

    const updatedKey = updateResult.error && shouldFallbackToDirectDb(updateResult.error)
      ? await updateCanonicalApiKeyDirect(key_id, user_id, {
          key_hash: newKeyHash,
          created_at: new Date().toISOString(),
        })
      : updateResult.data

    if (!updatedKey) {
      throw new Error('Failed to rotate API key')
    }

    await appendEventWithOutbox({
      aggregate_type: 'api_key',
      aggregate_id: updatedKey.id,
      event_type: 'ApiKeyRotated',
      payload: {
        user_id: updatedKey.user_id,
        access_level: updatedKey.access_level,
        key_context: updatedKey.key_context ?? null,
        expires_at: updatedKey.expires_at,
      },
      metadata: {
        source: 'auth-gateway',
      },
    })

    return {
      ...mapApiKeyRecord(updatedKey),
      key: newApiKey, // Return new key
      permissions: updatedKey.permissions || [],
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
    const result = await authGatewayApiKeysTable()
      .update({ is_active: false })
      .eq('id', key_id)
      .eq('user_id', user_id)

    if (result.error && shouldFallbackToDirectDb(result.error)) {
      const updated = await updateCanonicalApiKeyDirect(key_id, user_id, { is_active: false })
      if (!updated) {
        throw new Error('Failed to revoke API key: API key not found')
      }
    } else if (result.error) {
      throw new Error(`Failed to revoke API key: ${result.error.message}`)
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
    const result = await authGatewayApiKeysTable()
      .delete()
      .eq('id', key_id)
      .eq('user_id', user_id)

    if (result.error && shouldFallbackToDirectDb(result.error)) {
      const deleted = await deleteCanonicalApiKeyDirect(key_id, user_id)
      if (!deleted) {
        throw new Error('Failed to delete API key: API key not found')
      }
    } else if (result.error) {
      throw new Error(`Failed to delete API key: ${result.error.message}`)
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
  const result = await authGatewayApiKeysTable()
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key_id)

  if (result.error && shouldFallbackToDirectDb(result.error)) {
    await updateCanonicalApiKeyByIdDirect(key_id, { last_used_at: new Date().toISOString() })
  }
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
  keyContext?: ApiKeyContext | 'legacy'
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

      if (gwError && shouldFallbackToDirectDb(gwError)) {
        const { rows } = await dbPool.query<CanonicalApiKeyRow>(
          `
          SELECT *
          FROM security_service.api_keys
          WHERE is_active = true
          `
        )
        rows.forEach((key) => {
          const mapped = mapCanonicalApiKeyRow(key)
          allKeys.push({
            ...mapped,
            organization_id: key.organization_id,
          })
        })
      } else if (gwError) {
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
          keyContext: resolveValidatedKeyContext(keyRecord.key_context),
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
    key_context?: ApiKeyContext | null
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
    key_context: params.key_context,
    organization_id: params.organization_id,
  })

  // Set service field
  const serviceType = params.service_type || 'all'
  const updateResult = await authGatewayApiKeysTable()
    .update({ service: serviceType })
    .eq('id', apiKey.id)

  if (updateResult.error && shouldFallbackToDirectDb(updateResult.error)) {
    await updateCanonicalApiKeyByIdDirect(apiKey.id, { service: serviceType })
  }

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
