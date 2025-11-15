import { getClientWithSchema } from '../../db/client.js'
import { ProjectServiceError, getProjectById } from './projects.service.js'

export interface StoredApiKey {
  id: string
  name: string
  encryptedValue: string
  keyType: string
  environment: string
  projectId: string
  organizationId: string
  accessLevel: string
  status: string
  tags: string[]
  usageCount: number
  lastRotated: string | null
  rotationFrequency: number | null
  expiresAt: string | null
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateStoredKeyInput {
  name: string
  encryptedValue: string
  keyType?: string
  environment?: string
  accessLevel?: string
  tags?: string[]
  rotationFrequency?: number
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export interface UpdateStoredKeyInput {
  name?: string
  encryptedValue?: string
  keyType?: string
  environment?: string
  accessLevel?: string
  status?: string
  tags?: string[]
  rotationFrequency?: number
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}

interface StoredApiKeyRecord {
  id: string
  name: string
  encrypted_value: string
  key_type: string
  environment: string
  project_id: string
  organization_id: string
  access_level: string
  status: string
  tags: string[] | null
  usage_count: number
  last_rotated: string | null
  rotation_frequency: number | null
  expires_at: string | null
  metadata: Record<string, unknown> | null
  created_by: string
  created_at: string
  updated_at: string
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class StoredKeyServiceError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode = 500, code = 'STORED_KEY_ERROR') {
    super(message)
    this.name = 'StoredKeyServiceError'
    this.statusCode = statusCode
    this.code = code
  }
}

/**
 * List all stored API keys for a project
 * Validates user has access to the project
 */
export async function listStoredKeysForProject(
  projectId: string,
  userId: string,
  role?: string
): Promise<StoredApiKey[]> {
  // Verify user has access to project
  await getProjectById(projectId, userId, role)

  const client = await getClientWithSchema()

  try {
    const result = await client.query<StoredApiKeyRecord>(
      `
        SELECT
          id, name, encrypted_value, key_type, environment,
          project_id, organization_id, access_level, status,
          tags, usage_count, last_rotated, rotation_frequency,
          expires_at, metadata, created_by, created_at, updated_at
        FROM stored_api_keys
        WHERE project_id = $1
        ORDER BY created_at DESC
      `,
      [projectId]
    )

    return result.rows.map(mapStoredKeyRecord)
  } catch (error) {
    throw wrapUnknownError(error, 'Failed to list stored API keys')
  } finally {
    client.release()
  }
}

/**
 * Get a specific stored API key by ID
 * Validates user has access to the parent project
 */
export async function getStoredKeyById(
  projectId: string,
  keyId: string,
  userId: string,
  role?: string
): Promise<StoredApiKey> {
  // Verify user has access to project
  const project = await getProjectById(projectId, userId, role)

  if (!isUuid(keyId)) {
    throw new StoredKeyServiceError('Invalid key ID', 400, 'INVALID_KEY_ID')
  }

  const client = await getClientWithSchema()

  try {
    const result = await client.query<StoredApiKeyRecord>(
      `
        SELECT
          id, name, encrypted_value, key_type, environment,
          project_id, organization_id, access_level, status,
          tags, usage_count, last_rotated, rotation_frequency,
          expires_at, metadata, created_by, created_at, updated_at
        FROM stored_api_keys
        WHERE id = $1 AND project_id = $2 AND organization_id = $3
        LIMIT 1
      `,
      [keyId, projectId, project.organizationId]
    )

    if (!result.rows[0]) {
      throw new StoredKeyServiceError('Stored API key not found', 404, 'KEY_NOT_FOUND')
    }

    return mapStoredKeyRecord(result.rows[0])
  } catch (error) {
    if (error instanceof StoredKeyServiceError) {
      throw error
    }
    throw wrapUnknownError(error, 'Failed to get stored API key')
  } finally {
    client.release()
  }
}

/**
 * Create a new stored API key
 * Validates user has access to the project
 */
export async function createStoredKey(
  projectId: string,
  userId: string,
  role: string | undefined,
  input: CreateStoredKeyInput
): Promise<StoredApiKey> {
  // Verify user has access to project
  const project = await getProjectById(projectId, userId, role)

  const name = (input.name || '').trim()
  if (!name) {
    throw new StoredKeyServiceError('Key name is required', 400, 'INVALID_NAME')
  }

  if (!input.encryptedValue) {
    throw new StoredKeyServiceError('Encrypted value is required', 400, 'INVALID_VALUE')
  }

  const keyType = input.keyType || 'api_key'
  const environment = input.environment || 'development'
  const accessLevel = input.accessLevel || 'team'
  const tags = Array.isArray(input.tags) ? input.tags : []
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {}

  const client = await getClientWithSchema()

  try {
    const result = await client.query<StoredApiKeyRecord>(
      `
        INSERT INTO stored_api_keys (
          name, encrypted_value, key_type, environment,
          project_id, organization_id, access_level, status,
          tags, rotation_frequency, expires_at, metadata, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, $11::jsonb, $12)
        RETURNING *
      `,
      [
        name,
        input.encryptedValue,
        keyType,
        environment,
        projectId,
        project.organizationId,
        accessLevel,
        tags,
        input.rotationFrequency || null,
        input.expiresAt || null,
        JSON.stringify(metadata),
        userId,
      ]
    )

    return mapStoredKeyRecord(result.rows[0])
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new StoredKeyServiceError(
        'A key with this name already exists in the project',
        409,
        'KEY_CONFLICT'
      )
    }
    throw wrapUnknownError(error, 'Failed to create stored API key')
  } finally {
    client.release()
  }
}

