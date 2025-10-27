import express from 'express'
import * as authController from '../controllers/auth.controller.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Public routes
router.post('/login', authController.login)

// Protected routes
router.post('/logout', requireAuth, authController.logout)
router.get('/session', requireAuth, authController.getSession)
router.post('/verify', requireAuth, authController.verifyToken)
router.get('/sessions', requireAuth, authController.listSessions)

// Public CLI-friendly verify endpoint (no auth header required)
router.post('/verify-token', authController.verifyTokenBody)

export default router
