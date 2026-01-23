import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
// Removed vulnerable csurf package - using custom CSRF middleware instead
import { xssSanitizer } from './middleware/xss-sanitizer.js'

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import { env } from '../config/env.js'
import { checkDatabaseHealth } from '../db/client.js'
import { runAllValidations } from '../config/validation.js'
import { checkRedisHealth, closeRedis, isRedisCachingEnabled } from './services/cache.service.js'

// Import routes
import authRoutes from './routes/auth.routes.js'
import otpRoutes from './routes/otp.routes.js'
import apiKeysRoutes from './routes/api-keys.routes.js'
import projectsRoutes from './routes/projects.routes.js'
import mcpRoutes from './routes/mcp.routes.js'
import cliRoutes from './routes/cli.routes.js'
import adminRoutes from './routes/admin.routes.js'
import oauthRoutes from './routes/oauth.routes.js'
import oauthConsentRoutes from './routes/oauth-consent.routes.js'
import webRoutes from './routes/web.routes.js'
import syncRoutes from './routes/sync.routes.js'
import deviceRoutes from './routes/device.routes.js'
import servicesRoutes from './routes/services.routes.js'
import resolveRoutes from './routes/resolve.routes.js'

// Import middleware
import { validateSessionCookie } from './middleware/session.js'
import { standardCors } from './middleware/cors.js'
import { uaiRouter, requireUAI } from './middleware/uai-router.middleware.js'
import { startCacheCleanup, getCacheStats } from './services/uai-session-cache.service.js'

const app = express()
const isTestEnv = process.env.NODE_ENV === 'test'

// Trust proxy - required when behind nginx/load balancer
// Set to 1 (single proxy hop) instead of true to satisfy express-rate-limit security check
// See: https://express-rate-limit.github.io/ERR_ERL_PERMISSIVE_TRUST_PROXY/
app.set('trust proxy', 1)

// Health endpoint with permissive CORS (must be before global CORS middleware)
app.options("/health", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-project-scope, X-Project-Scope, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.status(204).end();
});

app.get("/health", async (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-project-scope, X-Project-Scope, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  const { checkDatabaseHealth } = await import("../db/client.js");
  const { checkRedisHealth } = await import("./services/cache.service.js");
  const { getOutboxStats } = await import("./services/event.service.js");
  const { getCacheStats } = await import("./services/uai-session-cache.service.js");
  const dbStatus = await checkDatabaseHealth();
  const redisStatus = await checkRedisHealth();
  const outboxStatus = await getOutboxStats();
  const uaiCacheStats = await getCacheStats();
  const overallStatus = dbStatus.healthy ? (redisStatus.healthy ? "ok" : "degraded") : "unhealthy";
  res.json({
    status: overallStatus,
    service: "auth-gateway",
    database: dbStatus,
    cache: redisStatus,
    uaiCache: {
      layers: uaiCacheStats.layers,
      memoryCacheSize: uaiCacheStats.memoryCacheSize,
      postgresCacheSize: uaiCacheStats.postgresCacheSize,
    },
    outbox: outboxStatus,
    timestamp: new Date().toISOString()
  });
});

// E2E Test Client - serves before security middleware to allow inline scripts/styles
// Available at /test-client for real OAuth/PKCE flow testing
// Access: http://localhost:4000/test-client or https://auth.lanonasis.com/test-client
const testDashboardPath = path.join(__dirname, '..', 'test-dashboard');
app.get('/test-client', (_req, res) => {
  res.sendFile(path.join(testDashboardPath, 'index.html'));
});
app.use('/test-client', express.static(testDashboardPath));

// Security middleware - skip CSP for web routes (login forms need relaxed policy)
app.use((req, res, next) => {
  if (req.path.startsWith('/web/')) {
    // Use helmet without CSP for web routes
    helmet({
      contentSecurityPolicy: false,
    })(req, res, next)
  } else {
    // Full CSP for API/OAuth routes
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://auth.lanonasis.com", "https://dashboard.lanonasis.com"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          formAction: ["'self'", "https://auth.lanonasis.com"],
          scriptSrcAttr: ["'unsafe-inline'"],
        },
      },
    })(req, res, next)
  }
})

// Rate limiting - General API protection
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests', code: 'RATE_LIMITED', retryAfter: '15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip: health checks, tests, and /oauth/token (has its own dedicated rate limiter)
  skip: (req) => isTestEnv || req.path === '/health' || req.path === '/oauth/token'
})

// Strict rate limiting for authentication endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 login attempts per 15 minutes
  message: { error: 'Too many login attempts', code: 'AUTH_RATE_LIMITED', retryAfter: '15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
})

// Lenient rate limiter for device code polling (RFC 8628)
// Device code flow needs to poll every 5 seconds, so allow 200 requests per 15 min
const deviceCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Allow frequent polling
  message: { error: 'slow_down', error_description: 'Polling too fast' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
})

