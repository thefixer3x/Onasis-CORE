/**
 * System Edge Functions - Direct Supabase Tests
 * Tests auth-status, organization-info, projects, and config
 */

import { describe, it, expect } from 'vitest';
import { supabaseCall } from '../setup';

describe('System Edge Functions (Direct Supabase)', () => {
  describe('auth-status', () => {
    it('should return authenticated status with valid key', async () => {
      const { status, data } = await supabaseCall('auth-status', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.authenticated).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.id).toBeDefined();
      expect(data.organization).toBeDefined();
      expect(data.access).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    it('should include current auth method info', async () => {
      const { status, data } = await supabaseCall('auth-status', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.current_auth).toBeDefined();
      expect(data.current_auth.method).toBe('api_key');
    });

    it('should return unauthenticated with no key', async () => {
      const response = await fetch(
        'https://lanonasis.supabase.co/functions/v1/auth-status',
        { method: 'GET' }
      );

      const data = await response.json();
      expect(data.authenticated).toBe(false);
    });
  });

  describe('organization-info', () => {
    it('should return organization details', async () => {
      const { status, data } = await supabaseCall('organization-info', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBeDefined();
      expect(data.data.plan).toBeDefined();
      expect(data.data.limits).toBeDefined();
    });

    it('should include usage statistics', async () => {
      const { status, data } = await supabaseCall('organization-info', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.usage).toBeDefined();
      expect(data.usage.memories).toBeDefined();
    });

    it('should include plan features', async () => {
      const { status, data } = await supabaseCall('organization-info', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data.features).toBeDefined();
      expect(Array.isArray(data.data.features)).toBe(true);
    });
  });

  describe('project-list', () => {
    it('should list projects', async () => {
      const { status, data } = await supabaseCall('project-list', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.total).toBeDefined();
    });

    it('should respect pagination', async () => {
      const { status, data } = await supabaseCall('project-list?limit=5&offset=0', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.limit).toBe(5);
      expect(data.offset).toBe(0);
    });
  });

  describe('project-create', () => {
    it('should require name field', async () => {
      const { status } = await supabaseCall('project-create', {
        method: 'POST',
        body: JSON.stringify({
          description: 'Missing name',
        }),
      });

      expect(status).toBe(400);
    });

    it('should validate name length', async () => {
      const { status } = await supabaseCall('project-create', {
        method: 'POST',
        body: JSON.stringify({
          name: 'A'.repeat(101), // Max is 100
        }),
      });

      expect(status).toBe(400);
    });
  });

  describe('config-get', () => {
    it('should return all configuration', async () => {
      const { status, data } = await supabaseCall('config-get', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.available_keys).toBeDefined();
      expect(Array.isArray(data.available_keys)).toBe(true);
    });

    it('should return specific config key', async () => {
      const { status, data } = await supabaseCall('config-get?key=memory.auto_embedding', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.key).toBe('memory.auto_embedding');
      expect(data.value).toBeDefined();
      expect(data.source).toBeDefined();
    });

    it('should return 404 for non-existent key', async () => {
      const { status } = await supabaseCall('config-get?key=non.existent.key', {
        method: 'GET',
      });

      expect(status).toBe(404);
    });

    it('should include default values', async () => {
      const { status, data } = await supabaseCall('config-get', {
        method: 'GET',
      });

      expect(status).toBe(200);
      // Check some known default keys exist
      expect(data.data['memory.auto_embedding']).toBeDefined();
      expect(data.data['search.default_limit']).toBeDefined();
    });
  });

  describe('config-set', () => {
    it('should require key and value', async () => {
      const { status } = await supabaseCall('config-set', {
        method: 'POST',
        body: JSON.stringify({
          key: 'ui.theme',
        }),
      });

      expect(status).toBe(400);
    });

    it('should validate key exists in schema', async () => {
      const { status } = await supabaseCall('config-set', {
        method: 'POST',
        body: JSON.stringify({
          key: 'invalid.key',
          value: 'test',
        }),
      });

      expect(status).toBe(400);
    });

    it('should validate value type', async () => {
      const { status } = await supabaseCall('config-set', {
        method: 'POST',
        body: JSON.stringify({
          key: 'memory.auto_embedding',
          value: 'not a boolean', // Should be boolean
        }),
      });

      expect(status).toBe(400);
    });

    it('should validate allowed values', async () => {
      const { status } = await supabaseCall('config-set', {
        method: 'POST',
        body: JSON.stringify({
          key: 'ui.theme',
          value: 'invalid_theme', // Must be light, dark, or system
        }),
      });

      expect(status).toBe(400);
    });

    it('should set valid configuration', async () => {
      const { status, data } = await supabaseCall('config-set', {
        method: 'POST',
        body: JSON.stringify({
          key: 'ui.theme',
          value: 'dark',
        }),
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.key).toBe('ui.theme');
      expect(data.value).toBe('dark');

      // Reset to default
      await supabaseCall('config-set', {
        method: 'POST',
        body: JSON.stringify({
          key: 'ui.theme',
          value: 'system',
        }),
      });
    });
  });
});
