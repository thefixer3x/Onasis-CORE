/**
 * Vitest Test Setup
 * Configures environment and global utilities for API testing
 */

import { beforeAll, afterAll } from 'vitest';

// Test configuration
export const TEST_CONFIG = {
  // Supabase Edge Functions (direct)
  SUPABASE_BASE_URL: 'https://lanonasis.supabase.co/functions/v1',

  // Netlify routing (via _redirects)
  NETLIFY_BASE_URL: 'https://api.lanonasis.com/api/v1',

  // Test API key (master key for full access)
  API_KEY: process.env.TEST_API_KEY || '$LANONASIS_API_KEY',

  // Request timeout
  TIMEOUT: 25000,
};

// Global fetch with timeout
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = TEST_CONFIG.TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_CONFIG.API_KEY,
        ...options.headers,
      },
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Helper to make API calls to Supabase directly
export async function supabaseCall(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ status: number; data: any; headers: Headers }> {
  const url = `${TEST_CONFIG.SUPABASE_BASE_URL}/${endpoint}`;
  const response = await fetchWithTimeout(url, options);

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

// Helper to make API calls via Netlify routing
export async function netlifyCall(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ status: number; data: any; headers: Headers }> {
  const url = `${TEST_CONFIG.NETLIFY_BASE_URL}/${endpoint}`;
  const response = await fetchWithTimeout(url, options);

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

// Test data cleanup registry
const cleanupItems: Array<{ type: string; id: string }> = [];

export function registerCleanup(type: string, id: string) {
  cleanupItems.push({ type, id });
}

// Global setup
beforeAll(async () => {
  console.log('\n🧪 Test Suite Starting...');
  console.log(`   Supabase URL: ${TEST_CONFIG.SUPABASE_BASE_URL}`);
  console.log(`   Netlify URL: ${TEST_CONFIG.NETLIFY_BASE_URL}`);
  console.log(`   API Key: ${TEST_CONFIG.API_KEY.substring(0, 15)}...`);
});

// Global cleanup
afterAll(async () => {
  console.log('\n🧹 Cleaning up test data...');

  for (const item of cleanupItems) {
    try {
      if (item.type === 'memory') {
        await supabaseCall('memory-delete', {
          method: 'DELETE',
          body: JSON.stringify({ id: item.id }),
        });
      } else if (item.type === 'api-key') {
        await supabaseCall('api-key-delete', {
          method: 'DELETE',
          body: JSON.stringify({ key_id: item.id }),
        });
      }
    } catch (error) {
      console.warn(`   Failed to cleanup ${item.type}:${item.id}`);
    }
  }

  console.log('✅ Cleanup complete\n');
});
