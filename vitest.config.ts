import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test files pattern
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],

    // Exclude patterns
    exclude: ['node_modules', 'dist', 'services/**/node_modules'],

    // Global test timeout (30 seconds for API calls)
    testTimeout: 30000,

    // Hook timeout
    hookTimeout: 30000,

    // Enable globals (describe, it, expect)
    globals: true,

    // Reporter
    reporters: ['verbose'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['supabase/functions/**/*.ts'],
      exclude: ['**/_shared/**', '**/node_modules/**'],
    },

    // Setup file
    setupFiles: ['./tests/setup.ts'],

    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Prevent rate limiting issues
      },
    },
  },
});
