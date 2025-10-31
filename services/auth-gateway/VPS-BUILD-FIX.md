# 🚨 VPS Build Error Fixes

## Quick Fix on VPS

Run this on the VPS server:

```bash
cd /opt/lanonasis/onasis-core/services/auth-gateway

# Make script executable
chmod +x fix-build-errors.sh

# Run the fix script
./fix-build-errors.sh

# If successful, restart the service
pm2 restart auth-gateway
pm2 logs auth-gateway --lines 20
```

## What Gets Fixed

1. **tsconfig.json merge conflicts** - Resolves the 6 merge conflict markers
2. **Missing .js extension** - Fixes the import path in auth.controller.ts
3. **TypeScript strict mode** - Fixes 'any' type usage and unused variables

## Or Fix Manually

### Fix 1: tsconfig.json

Replace the entire file with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "node16",
    "types": ["node"],
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "config/**/*", "db/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Fix 2: auth.controller.ts Line 291

Change:
```typescript
const { verifyToken: verify } = await import('../utils/jwt')
```

To:
```typescript
const { verifyToken: verify } = await import('../utils/jwt.js')
```

### Fix 3: auth.controller.ts Line 304

Change:
```typescript
} catch (error: any) {
  return res.json({
    valid: false,
    error: error.message || 'Invalid token',
  })
}
```

To:
```typescript
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Invalid token'
  return res.json({
    valid: false,
    error: errorMessage,
  })
}
```

### Fix 4: session.ts Line 41

Change:
```typescript
} catch (error) {
```

To:
```typescript
} catch {
```

Then rebuild:
```bash
npm run build
pm2 restart auth-gateway
```
