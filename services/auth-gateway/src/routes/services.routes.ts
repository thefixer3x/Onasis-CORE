/**
 * Services Routes
 * Unified service routing endpoints (ported from unified-router.cjs)
 * 
 * Provides:
 * - Service discovery (/services)
 * - Dynamic service routing (/api/v1/services/:service/*)
 * - Webhook forwarding (/webhook/:service)
 * - Legacy chat completions compatibility (/api/v1/chat/completions)
 */

import express from 'express'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'
import { requireAuth, optionalAuth, requireScopes } from '../middleware/auth.js'
import { privacyProtection, attachServiceMetadata } from '../middleware/privacy.js'
import { routeToSupabase } from '../services/router.service.js'
import {
  SERVICE_ROUTES,
  RATE_LIMITS,
  ROUTER_VERSION,
  getServiceConfig,
  getServiceNames,
  serviceExists,
} from '../../config/services.config.js'
import { env } from '../../config/env.js'
import type { RouterRequest, ServiceDiscoveryResponse, RouterErrorResponse } from '../types/router.types.js'
import type { Response } from 'express'

const router = express.Router()

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITERS
// ═══════════════════════════════════════════════════════════════════════════════

const createServiceRateLimit = (tier: keyof typeof RATE_LIMITS) => {
  const config = RATE_LIMITS[tier]
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: { error: config.message, code: 'RATE_LIMIT_EXCEEDED' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use anonymous session key instead of IP for privacy
      const sessionId =
        req.headers['x-session-id'] ||
        req.headers['authorization']?.toString().substring(0, 20) ||
        req.headers['x-api-key']?.toString().substring(0, 20) ||
        'anonymous'
      return crypto.createHash('sha256').update(sessionId as string).digest('hex').substring(0, 16)
    },
    skip: () => process.env.NODE_ENV === 'test',
  })
}

const generalRateLimit = createServiceRateLimit('general')
const aiRateLimit = createServiceRateLimit('ai')
const mediaRateLimit = createServiceRateLimit('media')
const webhookRateLimit = createServiceRateLimit('webhook')

