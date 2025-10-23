import express from 'express'
import * as mcpController from '../controllers/mcp.controller.js'

const router = express.Router()

// CLI authentication
router.post('/cli-login', mcpController.cliLogin)

export default router
