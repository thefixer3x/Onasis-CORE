import { describe, expect, it } from 'vitest';

const TEST_API_KEY = process.env.TEST_API_KEY || '';
const SUPABASE_BASE_URL = 'https://lanonasis.supabase.co/functions/v1';
const NETLIFY_BASE_URL = 'https://api.lanonasis.com/api/v1';

async function postJson(url: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': TEST_API_KEY,
    },
    body: JSON.stringify(body),
  });
}

describe('Voyage rollout live smoke', () => {
  it('requires TEST_API_KEY to be provided', () => {
    expect(TEST_API_KEY).toBeTruthy();
  });

  it('public memory search returns 200', async () => {
    const response = await postJson(`${NETLIFY_BASE_URL}/memories/search`, {
      query: 'contract test memory search',
      limit: 5,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('direct memory search returns 200', async () => {
    const response = await postJson(`${SUPABASE_BASE_URL}/memory-search`, {
      query: 'contract test memory search',
      limit: 5,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('embeddings proxy returns 1024-d voyage vectors', async () => {
    const response = await postJson(`${SUPABASE_BASE_URL}/embeddings`, {
      input: 'voyage rollout smoke test',
      dimensions: 1024,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.model).toBeTruthy();
    expect(Array.isArray(data.data)).toBe(true);
    expect(Array.isArray(data.data[0]?.embedding)).toBe(true);
    expect(data.data[0].embedding).toHaveLength(1024);
  });

  it('direct analyze-patterns includes creation_velocity', async () => {
    const response = await postJson(`${SUPABASE_BASE_URL}/intelligence-analyze-patterns`, {
      time_range_days: 30,
      include_insights: false,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data?.creation_velocity).toBeDefined();
  });

  it('public find-related returns related memories', async () => {
    const response = await postJson(`${NETLIFY_BASE_URL}/intelligence/find-related`, {
      query: 'contract testing',
      limit: 5,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data?.related_memories).toBeDefined();
    expect(Array.isArray(data.data.related_memories)).toBe(true);
  });

  it('direct predictive-recall is reachable and either returns predictions or a premium-tier gate', async () => {
    const response = await postJson(`${SUPABASE_BASE_URL}/intelligence-predictive-recall`, {
      context: {
        current_task: 'voyage rollout validation',
        context_text: 'Validating predictive recall after voyage rollout deploy.',
      },
      limit: 5,
    });

    const data = await response.json();
    expect([200, 403]).toContain(response.status);

    if (response.status === 200) {
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data?.predictions)).toBe(true);
      return;
    }

    expect(data.success).toBe(false);
    expect(data.error).toBe('Premium feature');
  });
});
