import { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { env } from '../../config/env.js'

/**
 * Enhanced CORS configuration for OAuth endpoints
 * Implements stricter origin validation and security headers
 */

// Parse allowed origins from environment (called lazily to avoid circular deps)
const getAllowedOrigins = (): (string | RegExp)[] => {
    // Access env lazily to avoid circular dependency issues
    const corsOrigin = env?.CORS_ORIGIN || process.env.CORS_ORIGIN || '*'
    const nodeEnv = env?.NODE_ENV || process.env.NODE_ENV
    const origins = corsOrigin.split(',').map(origin => origin.trim())
    const result: (string | RegExp)[] = []

    for (const origin of origins) {
        if (origin === '*') {
            // Only allow * in development or test
            if (nodeEnv === 'development' || nodeEnv === 'test') {
                result.push('*')
            }
        } else if (origin.startsWith('*.')) {
            // Convert wildcard domains to regex
            const domain = origin.slice(2) // Remove *.
            result.push(new RegExp(`^https?://([a-z0-9-]+\\.)?${domain.replace(/\./g, '\\.')}$`))
        } else if (origin.endsWith(':*')) {
            // Allow any port on a specific origin (e.g., http://localhost:*)
            const base = origin.slice(0, -2)
            const escaped = base.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            result.push(new RegExp(`^${escaped}(?::\\d+)?$`))
        } else if (origin.includes('*')) {
            // Generic wildcard handling (e.g., https://*.lanonasis.com)
            const escaped = origin.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            result.push(new RegExp(`^${escaped.replace(/\\\*/g, '[^/]+')}$`))
        } else {
            result.push(origin)
        }
    }

    return result
}

/**
 * Standard CORS configuration for most endpoints
 * Note: origin is a function to evaluate lazily at request time
 */
export const standardCors = cors({
    origin: (origin, callback) => {
        const allowed = getAllowedOrigins()
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true)
        // Check if origin is allowed
        const isAllowed = allowed.some(allowedOrigin => {
            if (allowedOrigin === '*') return true
            if (allowedOrigin instanceof RegExp) return allowedOrigin.test(origin)
            return allowedOrigin === origin
        })
        callback(null, isAllowed)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-project-scope',
        'X-Project-Scope',
        'X-Requested-With'
    ],
    exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
    ]
})

/**
 * Server-to-server origins that are always allowed for internal API communication
 * These are trusted Lanonasis services that need to call OAuth endpoints
 */
const TRUSTED_SERVER_ORIGINS = [
    'https://api.lanonasis.com',
    'https://mcp.lanonasis.com',
    'https://mcp1.lanonasis.com',  // Enterprise MCP server
    'https://maas.lanonasis.com',
    'https://auth.lanonasis.com'  // Device verification page makes same-origin API calls
]

/**
 * Strict CORS configuration for OAuth endpoints
 * More restrictive to prevent CSRF and other attacks
 */
export const oauthCors = cors({
    origin: (origin, callback) => {
        // Allow same-origin requests (no origin header)
        if (!origin) {
            return callback(null, true)
        }

        // Always allow trusted server-to-server origins
        if (TRUSTED_SERVER_ORIGINS.includes(origin)) {
            return callback(null, true)
        }

        const allowedOrigins = getAllowedOrigins()

        // In production, be very strict
        if (env.NODE_ENV === 'production') {
            const isAllowed = allowedOrigins.some(allowed => {
                if (typeof allowed === 'string') {
                    return allowed === origin || allowed === '*'
                }
                return allowed.test(origin)
            })

            if (!isAllowed) {
                return callback(new Error(`Origin ${origin} not allowed by OAuth CORS policy`), false)
            }
        }

        callback(null, true)
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'], // Only allow necessary methods
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With'
    ],
    exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Location' // For redirect responses
    ],
    maxAge: 86400 // Cache preflight for 24 hours
})

/**
 * Enhanced security headers middleware for OAuth endpoints
 */
export function oauthSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
    // Strict CSP for OAuth endpoints
    // Only apply to OAuth routes, not web routes (web routes need form submission)
    if (req.path.startsWith('/web/')) {
        return next() // Skip CSP for web routes
    }

    // Strict CSP for OAuth endpoints only
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'"
    )

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY')

    // Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // Referrer policy for OAuth flows
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Prevent caching of sensitive OAuth responses
    if (req.method === 'POST' || req.url.includes('/token') || req.url.includes('/introspect')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
    }

    next()
}

/**
 * Validate referer header for OAuth endpoints (CSRF protection)
 */
export function validateReferer(req: Request, res: Response, next: NextFunction): void {
    // Skip validation for GET requests and preflight
    if (req.method === 'GET' || req.method === 'OPTIONS') {
        return next()
    }

    // Skip referer validation for /oauth/token endpoint
    // PKCE provides CSRF protection via code_verifier for native apps and CLIs
    if (req.path === '/token' || req.path.endsWith('/oauth/token')) {
        return next()
    }

    // Skip referer validation for /oauth/introspect endpoint
    // Server-to-server introspection requests don't have Referer headers
    // Protection is provided by rate limiting and the token itself
    if (req.path === '/introspect' || req.path.endsWith('/oauth/introspect')) {
        return next()
    }

    // Skip referer validation for all device flow endpoints
    // Device code flow is used by CLI/terminal apps which don't have Referer headers
    // Protection is provided by rate limiting and the device_code itself
    // This includes /device, /device/check, /device/verify, /device/authorize, /device/deny
    if (req.path.startsWith('/device') || req.path.includes('/oauth/device')) {
        return next()
    }

    // Skip referer validation for /oauth/revoke endpoint
    // Token revocation may be called from SDKs/desktop apps without Referer
    // Protection is provided by requiring the token being revoked
    if (req.path === '/revoke' || req.path.endsWith('/oauth/revoke')) {
        return next()
    }

    // Skip referer validation for OTP endpoints
    // These are called during device flow and email verification from web pages
    // Protection is provided by rate limiting and OTP expiry
    if (req.path.includes('/otp/')) {
        return next()
    }

    const referer = req.get('Referer') || req.get('Origin')

    if (!referer && env.NODE_ENV === 'production') {
        res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing referer header'
        })
        return
    }

    if (referer) {
        const allowedOrigins = getAllowedOrigins()
        const isValidReferer = allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') {
                return referer.startsWith(allowed) || allowed === '*'
            }
            return allowed.test(referer)
        })

        if (!isValidReferer && env.NODE_ENV === 'production') {
            res.status(400).json({
                error: 'invalid_request',
                error_description: 'Invalid referer'
            })
            return
        }
    }

    next()
}
