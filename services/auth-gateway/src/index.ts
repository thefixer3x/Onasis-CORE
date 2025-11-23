import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import csrf from 'csurf'
import { xssSanitizer } from './middleware/xss-sanitizer.js'

import { env } from '../config/env.js'
import { checkDatabaseHealth } from '../db/client.js'
import { runAllValidations } from '../config/validation.js'
import { redisClient, checkRedisHealth, closeRedis } from './services/cache.service.js'

// Import routes
import authRoutes from './routes/auth.routes.js'
import apiKeysRoutes from './routes/api-keys.routes.js'
import projectsRoutes from './routes/projects.routes.js'
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

// XSS Protection (aligned with SHA-256 security standards)
app.use(xssSanitizer)

// CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-project-scope'],
  })
)

// CSRF Protection (excluding API routes that use API keys)
// Type fix: csurf is incompatible with Express 5 types, use type assertion
const csrfProtection = csrf({ cookie: true })
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Skip CSRF for API endpoints using API keys or health checks
  if (req.path.startsWith('/api/v1') || req.path === '/health' || req.headers['x-api-key']) {
    return next()
  }
})

// Session cookie validation middleware (applies to all routes)
app.use(validateSessionCookie)

// Health check endpoint
app.get('/health', async (_req: express.Request, res: express.Response) => {
  const dbStatus = await checkDatabaseHealth()
  const redisStatus = await checkRedisHealth()

  // Overall status: ok if both healthy, degraded if Redis down but DB up, unhealthy if DB down
  const overallStatus = dbStatus.healthy
    ? (redisStatus.healthy ? 'ok' : 'degraded')
    : 'unhealthy'

  res.json({
    status: overallStatus,
    service: 'auth-gateway',
    database: dbStatus,
    cache: redisStatus,
    timestamp: new Date().toISOString(),
  })
})

// Mount routes
app.use('/v1/auth', authRoutes)
app.use('/api/v1/auth/api-keys', apiKeysRoutes)
app.use('/api/v1/projects', projectsRoutes)
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
  // Initialize Redis connection
  try {
    await redisClient.connect()
    console.log('✅ Redis connected successfully')
  } catch (error) {
    console.warn('⚠️  Redis connection failed (non-critical):', error instanceof Error ? error.message : error)
    console.warn('   Service will continue without caching')
  }

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

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...')
  await closeRedis()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...')
  await closeRedis()
  process.exit(0)
})