// Map tier names to rate limiters
const rateLimiters = {
  general: generalRateLimit,
  ai: aiRateLimit,
  media: mediaRateLimit,
  webhook: webhookRateLimit,
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /services
 * Returns list of all available services with metadata
 */
router.get('/services', generalRateLimit, (req: RouterRequest, res: Response): void => {
  const services = Object.entries(SERVICE_ROUTES).map(([name, config]) => ({
    name,
    endpoint: `/api/v1/services/${name}`,
    description: config.description,
    methods: config.allowedMethods,
    requires_auth: config.requiresAuth,
    scopes: config.scopes,
  }))

  const response: ServiceDiscoveryResponse = {
    available_services: services,
    total_count: services.length,
    base_url: `${req.protocol}://${req.get('host')}`,
    documentation: 'https://docs.lanonasis.com/services',
    version: ROUTER_VERSION,
  }

  res.json(response)
})

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC SERVICE ROUTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ALL /api/v1/services/:service/*path
 * Dynamic routing to Supabase edge functions
 */
router.all(
  '/api/v1/services/:service/*path',
  privacyProtection,
  async (req: RouterRequest, res: Response): Promise<void> => {
    const serviceName = typeof req.params.service === 'string' ? req.params.service : req.params.service?.[0] || 'unknown'
    const serviceConfig = getServiceConfig(serviceName)

    // Check if service exists
    if (!serviceConfig) {
      const errorResponse: RouterErrorResponse = {
        error: {
          message: `Service '${serviceName}' not found`,
          type: 'service_not_found',
          code: 'INVALID_SERVICE',
        },
        available_services: getServiceNames(),
        request_id: req.anonymousId,
      }
      res.status(404).json(errorResponse)
      return
    }

    // Check HTTP method
    if (!serviceConfig.allowedMethods.includes(req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')) {
      res.status(405).json({
        error: {
          message: `Method ${req.method} not allowed for service '${serviceName}'`,
          type: 'method_not_allowed',
          code: 'METHOD_NOT_ALLOWED',
        },
        allowed_methods: serviceConfig.allowedMethods,
        request_id: req.anonymousId,
      })
    }

    // Apply rate limiting based on service tier
    const rateLimiter = rateLimiters[serviceConfig.rateLimitTier]

    rateLimiter(req, res, async (rateLimitErr) => {
      if (rateLimitErr) {
        return res.status(429).json({
          error: {
            message: 'Rate limit exceeded for this service',
            type: 'rate_limit_exceeded',
            code: 'SERVICE_RATE_LIMIT',
          },
          service: serviceName,
          request_id: req.anonymousId,
        })
      }

      // Apply authentication if required
      if (serviceConfig.requiresAuth) {
        requireAuth(req, res, async (authErr) => {
          if (authErr) return // requireAuth already sent response

          // Check scopes if specified
          if (serviceConfig.scopes && serviceConfig.scopes.length > 0) {
            const hasScope = requireScopes(...serviceConfig.scopes)
            hasScope(req, res, async (scopeErr) => {
              if (scopeErr) return // requireScopes already sent response
              await executeRoute()
            })
          } else {
            await executeRoute()
          }
        })
      } else {
        // No auth required, but attach user if present
        optionalAuth(req, res, async () => {
          await executeRoute()
        })
      }

      async function executeRoute() {
        try {
          // Attach service metadata
          attachServiceMetadata(serviceName)(req, res, () => { })

          // Route to Supabase
          const result = await routeToSupabase(
            req,
            serviceName,
            serviceConfig.path,
            serviceConfig.timeout
          )

          res.json(result)
        } catch (error) {
          res.status(500).json({
            error: {
              message: 'Service temporarily unavailable',
              type: 'service_error',
              code: 'ROUTING_FAILURE',
            },
            service: serviceName,
            request_id: req.anonymousId,
          })
        }
      }
    })
  }
)

/**
 * Shorthand route without /api/v1/services prefix
 * ALL /services/:service (redirects to full path)
 */
router.all('/services/:service', (req: RouterRequest, res: Response): void => {
  const serviceName = typeof req.params.service === 'string' ? req.params.service : req.params.service?.[0] || 'unknown'
  const fullPath = `/api/v1/services/${serviceName}${req.path.replace(`/services/${serviceName}`, '')}`
  res.redirect(307, fullPath)
})

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/chat/completions
 * Legacy OpenAI-compatible endpoint (routes to ai-chat service)
 */
router.post(
  '/api/v1/chat/completions',
  privacyProtection,
  aiRateLimit,
  requireAuth,
  async (req: RouterRequest, res: Response) => {
    try {
      req.headers['x-service'] = 'ai-chat'
      const result = await routeToSupabase(
        req,
        'ai-chat',
        SERVICE_ROUTES['ai-chat'].path,
        SERVICE_ROUTES['ai-chat'].timeout
      )
      res.json(result)
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'AI chat service unavailable',
          type: 'ai_service_error',
          code: 'CHAT_FAILURE',
        },
        request_id: req.anonymousId,
      })
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /webhook/:service
 * Webhook endpoint for external integrations
 */
router.post(
  '/webhook/:service',
  privacyProtection,
  webhookRateLimit,
  async (req: RouterRequest, res: Response): Promise<void> => {
    const serviceName = typeof req.params.service === 'string' ? req.params.service : req.params.service?.[0] || 'unknown'
    const serviceConfig = getServiceConfig(serviceName)

    if (!serviceConfig) {
      res.status(404).json({
        success: false,
        error: 'Webhook service not found',
        available_services: getServiceNames(),
        request_id: req.anonymousId,
      })
      return
    }

    try {
      const result = await routeToSupabase(
        req,
        serviceName,
        serviceConfig.path,
        serviceConfig.timeout
      )
      res.json({ success: true, result })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: req.anonymousId,
      })
    }
  }
)

export default router
