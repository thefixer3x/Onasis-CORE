import express from 'express'
import * as oauthController from '../controllers/oauth.controller.js'
import { requireSessionCookie } from '../middleware/session.js'

const router = express.Router()

router.get('/authorize', requireSessionCookie, oauthController.authorize)
router.post('/token', oauthController.token)
router.post('/revoke', oauthController.revoke)
router.post('/introspect', oauthController.introspect)

export default router
