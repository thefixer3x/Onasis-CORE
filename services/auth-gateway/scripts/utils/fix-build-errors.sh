#!/bin/bash

# Fix Build Errors on VPS
# Run this script on the VPS to fix tsconfig merge conflicts and import issues

echo "🔧 Fixing auth-gateway build errors..."

# Fix 1: Resolve tsconfig.json merge conflicts
echo "📝 Fixing tsconfig.json merge conflicts..."
cat > tsconfig.json << 'EOF'
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
EOF

# Fix 2: Fix import statement in auth.controller.ts
echo "📝 Fixing import statement in auth.controller.ts..."
sed -i "s|await import('../utils/jwt')|await import('../utils/jwt.js')|g" src/controllers/auth.controller.ts

# Fix 3: Fix 'any' type usage
sed -i "s|} catch (error: any) {|} catch (error: unknown) {|g" src/controllers/auth.controller.ts
sed -i "s|error.message || 'Invalid token'|(error instanceof Error ? error.message : 'Invalid token')|g" src/controllers/auth.controller.ts

# Fix 4: Fix unused error variable in session.ts
sed -i "s|} catch (error) {|} catch {|g" src/middleware/session.ts

echo "✅ Fixes applied!"
echo ""
echo "Now running build..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "Next steps:"
    echo "1. pm2 restart auth-gateway"
    echo "2. pm2 logs auth-gateway --lines 20"
else
    echo ""
    echo "❌ Build failed. Check errors above."
    exit 1
fi
