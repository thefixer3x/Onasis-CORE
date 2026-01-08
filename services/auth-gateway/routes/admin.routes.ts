import express from 'express'
import * as adminController from '../controllers/admin.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

// Public admin bypass login (emergency access)
router.post('/bypass-login', adminController.adminBypassLogin)

// Protected admin routes
router.post('/change-password', requireAuth, adminController.changeAdminPassword)
router.get('/status', requireAuth, adminController.getAdminStatus)
router.post('/register-app', requireAuth, adminController.registerApp)
router.get('/list-apps', requireAuth, adminController.listApps)

export default router
