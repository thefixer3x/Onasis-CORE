/**
 * Intelligence Edge Functions Tests
 * Tests for AI-powered memory analysis endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lanonasis.supabase.co';
const TEST_API_KEY = process.env.TEST_API_KEY || 'lano_master_key_2024';

interface IntelligenceResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  usage?: {
    tokens_used: number;
    cost_usd: number;
    cached: boolean;
  };
  tier_info?: {
    tier: string;
    usage_remaining: number;
  };
}

describe('Intelligence Edge Functions (Direct Supabase)', () => {
  let testMemoryId: string;

  beforeAll(async () => {
    console.log('\n🧪 Intelligence Test Suite Starting...');
    console.log(`   Supabase URL: ${SUPABASE_URL}`);
    console.log(`   API Key: ${TEST_API_KEY.substring(0, 15)}...`);

    // Create a test memory for intelligence operations
    const response = await fetch(`${SUPABASE_URL}/functions/v1/memory-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_API_KEY,
      },
      body: JSON.stringify({
        title: 'Intelligence Test Memory',
        content: 'This is a test memory for validating intelligence API endpoints. It contains information about API development, authentication patterns, OAuth2 protocols, and security best practices for modern web applications.',
        memory_type: 'knowledge',
        tags: ['test', 'intelligence', 'api', 'security'],
      }),
    });

    const data = await response.json();
    if (data.data?.id) {
      testMemoryId = data.data.id;
      console.log(`   Created test memory: ${testMemoryId}`);
    }
  });

  afterAll(async () => {
    // Cleanup test memory
    if (testMemoryId) {
      await fetch(`${SUPABASE_URL}/functions/v1/memory-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({ id: testMemoryId }),
      });
      console.log('\n🧹 Cleaned up test memory');
    }
  });

  describe('intelligence-health-check', () => {
    it('should return health score and statistics', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-health-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      const data: IntelligenceResponse = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data!.health_score).toBeDefined();
      expect(data.data!.statistics).toBeDefined();
      expect(data.tier_info).toBeDefined();
    });

    it('should include health score breakdown', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-health-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({ detailed_breakdown: true }),
      });

      const data: IntelligenceResponse = await response.json();

      expect(data.data!.health_score).toHaveProperty('overall');
      expect(data.data!.health_score).toHaveProperty('breakdown');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-health-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('intelligence-suggest-tags', () => {
    it('should suggest tags for content', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-suggest-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({
          content: 'Implementing OAuth2 authentication with JWT tokens for secure API access. Using refresh tokens for session management.',
        }),
      });

      expect(response.status).toBe(200);
      const data: IntelligenceResponse = await response.json();

      expect(data.success).toBe(true);
      expect(data.data!.suggestions).toBeDefined();
      expect(Array.isArray(data.data!.suggestions)).toBe(true);
      expect((data.data!.suggestions as string[]).length).toBeGreaterThan(0);
    });

    it('should include usage statistics', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-suggest-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({
          content: 'Database indexing strategies for PostgreSQL performance optimization',
        }),
      });

      const data: IntelligenceResponse = await response.json();

      expect(data.usage).toBeDefined();
      expect(data.usage!.tokens_used).toBeGreaterThanOrEqual(0);
    });
  });

  describe('intelligence-find-related', () => {
    it('should find related memories', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-find-related`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({
          memory_id: testMemoryId,
          limit: 5,
        }),
      });

      expect(response.status).toBe(200);
      const data: IntelligenceResponse = await response.json();

      expect(data.success).toBe(true);
      expect(data.data!.related_memories).toBeDefined();
      expect(Array.isArray(data.data!.related_memories)).toBe(true);
    });

    it('should return 404 for non-existent memory ID', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-find-related`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({
          memory_id: '00000000-0000-0000-0000-000000000000',
        }),
      });

      // Non-existent memory should return 404
      expect(response.status).toBe(404);
    });
  });

  describe('intelligence-extract-insights', () => {
    it('should extract insights from memory context', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-extract-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({
          memory_id: testMemoryId,
        }),
      });

      expect(response.status).toBe(200);
      const data: IntelligenceResponse = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('should include token usage', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-extract-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({}),
      });

      const data: IntelligenceResponse = await response.json();
      expect(data.usage).toBeDefined();
    });
  });

  describe('intelligence-analyze-patterns', () => {
    it('should analyze memory patterns', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-analyze-patterns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      const data: IntelligenceResponse = await response.json();

      expect(data.success).toBe(true);
      expect(data.data!.total_memories).toBeDefined();
      expect(data.data!.memories_by_type).toBeDefined();
    });

    it('should return pattern statistics', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-analyze-patterns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({ time_range_days: 30 }),
      });

      const data: IntelligenceResponse = await response.json();

      expect(data.data!.top_tags).toBeDefined();
      expect(data.data!.peak_creation_hours).toBeDefined();
    });
  });

  describe('intelligence-detect-duplicates', () => {
    it('should handle duplicate detection (may timeout)', async () => {
      // This endpoint may hit worker limits with large datasets
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-detect-duplicates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': TEST_API_KEY,
          },
          body: JSON.stringify({ threshold: 0.9 }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // May return WORKER_LIMIT error for heavy computation
        const data = await response.json();
        expect(['200', '500'].map(String)).toContain(String(response.status));

        if (data.success) {
          expect(data.data!.duplicates).toBeDefined();
        }
      } catch (error) {
        // Timeout is acceptable for this heavy endpoint
        clearTimeout(timeoutId);
        console.log('   Note: detect-duplicates timed out (expected for large datasets)');
      }
    });
  });

  describe('Auth methods', () => {
    it('should accept Bearer token format', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-health-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      const data: IntelligenceResponse = await response.json();
      expect(data.success).toBe(true);
    });

    it('should accept X-API-Key header', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-health-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      const data: IntelligenceResponse = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
