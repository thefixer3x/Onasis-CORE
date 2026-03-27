import { beforeEach, describe, expect, it, vi } from 'vitest'

let insertedRecord: Record<string, unknown> | undefined

const schemaMock = vi.fn()
const fromMock = vi.fn()
const appendEventWithOutbox = vi.fn()

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

const { createApiKey } = await import('../../src/services/api-key.service.js')

describe('platform key creation', () => {
  beforeEach(() => {
    insertedRecord = undefined
    vi.clearAllMocks()

    schemaMock.mockReturnValue({
      from: fromMock,
    })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'api_keys') {
        throw new Error(`Unexpected table lookup: ${table}`)
      }
      return apiKeysTable
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
})
