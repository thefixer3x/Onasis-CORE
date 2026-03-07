import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Generate a new UUIDv4 correlation ID.
 */
export function generateRequestId(): string {
  return crypto.randomUUID()
}

/**
 * Read X-Request-ID from inbound headers, or generate a fresh one.
 * Validates incoming values as proper UUIDs to prevent header injection.
 */
export function extractOrGenerateRequestId(req: Request): string {
  const incoming = req.headers['x-request-id']
  if (typeof incoming === 'string' && UUID_RE.test(incoming.trim())) {
    return incoming.trim()
  }
  return crypto.randomUUID()
}

/**
 * Express middleware: generate or preserve a request correlation ID.
 *
 * Reads X-Request-ID from inbound headers (validates as UUID) or generates a
 * fresh one.  Sets req.requestId and echoes the ID in the X-Request-ID
 * response header so callers can correlate logs across services.
 *
 * Mount this early in the middleware chain in src/index.ts:
 *   app.use(requestCorrelation)
 */
export function requestCorrelation(req: Request, res: Response, next: NextFunction): void {
  req.requestId = extractOrGenerateRequestId(req)
  res.set('X-Request-ID', req.requestId)
  next()
}

/**
 * Return a minimal correlation object suitable for spreading into logAuthEvent
 * calls.  Falls back to generating a new ID if the middleware was not mounted.
 */
export function auditCorrelation(req: Request): { request_id: string } {
  if (!req.requestId) {
    req.requestId = crypto.randomUUID()
  }
  return { request_id: req.requestId }
}
