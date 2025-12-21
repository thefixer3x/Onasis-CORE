import { beforeAll, describe, expect, it, vi } from 'vitest';

// Set required env before importing modules that validate on load
process.env.DATABASE_URL = 'https://example.com/postgres';
process.env.API_KEY_ENCRYPTION_KEY = 'a'.repeat(32);
process.env.JWT_SECRET = 'b'.repeat(32);
process.env.SUPABASE_URL = 'https://supabase.example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.NODE_ENV = 'test';

vi.mock('../config/env.js', () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL!,
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

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'api_key_projects') {
      const api: any = {};
      api.insert = vi.fn((payload: any) => {
        projectInsertPayloads.push(payload);
        return {
          select: () => ({
            single: async () => {
              const project = {
                ...payload,
                id: 'proj-1',
                organization_id: payload.organization_id ?? payload.organizationId,
                owner_id: payload.owner_id ?? payload.ownerId,
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z',
              };
              return { data: project, error: null };
            },
          }),
        };
      });
      return api;
    }

    const api: any = {
      insert: vi.fn(async (payload: any) => {
        auditInsertPayloads.push({ table, payload });
        return { data: null, error: null };
      }),
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
      update: vi.fn(async () => ({ data: null, error: null })),
      eq: vi.fn(() => api),
    };
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
        organizationId: '11111111-1111-1111-1111-111111111111',
        teamMembers: [],
        settings: {},
      },
      '22222222-2222-2222-2222-222222222222'
    );

    expect(result).toEqual({
      id: 'proj-1',
      name: 'Test Project',
      description: 'Test description',
      organizationId: '11111111-1111-1111-1111-111111111111',
      ownerId: '22222222-2222-2222-2222-222222222222',
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
        } as any,
        '22222222-2222-2222-2222-222222222222'
      )
    ).rejects.toThrowError(/organizationId/);

    expect(projectInsertPayloads.length).toBe(1); // unchanged from previous test
  });
});
