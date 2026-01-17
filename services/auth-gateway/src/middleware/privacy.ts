/**
 * Privacy Protection Middleware
 * Strips identifying information and adds privacy headers
 * Ported from unified-router.cjs
 */

import type { Response, NextFunction } from 'express'
import type { RouterRequest } from '../types/router.types.js'
import { generateAnonymousId, generateClientFingerprint } from '../services/router.service.js'
import { logger } from '../utils/logger.js'
import { ROUTER_VERSION } from '../../config/services.config.js'

/**
 * Privacy protection middleware
 * - Generates anonymous request ID
 * - Strips identifying headers
 * - Adds Onasis privacy headers
 */
export function privacyProtection(req: RouterRequest, res: Response, next: NextFunction) {
  // Generate anonymous request ID
  req.anonymousId = generateAnonymousId()
  req.timestamp = Date.now()

  // Store original headers before stripping
  const userAgent = req.headers['user-agent'] as string
  const acceptLanguage = req.headers['accept-language'] as string

  // Strip identifying headers before forwarding
  delete req.headers['x-real-ip']
  delete req.headers['x-forwarded-for']
  delete req.headers['x-forwarded-host']
  delete req.headers['cf-connecting-ip']
  delete req.headers['x-forwarded-proto']
  delete req.headers['x-client-ip']
  delete req.headers['x-cluster-client-ip']
  delete req.headers['true-client-ip']

  // Generate anonymous client fingerprint for analytics
  req.clientFingerprint = generateClientFingerprint(userAgent, acceptLanguage)

  // Add Onasis privacy headers to response
  res.setHeader('X-Powered-By', 'Onasis-CORE')
  res.setHeader('X-Privacy-Level', 'High')
  res.setHeader('X-Request-ID', req.anonymousId)
  res.setHeader('X-Router-Version', ROUTER_VERSION)

  // Log anonymized request (for debugging, not tracking)
  logger.debug('Router request processed', {
    requestId: req.anonymousId,
    clientFingerprint: req.clientFingerprint,
    path: req.path,
    method: req.method,
    service: req.headers['x-service'] || 'unknown',
  })

  next()
}

/**
 * Service identification middleware
 * Attaches service name and metadata to request
 */
export function attachServiceMetadata(serviceName: string) {
  return (req: RouterRequest, _res: Response, next: NextFunction) => {
    req.serviceName = serviceName
    req.routerMetadata = {
      service: serviceName,
      startTime: Date.now(),
      authenticated: !!req.user,
      userId: req.user?.sub,
      projectScope: req.user?.project_scope,
    }
    next()
  }
}
