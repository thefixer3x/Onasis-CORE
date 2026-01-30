#!/usr/bin/env node
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load the .env that sits next to this file (PM2's cwd can differ).
const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(currentDirPath, '.env'),
})

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