if (!isTestEnv) {
  // Apply general rate limiter globally
  app.use(generalLimiter)

  // Apply strict limiter to auth routes
  app.use('/v1/auth/login', authLimiter)
  app.use('/v1/auth/register', authLimiter)
  app.use('/v1/auth/otp/send', authLimiter)
  app.use('/v1/auth/otp/verify', authLimiter)
  app.use('/admin/bypass-login', authLimiter)

  // Smart rate limiter for /oauth/token - use lenient limit for device_code polling
  app.use('/oauth/token', express.urlencoded({ extended: true }), (req, res, next) => {
    const grantType = req.body?.grant_type
    if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
      // Device code polling needs frequent requests
      return deviceCodeLimiter(req, res, next)
    }
    // Other grant types get strict rate limiting
    return authLimiter(req, res, next)
  })
}

app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// XSS Protection (aligned with SHA-256 security standards)
app.use(xssSanitizer)

// CORS configuration
app.use(standardCors)

// CSRF Protection is now handled per-route using custom middleware
// - OAuth routes: Use custom CSRF in routes/oauth.routes.ts (setCSRFCookie, generateAuthorizeCSRF, etc.)
// - API routes: Use API key authentication (no CSRF needed)
// - Web routes: Use cookie-based sessions with SameSite (no global CSRF needed)
// This approach avoids the vulnerable csurf package while maintaining security

// Session cookie validation middleware (applies to all routes)
app.use(validateSessionCookie)



// Mount routes
app.use('/v1/auth', authRoutes)
app.use('/v1/auth/resolve', resolveRoutes)  // UAI resolution for Nginx auth_request
app.use('/v1/auth/otp', otpRoutes)  // OTP passwordless auth for CLI
app.use('/otp', otpRoutes)  // Shorthand for test client
app.use('/api/v1/auth/api-keys', apiKeysRoutes)
app.use('/api/v1/projects', projectsRoutes)
app.use('/web', webRoutes)
app.use('/mcp', mcpRoutes)
app.use('/auth', cliRoutes)
app.use('/admin', adminRoutes)
app.use('/oauth', oauthRoutes)
app.use('/oauth', oauthConsentRoutes)  // Supabase OAuth 2.1 Provider consent page
app.use('/v1/sync', syncRoutes)  // Bidirectional sync webhooks (Option 1 fallback)
app.use('/oauth', deviceRoutes)   // Device code flow for CLI (GitHub-style passwordless)

// ============================================================================
// UAI CONVERGENCE POINT
// All auth methods (JWT, API key, cookie, PKCE, MCP token) converge here.
// The UAI router resolves any auth to a single Universal Authentication Identifier.
// Services downstream only see the UAI - not the original auth method.
// ============================================================================
app.use('/api/v1/services', requireUAI)  // Service routes REQUIRE auth + UAI

// ============================================================================
// UNIFIED SERVICE ROUTER (ported from unified-router.cjs)
// Routes authenticated requests to Supabase edge functions
// By this point, req.uai contains the resolved Universal Auth Identifier
// ============================================================================
app.use(servicesRoutes)

// Map /auth/login to /web/login for backward compatibility and CLI
app.get('/auth/login', (req, res) => {
  // Forward query params to web login
  const query = new URLSearchParams(req.query as Record<string, string>).toString()
  res.redirect(`/web/login${query ? `?${query}` : ''}`)
})

// Backward compatibility: Mount OAuth routes under /api/v1/oauth as well
// This ensures CLI tools using the old path still work
app.use('/api/v1/oauth', oauthRoutes)

// ============================================================================
// MCP OAuth Discovery Endpoints (RFC 8414 + RFC 7591)
// Required for MCP clients like Claude Desktop, Windsurf, Cursor, etc.
// ============================================================================

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  const baseUrl = env.AUTH_BASE_URL || 'https://auth.lanonasis.com'
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    introspection_endpoint: `${baseUrl}/oauth/introspect`,
    registration_endpoint: `${baseUrl}/register`,
    scopes_supported: ['memories:read', 'memories:write', 'mcp:connect', 'api:access'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
    code_challenge_methods_supported: ['S256', 'plain'],
    // RFC 8628 Device Authorization Grant (GitHub-style CLI auth)
    device_authorization_endpoint: `${baseUrl}/oauth/device`,
    service_documentation: 'https://docs.lanonasis.com/mcp/oauth',
  })
})

