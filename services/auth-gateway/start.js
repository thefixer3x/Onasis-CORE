#!/usr/bin/env node
import 'dotenv/config'

// For production, use built JavaScript; for development, use tsx
if (process.env.NODE_ENV === 'production') {
  // Use compiled JavaScript in production (in dist/src/ due to rootDir)
  import('./dist/src/index.js')
} else {
  // Use tsx for TypeScript in development
  const { register } = await import('tsx/esm/api')
  register({
    hookExtensions: ['.ts'],
  })
  import('./src/index.ts')
}

