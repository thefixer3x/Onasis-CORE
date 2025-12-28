/**
 * Memory Edge Functions - Direct Supabase Tests
 * Tests all memory operations via lanonasis.supabase.co/functions/v1
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabaseCall, registerCleanup } from '../setup';

describe('Memory Edge Functions (Direct Supabase)', () => {
  let testMemoryId: string;

  describe('memory-create', () => {
    it('should create a new memory with valid data', async () => {
      const { status, data } = await supabaseCall('memory-create', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Memory - Vitest',
          content: 'This is a test memory created by Vitest for integration testing.',
          memory_type: 'context',
          tags: ['test', 'vitest', 'integration'],
        }),
      });

      expect(status).toBe(201);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBeDefined();
      expect(data.data.title).toBe('Test Memory - Vitest');
      expect(data.has_embedding).toBeDefined();

      testMemoryId = data.data.id;
      registerCleanup('memory', testMemoryId);
    });

    it('should fail without required fields', async () => {
      const { status, data } = await supabaseCall('memory-create', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Missing content',
        }),
      });

      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it('should fail with invalid memory_type', async () => {
      const { status, data } = await supabaseCall('memory-create', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test',
          content: 'Test content',
          memory_type: 'invalid_type',
        }),
      });

      expect(status).toBe(400);
    });
  });

  describe('memory-get', () => {
    it('should retrieve a memory by ID', async () => {
      if (!testMemoryId) {
        console.warn('Skipping: No test memory available');
        return;
      }

      const { status, data } = await supabaseCall(`memory-get?id=${testMemoryId}`, {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBe(testMemoryId);
    });

    it('should return 404 for non-existent ID', async () => {
      const { status } = await supabaseCall(
        'memory-get?id=00000000-0000-0000-0000-000000000000',
        { method: 'GET' }
      );

      expect(status).toBe(404);
    });

    it('should fail with invalid UUID format', async () => {
      const { status } = await supabaseCall('memory-get?id=invalid-id', {
        method: 'GET',
      });

      expect(status).toBe(400);
    });
  });

  describe('memory-search', () => {
    it('should search memories by query', async () => {
      const { status, data } = await supabaseCall('memory-search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'vitest integration testing',
          limit: 10,
        }),
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const { status, data } = await supabaseCall('memory-search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test',
          limit: 2,
        }),
      });

      expect(status).toBe(200);
      expect(data.data.length).toBeLessThanOrEqual(2);
    });

    it('should filter by type', async () => {
      const { status, data } = await supabaseCall('memory-search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test',
          type: 'context',
          limit: 5,
        }),
      });

      expect(status).toBe(200);
      // All results should be of type 'context'
      data.data.forEach((item: any) => {
        if (item.memory_type) {
          expect(item.memory_type).toBe('context');
        }
      });
    });
  });

  describe('memory-list', () => {
    it('should list memories with pagination', async () => {
      const { status, data } = await supabaseCall('memory-list', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.pagination).toBeDefined();
    });

    it('should respect limit and offset', async () => {
      const { status, data } = await supabaseCall('memory-list?limit=5&offset=0', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data.length).toBeLessThanOrEqual(5);
    });

    it('should filter by type', async () => {
      const { status, data } = await supabaseCall('memory-list?type=context', {
        method: 'GET',
      });

      expect(status).toBe(200);
      data.data.forEach((item: any) => {
        expect(item.memory_type).toBe('context');
      });
    });
  });

  describe('memory-update', () => {
    it('should update an existing memory', async () => {
      if (!testMemoryId) {
        console.warn('Skipping: No test memory available');
        return;
      }

      const { status, data } = await supabaseCall('memory-update', {
        method: 'PUT',
        body: JSON.stringify({
          id: testMemoryId,
          title: 'Updated Test Memory - Vitest',
          tags: ['updated', 'vitest'],
        }),
      });

      expect(status).toBe(200);
      expect(data.data.title).toBe('Updated Test Memory - Vitest');
    });

    it('should fail without ID', async () => {
      const { status } = await supabaseCall('memory-update', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'No ID provided',
        }),
      });

      expect(status).toBe(400);
    });
  });

  describe('memory-stats', () => {
    it('should return memory statistics', async () => {
      const { status, data } = await supabaseCall('memory-stats', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.data.total_memories).toBeDefined();
      expect(data.data.by_type).toBeDefined();
    });
  });

  describe('memory-delete', () => {
    it('should delete a memory', async () => {
      // Create a memory to delete
      const createResponse = await supabaseCall('memory-create', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Memory to Delete',
          content: 'This memory will be deleted',
          memory_type: 'context',
        }),
      });

      const memoryToDelete = createResponse.data.data.id;

      const { status, data } = await supabaseCall('memory-delete', {
        method: 'DELETE',
        body: JSON.stringify({ id: memoryToDelete }),
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent memory', async () => {
      const { status } = await supabaseCall('memory-delete', {
        method: 'DELETE',
        body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000' }),
      });

      expect(status).toBe(404);
    });
  });

  describe('memory-bulk-delete', () => {
    it('should validate IDs array is required', async () => {
      const { status } = await supabaseCall('memory-bulk-delete', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(status).toBe(400);
    });

    it('should handle non-existent IDs gracefully', async () => {
      const { status, data } = await supabaseCall('memory-bulk-delete', {
        method: 'POST',
        body: JSON.stringify({
          ids: ['00000000-0000-0000-0000-000000000000'],
        }),
      });

      expect(status).toBe(200);
      expect(data.not_found).toBeDefined();
    });
  });

  describe('system-health', () => {
    it('should return health status', async () => {
      const { status, data } = await supabaseCall('system-health', {
        method: 'GET',
      });

      expect(status).toBe(200);
      expect(data.status).toBeDefined();
    });
  });
});
