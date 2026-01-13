import express from 'express'
import * as authController from '../controllers/auth.controller.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Public routes
router.get('/oauth', authController.oauthProvider)
router.get('/oauth/callback', authController.oauthCallback)
router.post('/login', authController.login)
router.post('/magic-link', authController.requestMagicLink)
router.get('/magic-link/callback', authController.magicLinkCallback)
router.post('/magic-link/exchange', authController.magicLinkExchange)

// Token exchange endpoint - bridges Supabase auth to auth-gateway tokens
router.post('/token/exchange', authController.exchangeSupabaseToken)

// Protected routes
router.post('/logout', requireAuth, authController.logout)
router.get('/session', requireAuth, authController.getSession)
router.get('/me', requireAuth, authController.getMe)  // Full user profile with OAuth metadata
router.post('/verify', requireAuth, authController.verifyToken)
router.get('/sessions', requireAuth, authController.listSessions)

// Public CLI-friendly verify endpoint (no auth header required)
router.post('/verify-token', authController.verifyTokenBody)

// API Key verification endpoint (public, no auth required)
router.post('/verify-api-key', authController.verifyAPIKey)

export default router
