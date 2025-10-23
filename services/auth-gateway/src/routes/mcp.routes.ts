import express from 'express'
import * as mcpController from '../controllers/mcp.controller.js'

const router = express.Router()

// MCP authentication
router.post('/auth', mcpController.mcpAuth)
router.get('/health', mcpController.mcpHealth)

export default router