// OAuth 2.0 Dynamic Client Registration (RFC 7591)
// MCP clients use this to register themselves before starting OAuth flow
app.post('/register', express.json(), async (req, res) => {
  try {
    const {
      client_name,
      redirect_uris,
      grant_types = ['authorization_code'],
      response_types = ['code'],
      scope = 'memories:read memories:write mcp:connect',
      token_endpoint_auth_method = 'none',
    } = req.body

    // Validate required fields
    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris is required and must be a non-empty array',
      })
    }

    // Generate dynamic client credentials
    const clientId = `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
    const clientSecret = token_endpoint_auth_method !== 'none'
      ? `mcs_${Buffer.from(crypto.randomBytes(32)).toString('base64url')}`
      : undefined

    // For MCP clients, we auto-approve certain localhost redirect URIs
    const isLocalhost = redirect_uris.every((uri: string) =>
      uri.startsWith('http://localhost') ||
      uri.startsWith('http://127.0.0.1') ||
      uri.startsWith('http://[::1]')
    )

    // Persist the client to database for OAuth flow
    const { dbPool } = await import('../db/client.js')
    await dbPool.query(`
      INSERT INTO auth_gateway.oauth_clients (
        client_id, client_name, client_type, require_pkce,
        allowed_code_challenge_methods, allowed_redirect_uris,
        allowed_scopes, default_scopes, status, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (client_id) DO UPDATE SET
        allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
        updated_at = NOW()
    `, [
      clientId,
      client_name || 'MCP Client',
      'public', // MCP clients are public (no client_secret for token requests)
      true, // require PKCE
      ['S256', 'plain'],
      JSON.stringify(redirect_uris),
      scope.split(' '),
      ['memories:read', 'mcp:connect'],
      'active',
      `Dynamic MCP client registered via RFC 7591 (localhost: ${isLocalhost})`
    ])

    console.log(`MCP Client registered and persisted: ${client_name || 'Anonymous'} (${clientId})`)

    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0, // Never expires
      client_name: client_name || 'MCP Client',
      redirect_uris,
      grant_types,
      response_types,
      scope,
      token_endpoint_auth_method,
    })
  } catch (error) {
    console.error('Client registration error:', error)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to register client',
    })
  }
})

// Also support /oauth/register for clients that expect it there
app.post('/oauth/register', (req, res) => {
  // Redirect to /register endpoint with 307 to preserve POST method
  res.redirect(307, '/register')
})

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

export const createApp = () => app
export default createApp

if (process.env.NODE_ENV !== 'test') {
  // Start server with validation
  app.listen(env.PORT, async () => {
    // Check Redis status (uses lazy connection - will connect on first use if configured)
    if (isRedisCachingEnabled()) {
      const redisStatus = await checkRedisHealth()
      if (redisStatus.connected) {
        console.log('✅ Redis caching enabled and connected')
      } else {
        console.warn('⚠️  Redis configured but not connected (will use database fallback)')
      }
    } else {
      console.log('ℹ️  Redis not configured - using database fallback for state storage')
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
    console.log(`🧪 E2E Test Client: http://localhost:${env.PORT}/test-client`)
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
    console.log(`📧 OTP (Passwordless) endpoints:`)
    console.log(`   - POST /v1/auth/otp/send`)
    console.log(`   - POST /v1/auth/otp/verify`)
    console.log(`   - POST /v1/auth/otp/resend`)
    console.log(`🔑 OAuth endpoints:`)
    console.log(`   - GET  /oauth/authorize (also /api/v1/oauth/authorize)`)
    console.log(`   - POST /oauth/token (also /api/v1/oauth/token)`)
    console.log(`   - POST /oauth/revoke (also /api/v1/oauth/revoke)`)
    console.log(`   - POST /oauth/introspect (also /api/v1/oauth/introspect)`)
    console.log(`🔀 Service Router endpoints (UAI-enabled):`)
    console.log(`   - GET  /services (discovery)`)
    console.log(`   - ALL  /api/v1/services/:name/* (authenticated + UAI routing)`)
    console.log(`   - POST /api/v1/chat/completions (legacy)`)
    console.log(`   - POST /webhook/:service`)
    // Start UAI cache cleanup interval
    const cleanupInterval = startCacheCleanup(5 * 60 * 1000) // Every 5 minutes

    // Log cache configuration
    const cacheStats = await getCacheStats()
    console.log(`🆔 UAI (Universal Auth Identifier):`)
    console.log(`   - GET  /v1/auth/resolve (resolve any auth to UAI)`)
    console.log(`   - All /api/v1/services/* routes resolve to UAI automatically`)
    console.log(`   - Cache TTL: ${process.env.UAI_CACHE_TTL || 300}s`)
    console.log(`   - Cache layers: [${cacheStats.layers.join(' → ')}]`)
    console.log(`🔌 MCP OAuth Discovery (RFC 8414 + RFC 7591):`)
    console.log(`   - GET  /.well-known/oauth-authorization-server`)
    console.log(`   - POST /register (Dynamic Client Registration)`)
    console.log(`🛡️  Admin endpoints:`)
    console.log(`   - POST /admin/bypass-login (EMERGENCY ACCESS)`)
    console.log(`   - POST /admin/change-password`)
    console.log(`   - GET  /admin/status`)
    console.log(`\n🍪 Session cookies enabled for *.lanonasis.com`)
  })

  // Graceful shutdown handlers
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...')
    const { getUAISessionCache } = await import('./services/uai-session-cache.service.js')
    await Promise.all([
      closeRedis(),
      getUAISessionCache().close(),
    ])
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...')
    const { getUAISessionCache } = await import('./services/uai-session-cache.service.js')
    await Promise.all([
      closeRedis(),
      getUAISessionCache().close(),
    ])
    process.exit(0)
  })
}
