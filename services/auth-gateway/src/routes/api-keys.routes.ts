import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// API Keys routes - managed via admin routes or CLI
// This is a placeholder for direct API key management endpoints

router.get('/', requireAuth, async (req, res) => {
  res.json({ message: 'API keys are managed via /admin/api-keys or CLI' })
})

export default router
