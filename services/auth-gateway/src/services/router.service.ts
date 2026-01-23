/**
 * Router Service
 * Handles routing requests to Supabase edge functions
 * Ported from unified-router.cjs with TypeScript and auth integration
 */

import crypto from 'crypto'
import { env } from '../../config/env.js'
import { logger } from '../utils/logger.js'
import { PII_FIELDS } from '../types/router.types.js'
import type { RouterRequest, SupabaseRoutingResult } from '../types/router.types.js'

/**
 * Sanitize request body by removing PII fields
 */
export function sanitizeRequestBody<T extends Record<string, unknown>>(body: T): T {
  if (!body || typeof body !== 'object') return body

  const sanitized = JSON.parse(JSON.stringify(body)) as T

  const removePII = (obj: Record<string, unknown>) => {
    if (typeof obj === 'object' && obj !== null) {
      for (const field of PII_FIELDS) {
        delete obj[field]
      }
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          removePII(obj[key] as Record<string, unknown>)
        }
      }
    }
  }

  removePII(sanitized as unknown as Record<string, unknown>)
  return sanitized
}

/**
 * Sanitize response by masking vendor information
 */
export function sanitizeResponse<T extends Record<string, unknown>>(data: T): T {
  if (!data || typeof data !== 'object') return data

  const sanitized = JSON.parse(JSON.stringify(data)) as T

  // Mask vendor-specific identifiers
  delete (sanitized as Record<string, unknown>).model_version
  delete (sanitized as Record<string, unknown>).provider_id
  delete (sanitized as Record<string, unknown>).internal_request_id
  delete (sanitized as Record<string, unknown>).organization
  delete (sanitized as Record<string, unknown>).processing_ms

  // Replace vendor branding with Onasis branding
  if ('provider' in sanitized) {
    (sanitized as Record<string, unknown>).provider = 'onasis-core'
  }

  // Mask model names
  if ('model' in sanitized && typeof sanitized.model === 'string') {
    (sanitized as Record<string, unknown>).model = sanitized.model
      .replace(/gpt-|claude-|palm-|llama-/, 'onasis-')
      .replace(/openai|anthropic|google|meta/, 'onasis')
  }

  return sanitized
}

/**
 * Route a request to a Supabase edge function
 */
export async function routeToSupabase<T = unknown>(
  req: RouterRequest,
  serviceName: string,
  supabasePath: string,
  timeout = 60000
): Promise<SupabaseRoutingResult<T>> {
  const url = `${env.SUPABASE_URL=https://<project-ref>.supabase.co
  const sanitizedBody = sanitizeRequestBody(req.body || {})
  const requestStartTime = Date.now()

  // Prepare headers for Supabase
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    'apikey': env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    'User-Agent': 'Onasis-CORE/1.0',
  }

  // Forward specific headers while maintaining privacy
  if (req.headers['x-service']) {
    headers['X-Service'] = req.headers['x-service'] as string
  }
  if (req.headers['x-vendor']) {
    headers['X-Vendor'] = req.headers['x-vendor'] as string
  }
  if (req.headers['x-project-scope']) {
    headers['X-Project-Scope'] = req.headers['x-project-scope'] as string
  }

  // Forward UAI context (preferred - universal auth identifier)
  // UAI is the SINGLE canonical identity that all auth methods resolve to
  if (req.uai) {
    headers['X-UAI-Auth-Id'] = req.uai.authId  // THE canonical identity
    headers['X-UAI-Organization'] = req.uai.organizationId || ''
    headers['X-UAI-Auth-Method'] = req.uai.authMethod
    headers['X-UAI-Email'] = req.uai.email || ''
    // Also set X-User-Id for backward compatibility during migration
    headers['X-User-Id'] = req.uai.authId
    headers['X-User-Role'] = 'authenticated'
  }
  // Legacy fallback: Forward old user context if UAI not available
  else if (req.user) {
    headers['X-User-Id'] = req.user.userId
    headers['X-User-Role'] = req.user.role || 'authenticated'
    if (req.user.project_scope) {
      headers['X-Project-Scope'] = req.user.project_scope
    }
  }

  logger.info('Routing to Supabase', {
    requestId: req.anonymousId,
    service: serviceName,
    url,
    method: req.method,
    bodySize: JSON.stringify(sanitizedBody).length,
    authenticated: !!req.uai || !!req.user,
    uaiResolved: !!req.uai,
    fromCache: req.uai?.fromCache,
  })

  // Create AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: req.method !== 'GET' ? JSON.stringify(sanitizedBody) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const responseTime = Date.now() - requestStartTime

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Supabase function error', {
        requestId: req.anonymousId,
        service: serviceName,
        status: response.status,
        error: errorText,
      })
      throw new Error(`Supabase function error: ${response.status} - ${errorText}`)
    }

    const data = await response.json() as T
    const sanitizedResponse = sanitizeResponse(data as unknown as Record<string, unknown>) as unknown as T

    logger.info('Supabase request completed', {
      requestId: req.anonymousId,
      service: serviceName,
      responseTime,
      status: 'success',
    })

    return {
      data: sanitizedResponse,
      onasis_metadata: {
        service: serviceName,
        response_time: responseTime,
        request_id: req.anonymousId || crypto.randomBytes(16).toString('hex'),
        routed_via: 'supabase',
        privacy_level: 'high',
        vendor_masked: true,
        pii_removed: true,
      },
    }
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Supabase request timed out', {
        requestId: req.anonymousId,
        service: serviceName,
        timeout,
      })
      throw new Error(`Request to ${serviceName} timed out after ${timeout}ms`)
    }

    logger.error('Routing to Supabase failed', {
      requestId: req.anonymousId,
      service: serviceName,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}

/**
 * Generate anonymous client fingerprint
 */
export function generateClientFingerprint(userAgent?: string, acceptLanguage?: string): string {
  return crypto
    .createHash('sha256')
    .update(userAgent || '')
    .update(acceptLanguage || '')
    .digest('hex')
    .substring(0, 12)
}

/**
 * Generate anonymous request ID
 */
export function generateAnonymousId(): string {
  return crypto.randomBytes(16).toString('hex')
}
