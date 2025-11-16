# PM2 Stability Fix - Auth Gateway

## Problem
The auth-gateway PM2 process was experiencing continuous crashes due to ESM module resolution errors:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/opt/lanonasis/services/auth-gateway/dist/config/env'
```

This caused hundreds of restarts per hour, making the service unstable.

## Root Cause
Node.js ESM modules require explicit `.js` file extensions in import statements. TypeScript was compiling the code without these extensions, causing module resolution failures.

## Solution

### 1. Created TypeScript Loader (`start.js`)
Instead of running compiled JavaScript, we now use `tsx` to run TypeScript directly:
```javascript
#!/usr/bin/env node
import { register } from 'tsx/esm/api'

register({
  hookExtensions: ['.ts'],
})

import('./src/index.ts')
```

### 2. Updated PM2 Configuration
Changed `ecosystem.config.js` from:
- `script: 'dist/index.js'` ❌
To:
- `script: 'start.js'` ✅

### 3. Fixed Import Statements
Added `.js` extensions to all local imports across 11 TypeScript files:
- `db/client.ts`
- `src/index.ts`
- `src/middleware/auth.ts`
- `src/routes/*.ts` (5 files)
- `src/services/*.ts` (3 files)
- `src/utils/jwt.ts`

## Benefits
- ✅ No more module resolution errors
- ✅ Automatic TypeScript compilation via tsx
- ✅ No build step required for deployment
- ✅ Better error messages (references source files)
- ✅ Works with any TypeScript configuration

## Verification
- Service status: Stable (0 restarts)
- Uptime: 17+ hours
- Health endpoint: Responding correctly
- Memory usage: Normal (~60-70MB per instance)

## Files Changed
1. **New file**: `start.js` - TypeScript loader using tsx
2. **Modified**: `ecosystem.config.js` - Updated script path
3. **Modified**: 11 TypeScript files - Added `.js` extensions to imports

## For Local Development
When pulling these changes locally:
1. Ensure `tsx` is installed: `npm install`
2. Run with PM2: `pm2 start ecosystem.config.js`
3. Or run directly: `npm run dev` (development)
4. Or build: `npm run build` then `npm start` (production)

## Date
October 22, 2025
Status: ✅ Resolved - Production Stable