/**
 * Update an existing stored API key
 * Validates user has access to the project
 */
export async function updateStoredKey(
  projectId: string,
  keyId: string,
  userId: string,
  role: string | undefined,
  updates: UpdateStoredKeyInput
): Promise<StoredApiKey> {
  // Verify key exists and user has access
  const existingKey = await getStoredKeyById(projectId, keyId, userId, role)

  const fields: string[] = []
  const values: unknown[] = []
  let index = 1

  if (updates.name !== undefined) {
    const name = updates.name.trim()
    if (!name) {
      throw new StoredKeyServiceError('Key name cannot be empty', 400, 'INVALID_NAME')
    }
    fields.push(`name = $${index++}`)
    values.push(name)
  }

  if (updates.encryptedValue !== undefined) {
    if (!updates.encryptedValue) {
      throw new StoredKeyServiceError('Encrypted value cannot be empty', 400, 'INVALID_VALUE')
    }
    fields.push(`encrypted_value = $${index++}`)
    values.push(updates.encryptedValue)
    // Update last_rotated when encrypted value changes
    fields.push(`last_rotated = NOW()`)
  }

  if (updates.keyType !== undefined) {
    fields.push(`key_type = $${index++}`)
    values.push(updates.keyType)
  }

  if (updates.environment !== undefined) {
    fields.push(`environment = $${index++}`)
    values.push(updates.environment)
  }

  if (updates.accessLevel !== undefined) {
    fields.push(`access_level = $${index++}`)
    values.push(updates.accessLevel)
  }

  if (updates.status !== undefined) {
    fields.push(`status = $${index++}`)
    values.push(updates.status)
  }

  if (updates.tags !== undefined) {
    const tags = Array.isArray(updates.tags) ? updates.tags : []
    fields.push(`tags = $${index++}`)
    values.push(tags)
  }

  if (updates.rotationFrequency !== undefined) {
    fields.push(`rotation_frequency = $${index++}`)
    values.push(updates.rotationFrequency)
  }

  if (updates.expiresAt !== undefined) {
    fields.push(`expires_at = $${index++}`)
    values.push(updates.expiresAt)
  }

  if (updates.metadata !== undefined) {
    const metadata = updates.metadata && typeof updates.metadata === 'object' ? updates.metadata : {}
    fields.push(`metadata = $${index++}::jsonb`)
    values.push(JSON.stringify(metadata))
  }

  if (fields.length === 0) {
    return existingKey
  }

  fields.push(`updated_at = NOW()`)

  const client = await getClientWithSchema()

  try {
    const whereIndex = values.length + 1
    const projectIdIndex = values.length + 2
    const result = await client.query<StoredApiKeyRecord>(
      `
        UPDATE stored_api_keys
        SET ${fields.join(', ')}
        WHERE id = $${whereIndex} AND project_id = $${projectIdIndex}
        RETURNING *
      `,
      [...values, keyId, projectId]
    )

    if (!result.rows[0]) {
      throw new StoredKeyServiceError('Key not found', 404, 'KEY_NOT_FOUND')
    }

    return mapStoredKeyRecord(result.rows[0])
  } catch (error) {
    if (error instanceof StoredKeyServiceError) {
      throw error
    }
    if ((error as { code?: string }).code === '23505') {
      throw new StoredKeyServiceError(
        'A key with this name already exists in the project',
        409,
        'KEY_CONFLICT'
      )
    }
    throw wrapUnknownError(error, 'Failed to update stored API key')
  } finally {
    client.release()
  }
}

/**
 * Delete a stored API key
 * Validates user has access to the project
 */
export async function deleteStoredKey(
  projectId: string,
  keyId: string,
  userId: string,
  role?: string
): Promise<void> {
  // Verify key exists and user has access
  await getStoredKeyById(projectId, keyId, userId, role)

  const client = await getClientWithSchema()

  try {
    const result = await client.query(
      `DELETE FROM stored_api_keys WHERE id = $1 AND project_id = $2`,
      [keyId, projectId]
    )

    if (result.rowCount === 0) {
      throw new StoredKeyServiceError('Key not found', 404, 'KEY_NOT_FOUND')
    }
  } catch (error) {
    if (error instanceof StoredKeyServiceError) {
      throw error
    }
    throw wrapUnknownError(error, 'Failed to delete stored API key')
  } finally {
    client.release()
  }
}

function mapStoredKeyRecord(record: StoredApiKeyRecord): StoredApiKey {
  return {
    id: record.id,
    name: record.name,
    encryptedValue: record.encrypted_value,
    keyType: record.key_type,
    environment: record.environment,
    projectId: record.project_id,
    organizationId: record.organization_id,
    accessLevel: record.access_level,
    status: record.status,
    tags: Array.isArray(record.tags) ? record.tags : [],
    usageCount: record.usage_count,
    lastRotated: record.last_rotated,
    rotationFrequency: record.rotation_frequency,
    expiresAt: record.expires_at,
    metadata: record.metadata ?? {},
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }
}

function isUuid(value: string | undefined | null): value is string {
  if (!value) return false
  return UUID_REGEX.test(value)
}

function wrapUnknownError(error: unknown, message: string): StoredKeyServiceError {
  if (error instanceof StoredKeyServiceError) {
    return error
  }
  if (error instanceof ProjectServiceError) {
    // Convert ProjectServiceError to StoredKeyServiceError
    return new StoredKeyServiceError(error.message, error.statusCode, error.code)
  }
  const err = error as Error
  return new StoredKeyServiceError(
    `${message}: ${err.message || 'Unknown error'}`,
    500,
    'STORED_KEY_ERROR'
  )
}
