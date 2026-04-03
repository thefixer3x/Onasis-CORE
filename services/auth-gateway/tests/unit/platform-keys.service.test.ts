import { beforeEach, describe, expect, it, vi } from 'vitest'

let insertedRecord: Record<string, unknown> | undefined

const schemaMock = vi.fn()
const fromMock = vi.fn()
const appendEventWithOutbox = vi.fn()
const dbPoolQuery = vi.fn()

const duplicateFilterBuilder = {
  eq: vi.fn(() => duplicateFilterBuilder),
  limit: vi.fn(async () => ({ data: [], error: null })),
}

const insertResultSingle = vi.fn(async () => ({
  data: {
    ...insertedRecord,
    service: 'all',
  },
  error: null,
}))

const insertResultBuilder = {
  select: vi.fn(() => ({
    single: insertResultSingle,
  })),
}

const apiKeysTable = {
  select: vi.fn(() => duplicateFilterBuilder),
  insert: vi.fn((record: Record<string, unknown>) => {
    insertedRecord = record
    return insertResultBuilder
  }),
}

vi.mock('../../db/client.js', () => ({
  dbPool: {
    query: dbPoolQuery,
  },
  supabaseAdmin: {
    schema: schemaMock,
  },
  supabaseUsers: {
    schema: vi.fn(() => ({
      from: vi.fn(),
    })),
    from: vi.fn(),
  },
}))

vi.mock('../../src/services/event.service.js', () => ({
  appendEventWithOutbox,
}))

const { createApiKey, listApiKeys } = await import('../../src/services/api-key.service.js')

describe('platform key creation', () => {
  beforeEach(() => {
    insertedRecord = undefined
    vi.clearAllMocks()
    dbPoolQuery.mockReset()
    duplicateFilterBuilder.eq.mockReset()
    duplicateFilterBuilder.limit.mockReset()
    apiKeysTable.select.mockReset()
    apiKeysTable.insert.mockReset()
    insertResultBuilder.select.mockReset()
    insertResultSingle.mockReset()

    schemaMock.mockReturnValue({
      from: fromMock,
    })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'api_keys') {
        throw new Error(`Unexpected table lookup: ${table}`)
      }
      return apiKeysTable
    })

    duplicateFilterBuilder.eq.mockReturnValue(duplicateFilterBuilder)
    duplicateFilterBuilder.limit.mockResolvedValue({ data: [], error: null })
    insertResultSingle.mockImplementation(async () => ({
      data: {
        ...insertedRecord,
        service: 'all',
      },
      error: null,
    }))
    insertResultBuilder.select.mockReturnValue({
      single: insertResultSingle,
    })
    apiKeysTable.select.mockReturnValue(duplicateFilterBuilder)
    apiKeysTable.insert.mockImplementation((record: Record<string, unknown>) => {
      insertedRecord = record
      return insertResultBuilder
    })
  })

  it('writes new auth-gateway keys into security_service.api_keys', async () => {
    const apiKey = await createApiKey('user-123', {
      name: 'Test key',
      organization_id: '123e4567-e89b-12d3-a456-426614174000',
    })

    expect(schemaMock).toHaveBeenCalledWith('security_service')
    expect(fromMock).toHaveBeenCalledWith('api_keys')
    expect(apiKeysTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test key',
        user_id: 'user-123',
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        is_active: true,
      })
    )
    expect(apiKey).toMatchObject({
      name: 'Test key',
      user_id: 'user-123',
      access_level: 'authenticated',
      is_active: true,
    })
    expect(apiKey.key).toMatch(/^lano_/)
    expect(appendEventWithOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'ApiKeyCreated',
      })
    )
  })

  it('falls back to direct SQL when the canonical Supabase client rejects the key', async () => {
    duplicateFilterBuilder.limit.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid API key' },
    })

    insertResultSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid API key' },
    })

    dbPoolQuery
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          { column_name: 'id' },
          { column_name: 'name' },
          { column_name: 'key_hash' },
          { column_name: 'organization_id' },
          { column_name: 'user_id' },
          { column_name: 'access_level' },
          { column_name: 'permissions' },
          { column_name: 'expires_at' },
          { column_name: 'created_at' },
          { column_name: 'is_active' },
          { column_name: 'service' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'key-456',
            name: 'Fallback key',
            key_hash: 'hash',
            organization_id: '123e4567-e89b-12d3-a456-426614174000',
            user_id: 'user-123',
            access_level: 'authenticated',
            permissions: ['legacy:full_access'],
            expires_at: null,
            created_at: '2026-04-03T00:00:00.000Z',
            is_active: true,
            service: 'all',
            last_used: null,
          },
        ],
      })

    const apiKey = await createApiKey('user-123', {
      name: 'Fallback key',
      organization_id: '123e4567-e89b-12d3-a456-426614174000',
    })

    expect(dbPoolQuery).toHaveBeenCalled()
    expect(apiKey).toMatchObject({
      id: 'key-456',
      name: 'Fallback key',
      access_level: 'authenticated',
      service: 'all',
      is_active: true,
    })
    expect(apiKey.key).toMatch(/^lano_/)
  })

  it('lists canonical keys through direct SQL fallback when PostgREST auth is unavailable', async () => {
    apiKeysTable.select.mockReturnValueOnce({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: null,
            error: { message: 'Invalid API key' },
          })),
        })),
        order: vi.fn(async () => ({
          data: null,
          error: { message: 'Invalid API key' },
        })),
      })),
    })

    dbPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'key-list-1',
          name: 'List key',
          key_hash: 'hash',
          organization_id: '123e4567-e89b-12d3-a456-426614174000',
          user_id: 'user-123',
          access_level: 'authenticated',
          permissions: ['projects:read'],
          expires_at: null,
          created_at: '2026-04-03T00:00:00.000Z',
          is_active: true,
          service: 'all',
          last_used: null,
        },
      ],
    })

    const keys = await listApiKeys('user-123')

    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({
      id: 'key-list-1',
      name: 'List key',
      permissions: ['projects:read'],
    })
  })
})
