import express from 'express'
import * as authController from '../controllers/auth.controller.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Public routes
router.get('/oauth', authController.oauthProvider)
router.get('/oauth/callback', authController.oauthCallback)
router.post('/login', authController.login)

// Token exchange endpoint - bridges Supabase auth to auth-gateway tokens
router.post('/token/exchange', authController.exchangeSupabaseToken)

// Protected routes
router.post('/logout', requireAuth, authController.logout)
router.get('/session', requireAuth, authController.getSession)
router.post('/verify', requireAuth, authController.verifyToken)
router.get('/sessions', requireAuth, authController.listSessions)

// Public CLI-friendly verify endpoint (no auth header required)
router.post('/verify-token', authController.verifyTokenBody)

// API Key verification endpoint (public, no auth required)
router.post('/verify-api-key', authController.verifyAPIKey)

export default router
