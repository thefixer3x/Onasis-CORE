import type { Request, Response, NextFunction } from 'express'
import { verifyToken, type JWTPayload } from '../utils/jwt.js'
import { findSessionByToken } from '../services/session.service.js'

const SESSION_DB_TIMEOUT_MS = 3000

export async function validateSessionCookie(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const sessionToken = req.cookies.lanonasis_session

    if (!sessionToken) {
        return next()
    }

    // Verify JWT signature first — fast, no DB. Throws if tampered/malformed.
    let payload: JWTPayload
    try {
        payload = verifyToken(sessionToken)
    } catch {
        clearSessionCookies(res)
        return next()
    }

    // Expiry check — no DB needed for clearly expired tokens
    if (payload.exp && payload.exp * 1000 < Date.now()) {
        clearSessionCookies(res)
        return next()
    }

    // DB lookup with timeout — a transient failure must not silently drop a valid session.
    // If the DB is unavailable, trust the signed JWT and continue in degraded mode.
    let session: Awaited<ReturnType<typeof findSessionByToken>> | null = null
    let dbUnavailable = false

    try {
        const dbTimeout = new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(Object.assign(new Error('session_db_timeout'), { code: 'SESSION_DB_TIMEOUT' })),
                SESSION_DB_TIMEOUT_MS
            )
        )
        session = await Promise.race([findSessionByToken(sessionToken), dbTimeout])
    } catch {
        dbUnavailable = true
    }

    if (dbUnavailable) {
        // Transient DB failure — trust the signed JWT, preserve cookie
        req.user = buildUser(payload)
        return next()
    }

    if (!session) {
        // Session genuinely not found or revoked — clear cookie
        clearSessionCookies(res)
        return next()
    }

    req.user = buildUser(payload)
    next()
}

function clearSessionCookies(res: Response): void {
    const cookieDomain = process.env.COOKIE_DOMAIN || '.lanonasis.com'
    res.clearCookie('lanonasis_session', { domain: cookieDomain, path: '/' })
    res.clearCookie('lanonasis_user', { domain: cookieDomain, path: '/' })
}

function buildUser(payload: JWTPayload): NonNullable<Request['user']> {
    return {
        userId: payload.sub,
        organizationId: payload.organization_id ?? 'unknown',
        role: payload.role,
        plan: payload.plan || 'free',
        sub: payload.sub,
        project_scope: payload.project_scope,
        platform: payload.platform,
        email: payload.email,
        authSource: 'sso',
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
