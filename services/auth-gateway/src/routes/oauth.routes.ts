import express from 'express'
import * as oauthController from '../controllers/oauth.controller.js'
import { validateSessionCookie } from '../middleware/session.js'
import {
    authorizeRateLimit,
    tokenRateLimit,
    revokeRateLimit,
    introspectRateLimit,
    oauthGeneralRateLimit
} from '../middleware/rate-limit.js'
import { oauthCors, oauthSecurityHeaders, validateReferer } from '../middleware/cors.js'
import {
    generateAuthorizeCSRF,
    validateTokenCSRF,
    setCSRFCookie,
    doubleSubmitCookie
} from '../middleware/csrf.js'

const router = express.Router()

// Apply OAuth-specific CORS and security headers to all routes
router.use(oauthCors)
router.use(oauthSecurityHeaders)
router.use(validateReferer)

// Apply general OAuth rate limiting to all routes
router.use(oauthGeneralRateLimit)

// Set CSRF cookie for all OAuth interactions
router.use(setCSRFCookie)

// OAuth endpoints with specific rate limits and CSRF protection
router.get('/authorize', authorizeRateLimit, generateAuthorizeCSRF, requireSessionCookie, oauthController.authorize)
router.post('/token', tokenRateLimit, validateTokenCSRF, oauthController.token)
router.post('/revoke', revokeRateLimit, doubleSubmitCookie, oauthController.revoke)
router.post('/introspect', introspectRateLimit, oauthController.introspect)

export default router
