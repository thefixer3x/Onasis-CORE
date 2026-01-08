import { env } from '../../config/env.js';
// In-memory store for rate limiting (production should use Redis)
const store = {};
// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const key in store) {
        if (store[key].resetTime <= now) {
            delete store[key];
        }
    }
}, 60000); // Cleanup every minute
/**
 * Create a rate limiting middleware
 */
export function createRateLimit(options) {
    return (req, res, next) => {
        // Generate key for rate limiting (IP + User-Agent by default)
        const key = options.keyGenerator
            ? options.keyGenerator(req)
            : `${req.ip}:${req.get('User-Agent') || 'unknown'}`;
        const now = Date.now();
        const windowStart = now - options.windowMs;
        // Initialize or get existing entry
        if (!store[key] || store[key].resetTime <= windowStart) {
            store[key] = {
                count: 0,
                resetTime: now + options.windowMs
            };
        }
        // Check if limit exceeded
        if (store[key].count >= options.maxRequests) {
            const resetTime = Math.ceil((store[key].resetTime - now) / 1000);
            res.set({
                'X-RateLimit-Limit': options.maxRequests.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': resetTime.toString(),
                'Retry-After': resetTime.toString()
            });
            res.status(429).json({
                error: 'rate_limit_exceeded',
                error_description: options.message || 'Too many requests, please try again later.',
                retry_after: resetTime
            });
            return;
        }
        // Increment counter
        store[key].count++;
        // Set rate limit headers
        const remaining = Math.max(0, options.maxRequests - store[key].count);
        const resetTime = Math.ceil((store[key].resetTime - now) / 1000);
        res.set({
            'X-RateLimit-Limit': options.maxRequests.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': resetTime.toString()
        });
        next();
    };
}
/**
 * OAuth-specific rate limiters following RFC recommendations
 */
// Authorization endpoint: 10 requests per minute per IP
export const authorizeRateLimit = createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many authorization requests. Please try again later.',
    keyGenerator: (req) => `authorize:${req.ip}`
});
// Token endpoint: 5 requests per minute per client
export const tokenRateLimit = createRateLimit({
    windowMs: 60 * 1000, // 1 minute  
    maxRequests: 5,
    message: 'Too many token requests. Please try again later.',
    keyGenerator: (req) => {
        // Use client_id if available, fall back to IP
        const clientId = req.body?.client_id || req.query?.client_id;
        return clientId ? `token:${clientId}` : `token:${req.ip}`;
    }
});
// Revocation endpoint: 10 requests per minute per client
export const revokeRateLimit = createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many revocation requests. Please try again later.',
    keyGenerator: (req) => {
        const clientId = req.body?.client_id;
        return clientId ? `revoke:${clientId}` : `revoke:${req.ip}`;
    }
});
// Introspection endpoint: 20 requests per minute per client (higher for token validation)
export const introspectRateLimit = createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    message: 'Too many introspection requests. Please try again later.',
    keyGenerator: (req) => {
        const clientId = req.body?.client_id;
        return clientId ? `introspect:${clientId}` : `introspect:${req.ip}`;
    }
});
// General OAuth rate limit for sensitive operations
export const oauthGeneralRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'OAuth rate limit exceeded. Please try again later.',
    keyGenerator: (req) => `oauth:${req.ip}`
});
/**
 * Adaptive rate limiting based on environment
 */
export function getEnvironmentAwareRateLimit(baseOptions) {
    // Stricter limits in production
    if (env.NODE_ENV === 'production') {
        return baseOptions;
    }
    // More relaxed limits in development
    return {
        ...baseOptions,
        maxRequests: baseOptions.maxRequests * 3, // 3x more requests in dev
        windowMs: baseOptions.windowMs / 2 // Shorter window in dev
    };
}
