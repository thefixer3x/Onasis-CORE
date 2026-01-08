import { dbPool, getClientWithSchema } from '../../db/client.js'

export interface Project {
  id: string
  name: string
  description: string | null
  organizationId: string
  ownerId: string
  teamMembers: string[]
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  description?: string
  organizationId: string
  teamMembers?: string[]
  settings?: Record<string, unknown>
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  teamMembers?: string[]
  settings?: Record<string, unknown>
}

export interface ProjectApiKey {
  id: string
  name: string
  keyType: string
  environment: string
  accessLevel: string
  projectId: string
  organizationId: string
  status: string
  tags: string[]
  rotationFrequency: number | null
  usageCount: number | null
  lastRotated: string | null
  expiresAt: string | null
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface ProjectRecord {
  id: string
  name: string
  description: string | null
  organization_id: string
  owner_id: string
  team_members: string[] | null
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface StoredApiKeyRecord {
  id: string
  name: string
  key_type: string
  environment: string
  access_level: string
  project_id: string
  organization_id: string
  status: string
  tags: string[] | null
  rotation_frequency: number | null
  usage_count: number | null
  last_rotated: string | null
  expires_at: string | null
  metadata: Record<string, unknown> | null
  created_by: string
  created_at: string
  updated_at: string
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class ProjectServiceError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode = 500, code = 'PROJECT_SERVICE_ERROR') {
    super(message)
    this.name = 'ProjectServiceError'
    this.statusCode = statusCode
    this.code = code
  }
}

export async function listProjectsForUser(userId: string, role?: string): Promise<Project[]> {
  const client = await getClientWithSchema()
  const isAdmin = isPrivilegedRole(role)

  try {
    const query = isAdmin
      ? 'SELECT * FROM api_key_projects ORDER BY created_at DESC'
      : `
        SELECT *
        FROM api_key_projects
        WHERE owner_id = $1
           OR $1 = ANY(COALESCE(team_members, '{}'::uuid[]))
        ORDER BY created_at DESC
      `

    const params = isAdmin ? [] : [userId]
    const result = await client.query<ProjectRecord>(query, params)
    return result.rows.map(mapProjectRecord)
  } catch (error) {
    throw wrapUnknownError(error, 'Failed to list projects')
  } finally {
    client.release()
  }
}

export async function getProjectById(
  projectId: string,
  userId: string,
  role?: string
): Promise<Project> {
  const record = await fetchProjectForUser(projectId, userId, role)
  return mapProjectRecord(record)
}

export async function createProject(ownerId: string, input: CreateProjectInput): Promise<Project> {
  const name = (input.name || '').trim()
  if (!name) {
    throw new ProjectServiceError('Project name is required', 400, 'INVALID_NAME')
  }

  if (!isUuid(input.organizationId)) {
    throw new ProjectServiceError('A valid organizationId is required', 400, 'INVALID_ORGANIZATION')
  }

  const teamMembers = normalizeTeamMembers(input.teamMembers, ownerId)
  const settings = normalizeSettings(input.settings)
  const description = input.description?.trim() || null

  const client = await getClientWithSchema()

  try {
    const result = await client.query<ProjectRecord>(
      `
        INSERT INTO api_key_projects (
          name,
          description,
          organization_id,
          owner_id,
          team_members,
          settings
        )
        VALUES ($1, $2, $3, $4, $5::uuid[], $6::jsonb)
        RETURNING *
      `,
      [name, description, input.organizationId, ownerId, teamMembers, JSON.stringify(settings)]
    )

    return mapProjectRecord(result.rows[0])
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ProjectServiceError(
        'A project with this name already exists in the organization',
        409,
        'PROJECT_CONFLICT'
      )
    }
    throw wrapUnknownError(error, 'Failed to create project')
  } finally {
    client.release()
  }
}

export async function updateProject(
  projectId: string,
  userId: string,
  role: string | undefined,
  updates: UpdateProjectInput
): Promise<Project> {
  const project = await fetchProjectForUser(projectId, userId, role)
  const fields: string[] = []
  const values: unknown[] = []
  let index = 1

  if (updates.name !== undefined) {
    const name = updates.name.trim()
    if (!name) {
      throw new ProjectServiceError('Project name cannot be empty', 400, 'INVALID_NAME')
    }
    fields.push(`name = $${index++}`)
    values.push(name)
  }

  if (updates.description !== undefined) {
    const description = updates.description?.trim() || null
    fields.push(`description = $${index++}`)
    values.push(description)
  }

  if (updates.teamMembers !== undefined) {
    const teamMembers = normalizeTeamMembers(updates.teamMembers, project.owner_id)
    fields.push(`team_members = $${index++}::uuid[]`)
    values.push(teamMembers)
  }

  if (updates.settings !== undefined) {
    const settings = normalizeSettings(updates.settings)
    fields.push(`settings = $${index++}::jsonb`)
    values.push(JSON.stringify(settings))
  }

  if (fields.length === 0) {
    return mapProjectRecord(project)
  }

  fields.push(`updated_at = NOW()`)

  const client = await getClientWithSchema()

  try {
    const whereIndex = values.length + 1
    const result = await client.query<ProjectRecord>(
      `
        UPDATE api_key_projects
        SET ${fields.join(', ')}
        WHERE id = $${whereIndex}
        RETURNING *
      `,
      [...values, projectId]
    )

    return mapProjectRecord(result.rows[0])
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ProjectServiceError(
        'A project with this name already exists in the organization',
        409,
        'PROJECT_CONFLICT'
      )
    }
    throw wrapUnknownError(error, 'Failed to update project')
  } finally {
    client.release()
  }
}

