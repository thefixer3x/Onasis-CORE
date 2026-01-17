# Auth-Gateway index.ts Integration Patch

## Step 1: Add Import (after existing route imports)

Find this section in `src/index.ts`:

```typescript
import deviceRoutes from './routes/device.routes.js'
```

Add this line immediately after:

```typescript
import servicesRoutes from './routes/services.routes.js'
```

---

## Step 2: Mount Routes (before 404 handler)

Find this section:

```typescript
app.use('/oauth', deviceRoutes)   // Device code flow for CLI (GitHub-style passwordless)
```

Add these lines immediately after:

```typescript
// ============================================================================
// UNIFIED SERVICE ROUTER (ported from unified-router.cjs)
// Routes authenticated requests to Supabase edge functions
// ============================================================================
app.use(servicesRoutes)

// Service discovery shortcut
app.get('/services', (req, res) => {
  res.redirect('/api/v1/services')
})
```

---

## Step 3: Update Startup Console Logs

Find the startup console.log section and add:

```typescript
console.log(`🔀 Service Router endpoints:`)
console.log(`   - GET  /services (discovery)`)
console.log(`   - ALL  /api/v1/services/:name/* (authenticated routing)`)
console.log(`   - POST /api/v1/chat/completions (legacy)`)
console.log(`   - POST /webhook/:service`)
```

---

## Full Diff Preview

```diff
 import deviceRoutes from './routes/device.routes.js'
+import servicesRoutes from './routes/services.routes.js'

 // ... existing code ...

 app.use('/oauth', deviceRoutes)   // Device code flow for CLI (GitHub-style passwordless)

+// ============================================================================
+// UNIFIED SERVICE ROUTER (ported from unified-router.cjs)
+// Routes authenticated requests to Supabase edge functions
+// ============================================================================
+app.use(servicesRoutes)
+
+// Service discovery shortcut
+app.get('/services', (req, res) => {
+  res.redirect('/api/v1/services')
+})

 // Map /auth/login to /web/login for backward compatibility and CLI
```
