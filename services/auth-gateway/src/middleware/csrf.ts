import { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { env } from '../../config/env.js'

interface CSRFStore {
    [token: string]: {
        created: number
        clientId?: string
        sessionId?: string
    }
}

// In-memory CSRF token store (production should use Redis)
const csrfStore: CSRFStore = {}

// Cleanup old tokens periodically
setInterval(() => {
    const now = Date.now()
    const maxAge = 15 * 60 * 1000 // 15 minutes

    for (const token in csrfStore) {
        if (now - csrfStore[token].created > maxAge) {
            delete csrfStore[token]
        }
    }
}, 60000) // Cleanup every minute

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(clientId?: string, sessionId?: string): string {
    const token = crypto.randomBytes(32).toString('hex')

    csrfStore[token] = {
        created: Date.now(),
        clientId,
        sessionId
    }

    return token
}

/**
 * Validate a CSRF token
 */
export function validateCSRFToken(
    token: string,
    clientId?: string,
    sessionId?: string
): boolean {
    const storedData = csrfStore[token]

    if (!storedData) {
        return false
    }

    // Check if token is expired (15 minutes max age)
    const maxAge = 15 * 60 * 1000
    if (Date.now() - storedData.created > maxAge) {
        delete csrfStore[token]
        return false
    }

    // Validate client and session if provided
    if (clientId && storedData.clientId && storedData.clientId !== clientId) {
        return false
    }

    if (sessionId && storedData.sessionId && storedData.sessionId !== sessionId) {
        return false
    }

    // Token is valid, remove it (one-time use)
    delete csrfStore[token]
    return true
}

/**
 * CSRF protection middleware for OAuth authorize endpoint
 * Generates CSRF token and stores it in authorization request
 */
export function generateAuthorizeCSRF(req: Request, res: Response, next: NextFunction): void {
    // Only apply to authorization requests that will redirect
    if (req.method !== 'GET' || !req.query.response_type) {
        return next()
    }

    const clientId = req.query.client_id as string
    const sessionId = req.cookies?.session_id

    // Generate CSRF token
    const csrfToken = generateCSRFToken(clientId, sessionId)

    // Store in request for use by controller
    req.csrfToken = csrfToken

    next()
}

/**
 * CSRF protection middleware for OAuth token endpoint
 * Validates CSRF token from state parameter
 */
export function validateTokenCSRF(req: Request, res: Response, next: NextFunction): void {
    // Only validate for authorization_code grant type
    if (req.body?.grant_type !== 'authorization_code') {
        return next()
    }

    const state = req.body.state
    const clientId = req.body.client_id
    const sessionId = req.cookies?.session_id

    // Extract CSRF token from state (assuming format: "userState.csrfToken")
    if (!state || typeof state !== 'string') {
        res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing or invalid state parameter'
        })
        return
    }

    const parts = state.split('.')
    if (parts.length !== 2) {
        res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid state parameter format'
        })
        return
    }

    const [userState, csrfToken] = parts

    // Validate CSRF token
    if (!validateCSRFToken(csrfToken, clientId, sessionId)) {
        res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid or expired CSRF token'
        })
        return
    }

    // Store original user state for controller
    req.originalState = userState

    next()
}

/**
 * Enhanced state parameter validation for OAuth flows
 * Combines user state with CSRF protection
 */
export function enhanceStateParameter(userState: string, csrfToken: string): string {
    // Combine user state with CSRF token
    return `${userState}.${csrfToken}`
}

/**
 * Double Submit Cookie pattern for additional CSRF protection
 */
export function doubleSubmitCookie(req: Request, res: Response, next: NextFunction): void {
    // Skip for GET requests
    if (req.method === 'GET' || req.method === 'OPTIONS') {
        return next()
    }

    // Only apply in production for sensitive endpoints
    if (env.NODE_ENV !== 'production') {
        return next()
    }

    const cookieToken = req.cookies?.['csrf-token']
    const headerToken = req.get('X-CSRF-Token') || req.body?.csrf_token

    // Both tokens must be present and match
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
            httpOnly: false, // Accessible to JavaScript for header
            secure: env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000 // 15 minutes
        })
    }

    next()
}

// Extend Express Request interface
declare module 'express-serve-static-core' {
    interface Request {
        csrfToken?: string
        originalState?: string
    }
}