export async function deleteProject(
  projectId: string,
  userId: string,
  role?: string
): Promise<void> {
  const project = await fetchProjectForUser(projectId, userId, role)

  if (!isPrivilegedRole(role) && project.owner_id !== userId) {
    throw new ProjectServiceError('Only the project owner can delete the project', 403, 'NOT_OWNER')
  }

  const client = await getClientWithSchema()

  try {
    const result = await client.query(
      `DELETE FROM api_key_projects WHERE id = $1`,
      [projectId]
    )

    if (result.rowCount === 0) {
      throw new ProjectServiceError('Project not found', 404, 'PROJECT_NOT_FOUND')
    }
  } catch (error) {
    throw wrapUnknownError(error, 'Failed to delete project')
  } finally {
    client.release()
  }
}

export async function listProjectKeys(
  projectId: string,
  userId: string,
  role?: string
): Promise<ProjectApiKey[]> {
  await fetchProjectForUser(projectId, userId, role)

  const client = await getClientWithSchema()

  try {
    const result = await client.query<StoredApiKeyRecord>(
      `
        SELECT
          id,
          name,
          key_type,
          environment,
          access_level,
          project_id,
          organization_id,
          status,
          tags,
          rotation_frequency,
          usage_count,
          last_rotated,
          expires_at,
          metadata,
          created_by,
          created_at,
          updated_at
        FROM stored_api_keys
        WHERE project_id = $1
        ORDER BY created_at DESC
      `,
      [projectId]
    )

    return result.rows.map(mapStoredKeyRecord)
  } catch (error) {
    throw wrapUnknownError(error, 'Failed to list project API keys')
  } finally {
    client.release()
  }
}

async function fetchProjectForUser(
  projectId: string,
  userId: string,
  role?: string
): Promise<ProjectRecord> {
  if (!isUuid(projectId)) {
    throw new ProjectServiceError('Invalid project id', 400, 'INVALID_PROJECT_ID')
  }

  const client = await getClientWithSchema()
  const isAdmin = isPrivilegedRole(role)

  try {
    const query = isAdmin
      ? 'SELECT * FROM api_key_projects WHERE id = $1 LIMIT 1'
      : `
        SELECT *
        FROM api_key_projects
        WHERE id = $1
          AND (owner_id = $2 OR $2 = ANY(COALESCE(team_members, '{}'::uuid[])))
        LIMIT 1
      `

    const params = isAdmin ? [projectId] : [projectId, userId]
    const result = await client.query<ProjectRecord>(query, params)

    if (!result.rows[0]) {
      throw new ProjectServiceError('Project not found or access denied', 404, 'PROJECT_NOT_FOUND')
    }

    return result.rows[0]
  } catch (error) {
    if (error instanceof ProjectServiceError) {
      throw error
    }
    throw wrapUnknownError(error, 'Failed to load project')
  } finally {
    client.release()
  }
}

function mapProjectRecord(record: ProjectRecord): Project {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    organizationId: record.organization_id,
    ownerId: record.owner_id,
    teamMembers: Array.isArray(record.team_members) ? record.team_members : [],
    settings: record.settings ?? {},
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }
}

function mapStoredKeyRecord(record: StoredApiKeyRecord): ProjectApiKey {
  return {
    id: record.id,
    name: record.name,
    keyType: record.key_type,
    environment: record.environment,
    accessLevel: record.access_level,
    projectId: record.project_id,
    organizationId: record.organization_id,
    status: record.status,
    tags: Array.isArray(record.tags) ? record.tags : [],
    rotationFrequency: record.rotation_frequency,
    usageCount: record.usage_count,
    lastRotated: record.last_rotated,
    expiresAt: record.expires_at,
    metadata: record.metadata ?? {},
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }
}

function normalizeTeamMembers(teamMembers: unknown, ownerId: string): string[] {
  if (!Array.isArray(teamMembers)) {
    return []
  }

  const deduped = new Set<string>()

  for (const member of teamMembers) {
    if (typeof member !== 'string') continue
    const value = member.trim()
    if (!value || value === ownerId) continue
    if (!isUuid(value)) continue
    deduped.add(value)
  }

  return Array.from(deduped)
}

function normalizeSettings(settings: unknown): Record<string, unknown> {
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    return settings as Record<string, unknown>
  }
  return {}
}

function isUuid(value: string | undefined | null): value is string {
  if (!value) return false
  return UUID_REGEX.test(value)
}

function isPrivilegedRole(role?: string | null): boolean {
  if (!role) return false
  const normalized = role.toLowerCase()
  return normalized === 'admin' || normalized === 'platform_admin' || normalized === 'service_role'
}

function wrapUnknownError(error: unknown, message: string): ProjectServiceError {
  if (error instanceof ProjectServiceError) {
    return error
  }
  const err = error as Error
  return new ProjectServiceError(
    `${message}: ${err.message || 'Unknown error'}`,
    500,
    'PROJECT_SERVICE_ERROR'
  )
}
