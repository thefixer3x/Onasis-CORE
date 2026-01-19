import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50
      }
    }
  }
})
