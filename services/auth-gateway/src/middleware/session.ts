import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt.js'

/**
 * Middleware to validate session cookie
 * Attaches user to request if valid session exists
 */
export async function validateSessionCookie(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const sessionToken = req.cookies.lanonasis_session

    if (!sessionToken) {
        return next() // No session cookie, continue without user
    }

    try {
        // Verify JWT token
        const payload = verifyToken(sessionToken)

        // Check if token is expired
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            // Token expired, clear cookies
            const cookieDomain = process.env.COOKIE_DOMAIN || '.lanonasis.com'
            res.clearCookie('lanonasis_session', {
                domain: cookieDomain,
                path: '/',
            })
            res.clearCookie('lanonasis_user', {
                domain: cookieDomain,
                path: '/',
            })
            return next()
        }

        // Attach user to request (convert JWTPayload to UnifiedUser)
        req.user = {
            userId: payload.sub,
            organizationId: payload.project_scope ?? 'unknown',
            role: payload.role,
            plan: payload.plan || 'free',
            sub: payload.sub,
            project_scope: payload.project_scope,
            platform: payload.platform,
            email: payload.email,
        }
        next()
    } catch (error) {
        // Invalid token, clear cookies
        const cookieDomain = process.env.COOKIE_DOMAIN || '.lanonasis.com'
        res.clearCookie('lanonasis_session', {
            domain: cookieDomain,
            path: '/',
        })
        res.clearCookie('lanonasis_user', {
            domain: cookieDomain,
            path: '/',
        })
        next()
    }
}

/**
 * Middleware to require authentication
 * Returns 401 if no valid session exists
 */
export function requireSessionCookie(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED',
            login_url: `${process.env.AUTH_GATEWAY_URL || 'https://auth.lanonasis.com'}/web/login`,
        })
    }
    next()
}

