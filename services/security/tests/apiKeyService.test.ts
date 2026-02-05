import { beforeAll, describe, expect, it, vi } from 'vitest';

// Set required env before importing modules that validate on load
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.API_KEY_ENCRYPTION_KEY = 'a'.repeat(32);
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long-0000';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-service-role-key';
process.env.NODE_ENV = 'test';

vi.mock('../config/env.js', () => ({
  env: {
    API_KEY_ENCRYPTION_KEY: process.env.API_KEY_ENCRYPTION_KEY!,
    JWT_SECRET: process.env.JWT_SECRET!,
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    NODE_ENV: 'test',
    PORT: 4100,
    LOG_LEVEL: 'info',
  },
}));

const projectInsertPayloads: unknown[] = [];
const auditInsertPayloads: Array<{ table: string; payload: unknown }> = [];

type ApiKeyProjectsInsertReturn = {
  select: () => {
    single: () => Promise<{ data: Record<string, unknown>; error: null }>;
  };
};

type ApiKeyProjectsApi = {
  insert: (payload: Record<string, unknown>) => ApiKeyProjectsInsertReturn;
};

type GenericSelectReturn = {
  single: () => Promise<{ data: null; error: null }>;
};

type GenericTableApi = {
  insert: (payload: Record<string, unknown>) => Promise<{ data: null; error: null }>;
  select: () => GenericSelectReturn;
  update: (payload: Record<string, unknown>) => Promise<{ data: null; error: null }>;
  eq: (column: string, value: unknown) => GenericTableApi;
};

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'api_key_projects') {
      const insert: ApiKeyProjectsApi['insert'] = vi.fn((payload: Record<string, unknown>) => {
        projectInsertPayloads.push(payload);

        const organizationId =
          typeof payload['organization_id'] === 'string'
            ? payload['organization_id']
            : typeof payload['organizationId'] === 'string'
              ? payload['organizationId']
              : undefined;

        const ownerId =
          typeof payload['owner_id'] === 'string'
            ? payload['owner_id']
            : typeof payload['ownerId'] === 'string'
              ? payload['ownerId']
              : undefined;

        return {
          select: () => ({
            single: async () => {
              const project = {
                ...payload,
                id: 'proj-1',
                organization_id: organizationId,
                owner_id: ownerId,
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z',
              };
              return { data: project, error: null };
            },
          }),
        };
      }) as unknown as ApiKeyProjectsApi['insert'];

      const api: ApiKeyProjectsApi = { insert };
      return api;
    }

    const api = {} as GenericTableApi;
    api.insert = vi.fn(async (payload: Record<string, unknown>) => {
      auditInsertPayloads.push({ table, payload });
      return { data: null, error: null };
    }) as unknown as GenericTableApi['insert'];
    api.select = vi.fn(() => ({
      single: vi.fn(async () => ({ data: null, error: null })),
    })) as unknown as GenericTableApi['select'];
    api.update = vi.fn(async () => ({ data: null, error: null })) as unknown as GenericTableApi['update'];
    api.eq = vi.fn(() => api) as unknown as GenericTableApi['eq'];

    return api;
  }),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseMock),
}));

let ApiKeyService: typeof import('../services/apiKeyService.js').ApiKeyService;

beforeAll(async () => {
  const module = await import('../services/apiKeyService.js');
  ApiKeyService = module.ApiKeyService;
});

describe('ApiKeyService (vitest suite)', () => {
  it('creates a project with Supabase insert/select chain and maps response fields', async () => {
    const service = new ApiKeyService();

    const result = await service.createProject(
      {
        name: 'Test Project',
        description: 'Test description',
        organizationId: '11111111-1111-4111-a111-111111111111',
        teamMembers: [],
        settings: {},
      },
      '22222222-2222-4222-a222-222222222222'
    );

    expect(result).toEqual({
      id: 'proj-1',
      name: 'Test Project',
      description: 'Test description',
      organizationId: '11111111-1111-4111-a111-111111111111',
      ownerId: '22222222-2222-4222-a222-222222222222',
      teamMembers: [],
      settings: {},
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });

    expect(projectInsertPayloads).toHaveLength(1);
    expect(auditInsertPayloads.find((entry) => entry.table === 'mcp_key_audit_log')).toBeDefined();
  });

  it('rejects invalid project input before hitting Supabase', async () => {
    const service = new ApiKeyService();

    await expect(
      service.createProject(
        {
          name: 'Invalid Project',
          description: 'bad id',
          organizationId: 'not-a-uuid',
          teamMembers: [],
          settings: {},
        },
        '22222222-2222-4222-a222-222222222222'
      )
    ).rejects.toThrow();

    // First test added 1, this test should not add any (validation fails before insert)
    expect(projectInsertPayloads.length).toBe(1);
  });
});
