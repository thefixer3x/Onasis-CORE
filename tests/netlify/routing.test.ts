/**
 * Netlify Routing Tests
 * Tests that _redirects correctly routes to Supabase Edge Functions
 * Via api.lanonasis.com/api/v1/*
 */

import { describe, it, expect } from 'vitest';
import { netlifyCall, supabaseCall, TEST_CONFIG } from '../setup';

describe('Netlify Routing (via _redirects)', () => {
  describe('Memory Routes', () => {
    it('should route /api/v1/memory/search to Supabase', async () => {
      const { status, data } = await netlifyCall('memory/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test', limit: 1 }),
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
    });

    it('should route /api/v1/memory/list to Supabase', async () => {
      const { status, data } = await netlifyCall('memory/list?limit=1', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
    });

    it('should route /api/v1/memory/stats to Supabase', async () => {
      const { status, data } = await netlifyCall('memory/stats', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data.total_memories).toBeDefined();
    });

    it('should route /api/v1/memory/health to Supabase', async () => {
      const { status, data } = await netlifyCall('memory/health', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.status).toBeDefined();
    });

    it('should route /api/v1/memory (POST) to memory-create', async () => {
      const { status, data } = await netlifyCall('memory', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Netlify Routing Test',
          content: 'Testing routing via api.lanonasis.com',
          memory_type: 'context',
        }),
      });

      expect(status).toBe(201);
      expect(data.data.id).toBeDefined();

      // Cleanup
      if (data.data.id) {
        await supabaseCall('memory-delete', {
          method: 'DELETE',
          body: JSON.stringify({ id: data.data.id }),
        });
      }
    });
  });

  describe('API Key Routes', () => {
    it('should route /api/v1/keys/list to Supabase', async () => {
      const { status, data } = await netlifyCall('keys/list', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should route /api/v1/keys (POST) to api-key-create', async () => {
      const { status, data } = await netlifyCall('keys', {
        method: 'POST',
        body: JSON.stringify({
          name: `Netlify Route Test ${Date.now()}`,
        }),
      });

      expect(status).toBe(201);
      expect(data.data.key).toMatch(/^lano_/);

      // Cleanup
      if (data.data.id) {
        await supabaseCall('api-key-delete', {
          method: 'DELETE',
          body: JSON.stringify({ key_id: data.data.id }),
        });
      }
    });
  });

  describe('System Routes', () => {
    it('should route /api/v1/auth/status to Supabase', async () => {
      const { status, data } = await netlifyCall('auth/status', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.authenticated).toBe(true);
    });

    it('should route /api/v1/organization to Supabase', async () => {
      const { status, data } = await netlifyCall('organization', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
    });

    it('should route /api/v1/config to Supabase', async () => {
      const { status, data } = await netlifyCall('config', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
    });

    it('should route /api/v1/projects/list to Supabase', async () => {
      const { status, data } = await netlifyCall('projects/list', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Response Consistency', () => {
    it('should return identical data for direct and routed requests', async () => {
      // Direct Supabase call
      const supabaseResponse = await supabaseCall('auth-status', {
        method: 'GET',
      });

      // Routed via Netlify
      const netlifyResponse = await netlifyCall('auth/status', {
        method: 'GET',
      });

      expect(supabaseResponse.status).toBe(netlifyResponse.status);
      expect(supabaseResponse.data.authenticated).toBe(
        netlifyResponse.data.authenticated
      );
      expect(supabaseResponse.data.user.id).toBe(
        netlifyResponse.data.user.id
      );
    });

    it('should have consistent error responses', async () => {
      // Both should return 401 without auth
      const supabaseResponse = await fetch(
        'https://lanonasis.supabase.co/functions/v1/memory-list',
        { method: 'GET' }
      );

      const netlifyResponse = await fetch(
        'https://api.lanonasis.com/api/v1/memory/list',
        { method: 'GET' }
      );

      expect(supabaseResponse.status).toBe(netlifyResponse.status);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers via Netlify', async () => {
      const { headers } = await netlifyCall('auth/status', {
        method: 'GET',
      });

      expect(headers.get('access-control-allow-origin')).toBeDefined();
    });

    it('should handle OPTIONS preflight', async () => {
      const response = await fetch(
        `${TEST_CONFIG.NETLIFY_BASE_URL}/memory/list`,
        {
          method: 'OPTIONS',
          headers: {
            'Origin': 'https://dashboard.lanonasis.com',
            'Access-Control-Request-Method': 'GET',
          },
        }
      );

      // OPTIONS preflight should return 200 or 204 (No Content)
      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Latency Comparison', () => {
    it('should have acceptable routing overhead', async () => {
      const iterations = 3;
      const supabaseTimes: number[] = [];
      const netlifyTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        // Direct Supabase
        const supabaseStart = Date.now();
        await supabaseCall('auth-status', { method: 'GET' });
        supabaseTimes.push(Date.now() - supabaseStart);

        // Via Netlify
        const netlifyStart = Date.now();
        await netlifyCall('auth/status', { method: 'GET' });
        netlifyTimes.push(Date.now() - netlifyStart);
      }

      const avgSupabase =
        supabaseTimes.reduce((a, b) => a + b, 0) / supabaseTimes.length;
      const avgNetlify =
        netlifyTimes.reduce((a, b) => a + b, 0) / netlifyTimes.length;
      const overhead = avgNetlify - avgSupabase;

      console.log(`\n📊 Latency Comparison (${iterations} iterations):`);
      console.log(`   Direct Supabase: ${avgSupabase.toFixed(0)}ms avg`);
      console.log(`   Via Netlify: ${avgNetlify.toFixed(0)}ms avg`);
      console.log(`   Routing overhead: ${overhead.toFixed(0)}ms`);

      // Overhead should be less than 500ms (generous for network variability)
      expect(overhead).toBeLessThan(500);
    });
  });
});
