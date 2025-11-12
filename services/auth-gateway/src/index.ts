import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'

import { env } from '../config/env.js'
import { checkDatabaseHealth } from '../db/client.js'
import { runAllValidations } from '../config/validation.js'

// Import routes
import authRoutes from './routes/auth.routes.js'
import mcpRoutes from './routes/mcp.routes.js'
import cliRoutes from './routes/cli.routes.js'
import adminRoutes from './routes/admin.routes.js'
import oauthRoutes from './routes/oauth.routes.js'
import webRoutes from './routes/web.routes.js'

// Import middleware
import { validateSessionCookie } from './middleware/session.js'

const app = express()

// Security middleware
app.use(helmet())
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-project-scope'],
  })
)

// Session cookie validation middleware (applies to all routes)
app.use(validateSessionCookie)

// Health check endpoint
app.get('/health', async (_req: express.Request, res: express.Response) => {
  const dbStatus = await checkDatabaseHealth()
  res.json({
    status: 'ok',
    service: 'auth-gateway',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  })
})

// Mount routes
app.use('/v1/auth', authRoutes)
app.use('/web', webRoutes)
app.use('/mcp', mcpRoutes)
app.use('/auth', cliRoutes)
app.use('/admin', adminRoutes)
app.use('/oauth', oauthRoutes)

// Backward compatibility: Mount OAuth routes under /api/v1/oauth as well
// This ensures CLI tools using the old path still work
app.use('/api/v1/oauth', oauthRoutes)

// 404 handler
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: 'Not found',
    code: 'ROUTE_NOT_FOUND',
  })
})

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  })
})

// Start server with validation
app.listen(env.PORT, async () => {
  // Run OAuth configuration validation
  try {
    await runAllValidations()
  } catch (error) {
    console.error('❌ Startup validation failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  }

  console.log(`🚀 Auth gateway running on port ${env.PORT} in ${env.NODE_ENV} mode`)
  console.log(`📍 Health check: http://localhost:${env.PORT}/health`)
  console.log(`🔐 Auth endpoints:`)
  console.log(`   - POST /v1/auth/login`)
  console.log(`   - POST /v1/auth/logout`)
  console.log(`   - GET  /v1/auth/session`)
  console.log(`   - POST /v1/auth/verify`)
  console.log(`   - GET  /v1/auth/sessions`)
  console.log(`🌐 Web endpoints:`)
  console.log(`   - GET  /web/login`)
  console.log(`   - POST /web/login`)
  console.log(`   - GET  /web/logout`)
  console.log(`🤖 MCP endpoints:`)
  console.log(`   - POST /mcp/auth`)
  console.log(`   - GET  /mcp/health`)
  console.log(`💻 CLI endpoints:`)
  console.log(`   - POST /auth/cli-login`)
  console.log(`🔑 OAuth endpoints:`)
  console.log(`   - GET  /oauth/authorize (also /api/v1/oauth/authorize)`)
  console.log(`   - POST /oauth/token (also /api/v1/oauth/token)`)
  console.log(`   - POST /oauth/revoke (also /api/v1/oauth/revoke)`)
  console.log(`   - POST /oauth/introspect (also /api/v1/oauth/introspect)`)
  console.log(`🛡️  Admin endpoints:`)
  console.log(`   - POST /admin/bypass-login (EMERGENCY ACCESS)`)
  console.log(`   - POST /admin/change-password`)
  console.log(`   - GET  /admin/status`)
  console.log(`\n🍪 Session cookies enabled for *.lanonasis.com`)
})
