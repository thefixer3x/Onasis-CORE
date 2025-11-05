import compression, { type CompressionOptions as ExpressCompressionOptions } from 'compression'
import type { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger.js'

export interface CompressionOptions {
  threshold?: number
  level?: number
  filter?: (req: Request, res: Response) => boolean
}

/**
 * Determine whether a response should be compressed.
 * Optimised for OAuth token responses and small JSON payloads.
 */
function shouldCompress(req: Request, res: Response, customFilter?: (req: Request, res: Response) => boolean): boolean {
  // Allow explicit opt-out via header
  if (req.headers['x-no-compression']) {
    return false
  }

  // Do not re-compress responses that already specify an encoding
  if (res.getHeader('content-encoding')) {
    return false
  }

  const contentType = res.getHeader('content-type')
  if (typeof contentType === 'string' && contentType.includes('application/json')) {
    return true
  }

  const lengthHeader = res.getHeader('content-length')
  if (lengthHeader && Number(lengthHeader) < 1024) {
    return false
  }

  // Fall back to compression's default filter or provided override
  return (customFilter ?? compression.filter)(req, res)
}

/**
 * Builds a compression middleware instance with sensible defaults for auth responses.
 */
export function createCompressionMiddleware(options: CompressionOptions = {}) {
  const compressionOptions: ExpressCompressionOptions = {
    threshold: options.threshold ?? 1024,
    level: options.level ?? 6,
    filter: (req, res) => shouldCompress(req, res, options.filter),
  }

  return compression(compressionOptions)
}

/**
 * Ready-to-use compression middleware tuned for OAuth output.
 */
export const oauthCompression = createCompressionMiddleware({
  threshold: 512,
  level: 6,
})

/**
 * Adds security headers and logs response sizes for observability.
 */
export function responseOptimizationMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  })

  const originalSend = res.send.bind(res)
  res.send = (body: unknown) => {
    try {
      const payload = typeof body === 'string' ? body : JSON.stringify(body)
      const size = Buffer.byteLength(payload)
      logger.debug(`Auth gateway response size: ${size} bytes`)
    } catch (error) {
      logger.debug('Auth gateway response size: unavailable', { error })
    }
    return originalSend(body)
  }

  next()
}
