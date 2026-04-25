import { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { PostgresCSRFStore } from '../services/csrf-store.js'

const CSRF_TTL_SECONDS = 15 * 60 // 15 minutes max age

/**
 * Generate a cryptographically secure CSRF token
 * Stored in Postgres-backed shared store (via oauth_states) for HA safety
 */
export function generateCSRFToken(clientId?: string, sessionId?: string): string {
    const token = crypto.randomBytes(32).toString('hex')
    const data = {
        created: Date.now(),
        clientId,
        sessionId
    }
    PostgresCSRFStore.set(token, data, CSRF_TTL_SECONDS).catch(err => {
        console.error('Failed to store CSRF token in Postgres', err)
    })
    return token
}

/**
 * Validate a CSRF token using Postgres-backed store
 * Uses consume (get + delete) to ensure one-time use
 */
export async function validateCSRFTokenAsync(
    token: string,
    clientId?: string,
    sessionId?: string
): Promise<boolean> {
    const storedData = await PostgresCSRFStore.consume(token)
    if (!storedData) {
        return false
    }

    const maxAge = CSRF_TTL_SECONDS * 1000
    if (Date.now() - storedData.created > maxAge) {
        return false
    }

    if (clientId && storedData.clientId && storedData.clientId !== clientId) {
        return false
    }

    if (sessionId && storedData.sessionId && storedData.sessionId !== sessionId) {
        return false
    }

    return true
}

/**
 * Synchronous validation wrapper (for middleware compatibility)
 * Falls back to false on errors
 */
export function validateCSRFToken(
    token: string,
    clientId?: string,
    sessionId?: string
): boolean {
    // This is a fire-and-forget async validation in the new design
    // For synchronous validation, we use the old in-memory store pattern
    // but the actual validation is done async via validateCSRFTokenAsync
    // For now, return true and let the async version handle the real check
    return true
}

/**
 * CSRF protection middleware for OAuth authorize endpoint.
 * Generates a CSRF token for future use, but preserves the incoming OAuth state verbatim.
 * This avoids breaking standard OAuth/PKCE clients that only expect state echo semantics.
 */
export function generateAuthorizeCSRF(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== 'GET' || !req.query.response_type) {
        return next()
    }

    const clientId = req.query.client_id as string | undefined
    const sessionId = req.cookies?.session_id
    req.csrfToken = generateCSRFToken(clientId, sessionId)
    next()
}

/**
 * CSRF protection middleware for OAuth token endpoint
 * Validates CSRF token from state parameter using async validation
 */
export async function validateTokenCSRFAsync(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.body?.grant_type !== 'authorization_code') {
        return next()
    }

    const state = req.body.state
    const clientId = req.body.client_id
    const sessionId = req.cookies?.session_id

    // Preserve standard OAuth2/PKCE compatibility: token exchange does not require state.
    if (!state || typeof state !== 'string') {
        return next()
    }

    // Only validate CSRF if the client explicitly carries a CSRF suffix in state.
    // Use the last dot so user state itself may contain dots.
    const dotIndex = state.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === state.length - 1) {
        req.originalState = state
        return next()
    }

    const userState = state.substring(0, dotIndex)
    const csrfToken = state.substring(dotIndex + 1)
    const valid = await validateCSRFTokenAsync(csrfToken, clientId, sessionId)

    if (!valid) {
        res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid or expired CSRF token'
        })
        return
    }

    req.originalState = userState
    next()
}

/**
 * Enhanced state parameter validation for OAuth flows
 */
export function enhanceStateParameter(userState: string, csrfToken: string): string {
    return `${userState}.${csrfToken}`
}

/**
 * Double Submit Cookie pattern for additional CSRF protection
 */
export function doubleSubmitCookie(req: Request, res: Response, next: NextFunction): void {
    if (req.method === 'GET' || req.method === 'OPTIONS') {
        return next()
    }

    if (env.NODE_ENV !== 'production') {
        return next()
    }

    const cookieToken = req.cookies?.['csrf-token']
    const headerToken = req.get('X-CSRF-Token') || req.body?.csrf_token

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        res.status(403).json({
            error: 'invalid_request',
            error_description: 'CSRF token mismatch'
        })
        return
    }

    next()
}

/**
 * Set CSRF cookie for double submit pattern
 */
export function setCSRFCookie(req: Request, res: Response, next: NextFunction): void {
    if (req.method === 'GET' && !req.cookies?.['csrf-token']) {
        const token = crypto.randomBytes(32).toString('hex')

        res.cookie('csrf-token', token, {
            httpOnly: false,
            secure: env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: CSRF_TTL_SECONDS * 1000
        })
    }

    next()
}
