import { beforeEach, describe, expect, it, vi } from 'vitest'

let updatePayload: Record<string, unknown> | undefined

const schemaMock = vi.fn()
const fromMock = vi.fn()
const appendEventWithOutbox = vi.fn()

const existingKey = {
  id: 'key-123',
  name: 'Existing key',
  description: 'Existing description',
  user_id: 'user-123',
  access_level: 'authenticated',
  permissions: ['legacy:full_access'],
  service: 'all',
  expires_at: null,
  last_used_at: null,
  created_at: '2026-03-30T10:00:00.000Z',
  is_active: true,
}

const existingKeyBuilder = {
  eq: vi.fn(() => existingKeyBuilder),
  single: vi.fn(async () => ({ data: existingKey, error: null })),
}

const duplicateFilterBuilder = {
  eq: vi.fn(() => duplicateFilterBuilder),
  limit: vi.fn(async () => ({ data: [], error: null })),
}

const updateResultSingle = vi.fn(async () => ({
  data: {
    ...existingKey,
    ...(updatePayload || {}),
  },
  error: null,
}))

const updateBuilder = {
  eq: vi.fn(() => updateBuilder),
  select: vi.fn(() => ({
    single: updateResultSingle,
  })),
}

let selectCallCount = 0

const apiKeysTable = {
  select: vi.fn(() => {
    selectCallCount += 1
    return selectCallCount === 1 ? existingKeyBuilder : duplicateFilterBuilder
  }),
  update: vi.fn((payload: Record<string, unknown>) => {
    updatePayload = payload
    return updateBuilder
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

const { updateApiKey } = await import('../../src/services/api-key.service.js')

describe('platform key updates', () => {
  beforeEach(() => {
    updatePayload = undefined
    selectCallCount = 0
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

  it('updates mutable platform fields and emits an update event', async () => {
    const updatedKey = await updateApiKey('key-123', 'user-123', {
      name: 'Renamed key',
      description: 'Updated description',
      access_level: 'team',
      expires_in_days: 30,
      scopes: ['memories:personal:read', 'projects:read'],
    })

    expect(schemaMock).toHaveBeenCalledWith('security_service')
    expect(fromMock).toHaveBeenCalledWith('api_keys')
    expect(apiKeysTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Renamed key',
        description: 'Updated description',
        access_level: 'team',
        permissions: ['memories:personal:read', 'projects:read'],
      })
    )
    expect(updatePayload?.expires_at).toEqual(expect.any(String))
    expect(updatedKey).toMatchObject({
      id: 'key-123',
      name: 'Renamed key',
      description: 'Updated description',
      access_level: 'team',
      permissions: ['memories:personal:read', 'projects:read'],
      is_active: true,
    })
    expect(appendEventWithOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'ApiKeyUpdated',
      })
    )
  })
})
