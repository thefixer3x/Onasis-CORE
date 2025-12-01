import { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { env } from '../../config/env.js'

/**
 * Enhanced CORS configuration for OAuth endpoints
 * Implements stricter origin validation and security headers
 */

// Parse allowed origins from environment
const getAllowedOrigins = (): (string | RegExp)[] => {
    const origins = env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    const result: (string | RegExp)[] = []

    for (const origin of origins) {
        if (origin === '*') {
            // Only allow * in development
            if (env.NODE_ENV === 'development') {
                result.push('*')
            }
        } else if (origin.startsWith('*.')) {
            // Convert wildcard domains to regex
            const domain = origin.slice(2) // Remove *.
            result.push(new RegExp(`^https?://([a-z0-9-]+\\.)?${domain.replace(/\./g, '\\.')}$`))
        } else {
            result.push(origin)
        }
    }

    return result
}

/**
 * Standard CORS configuration for most endpoints
 */
export const standardCors = cors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-project-scope',
        'X-Requested-With'
    ],
    exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
    ]
})

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

    // Skip referer validation for /oauth/device endpoint
    // Device code flow is used by CLI/terminal apps which don't have Referer headers
    // Protection is provided by rate limiting and the device_code itself
    if (req.path === '/device' || req.path.endsWith('/oauth/device')) {
        return next()
    }

    // Skip referer validation for /oauth/revoke endpoint
    // Token revocation may be called from SDKs/desktop apps without Referer
    // Protection is provided by requiring the token being revoked
    if (req.path === '/revoke' || req.path.endsWith('/oauth/revoke')) {
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