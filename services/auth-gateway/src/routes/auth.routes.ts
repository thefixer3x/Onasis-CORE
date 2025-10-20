import express from 'express'
import * as authController from '../controllers/auth.controller'
import { requireAuth, optionalAuth } from '../middleware/auth'

const router = express.Router()

// Public routes
router.post('/login', authController.login)

// Protected routes
router.post('/logout', requireAuth, authController.logout)
router.get('/session', requireAuth, authController.getSession)
router.post('/verify', requireAuth, authController.verifyToken)
router.get('/sessions', requireAuth, authController.listSessions)

export default router
