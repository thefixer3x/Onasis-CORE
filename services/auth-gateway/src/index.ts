import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'

import { env } from '../config/env'
import { checkDatabaseHealth } from '../db/client'

// Import routes
import authRoutes from './routes/auth.routes'
import mcpRoutes from './routes/mcp.routes'
import cliRoutes from './routes/cli.routes'
import adminRoutes from './routes/admin.routes'

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

// Health check endpoint
app.get('/health', async (_req, res) => {
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
app.use('/mcp', mcpRoutes)
app.use('/auth', cliRoutes)
app.use('/admin', adminRoutes)

// 404 handler
app.use((_req, res) => {
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

// Start server
app.listen(env.PORT, () => {
  console.log(`🚀 Auth gateway running on port ${env.PORT} in ${env.NODE_ENV} mode`)
  console.log(`📍 Health check: http://localhost:${env.PORT}/health`)
  console.log(`🔐 Auth endpoints:`)
  console.log(`   - POST /v1/auth/login`)
  console.log(`   - POST /v1/auth/logout`)
  console.log(`   - GET  /v1/auth/session`)
  console.log(`   - POST /v1/auth/verify`)
  console.log(`   - GET  /v1/auth/sessions`)
  console.log(`🤖 MCP endpoints:`)
  console.log(`   - POST /mcp/auth`)
  console.log(`   - GET  /mcp/health`)
  console.log(`💻 CLI endpoints:`)
  console.log(`   - POST /auth/cli-login`)
  console.log(`🛡️  Admin endpoints:`)
  console.log(`   - POST /admin/bypass-login (EMERGENCY ACCESS)`)
  console.log(`   - POST /admin/change-password`)
  console.log(`   - GET  /admin/status`)
})
