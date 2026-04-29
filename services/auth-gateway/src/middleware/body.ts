import type { NextFunction, Request, Response } from 'express'

const BODY_REQUIRED_METHODS = new Set(['POST', 'PUT', 'PATCH'])

const BODYLESS_ROUTE_PATTERNS = [
  /^\/v1\/auth\/logout$/,
  /^\/v1\/auth\/verify$/,
  /^\/v1\/auth\/verify-api-key$/,
  /^\/oauth\/register$/,
  /^\/api\/v1\/services(?:\/|$)/,
  /^\/services(?:\/|$)/,
]

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function allowsMissingBody(pathname: string): boolean {
  return BODYLESS_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
}

function hasExplicitlyEmptyBody(req: Request): boolean {
  const contentLength = req.headers['content-length']
  return contentLength === '0'
}

export function requireObjectBody(req: Request, res: Response, next: NextFunction) {
  if (!BODY_REQUIRED_METHODS.has(req.method) || allowsMissingBody(req.path)) {
    return next()
  }

  if (hasExplicitlyEmptyBody(req) || !isObjectBody(req.body)) {
    return res.status(400).json({
      error: 'Request body is required',
      code: 'INVALID_BODY',
    })
  }

  return next()
}
