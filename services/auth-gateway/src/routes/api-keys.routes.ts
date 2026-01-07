import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  createApiKey,
  listApiKeys,
  getApiKey,
  rotateApiKey,
  revokeApiKey,
  deleteApiKey,
  updateApiKeyScopes,
} from '../services/api-key.service.js'

const router = Router()

/**
 * API Keys Routes - User-level API key management
 * Endpoint: /api/v1/auth/api-keys
 *
 * These routes allow users to manage their own API keys
 * for programmatic access to Lanonasis services.
 */

/**
 * GET /api/v1/auth/api-keys
 * List all API keys for the authenticated user
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const activeOnly = req.query.active_only !== 'false'
    const keys = await listApiKeys(req.user.sub, { active_only: activeOnly })

    return res.json({
      success: true,
      data: keys,
    })
  } catch (error) {
    console.error('List API keys error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list API keys',
      code: 'LIST_KEYS_ERROR',
    })
  }
})

/**
 * POST /api/v1/auth/api-keys
 * Create a new API key for the authenticated user
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const { name, access_level, expires_in_days, scopes } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'API key name is required',
        code: 'INVALID_REQUEST',
      })
    }

    const apiKey = await createApiKey(req.user.sub, {
      name: name.trim(),
      access_level,
      expires_in_days,
      scopes,
    })

    return res.status(201).json({
      success: true,
      data: apiKey,
      message: 'API key created successfully. Save the key value - it will not be shown again.',
    })
  } catch (error) {
    console.error('Create API key error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create API key'

    // Check for specific error types
    if (message.includes('already exists')) {
      return res.status(409).json({
        error: message,
        code: 'KEY_EXISTS',
      })
    }

    if (message.includes('Invalid')) {
      return res.status(400).json({
        error: message,
        code: 'INVALID_REQUEST',
      })
    }

    return res.status(500).json({
      error: message,
      code: 'CREATE_KEY_ERROR',
    })
  }
})

/**
 * GET /api/v1/auth/api-keys/:keyId
 * Get a specific API key by ID
 */
router.get('/:keyId', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const apiKey = await getApiKey(req.params.keyId, req.user.sub)

    return res.json({
      success: true,
      data: apiKey,
    })
  } catch (error) {
    console.error('Get API key error:', error)
    const message = error instanceof Error ? error.message : 'Failed to get API key'

    if (message.includes('not found')) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'KEY_NOT_FOUND',
      })
    }

    return res.status(500).json({
      error: message,
      code: 'GET_KEY_ERROR',
    })
  }
})

/**
 * PUT /api/v1/auth/api-keys/:keyId
 * Update an API key's scopes/permissions
 */
router.put('/:keyId', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const { scopes } = req.body

    if (!scopes || !Array.isArray(scopes)) {
      return res.status(400).json({
        error: 'Scopes array is required',
        code: 'INVALID_REQUEST',
      })
    }

    const apiKey = await updateApiKeyScopes(req.params.keyId, req.user.sub, scopes)

    return res.json({
      success: true,
      data: apiKey,
    })
  } catch (error) {
    console.error('Update API key error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update API key'

    if (message.includes('not found')) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'KEY_NOT_FOUND',
      })
    }

    return res.status(500).json({
      error: message,
      code: 'UPDATE_KEY_ERROR',
    })
  }
})

/**
 * POST /api/v1/auth/api-keys/:keyId/rotate
 * Rotate an API key (generate new key value, keep same ID)
 */
router.post('/:keyId/rotate', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const apiKey = await rotateApiKey(req.params.keyId, req.user.sub)

    return res.json({
      success: true,
      data: apiKey,
      message: 'API key rotated successfully. Save the new key value - it will not be shown again.',
    })
  } catch (error) {
    console.error('Rotate API key error:', error)
    const message = error instanceof Error ? error.message : 'Failed to rotate API key'

    if (message.includes('not found')) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'KEY_NOT_FOUND',
      })
    }

    return res.status(500).json({
      error: message,
      code: 'ROTATE_KEY_ERROR',
    })
  }
})

/**
 * POST /api/v1/auth/api-keys/:keyId/revoke
 * Revoke an API key (soft delete - can be re-enabled)
 */
router.post('/:keyId/revoke', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    await revokeApiKey(req.params.keyId, req.user.sub)

    return res.json({
      success: true,
      message: 'API key revoked successfully',
    })
  } catch (error) {
    console.error('Revoke API key error:', error)
    const message = error instanceof Error ? error.message : 'Failed to revoke API key'

    if (message.includes('not found')) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'KEY_NOT_FOUND',
      })
    }

    return res.status(500).json({
      error: message,
      code: 'REVOKE_KEY_ERROR',
    })
  }
})

/**
 * DELETE /api/v1/auth/api-keys/:keyId
 * Delete an API key (hard delete - permanent)
 */
router.delete('/:keyId', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    await deleteApiKey(req.params.keyId, req.user.sub)

    return res.json({
      success: true,
      message: 'API key deleted successfully',
    })
  } catch (error) {
    console.error('Delete API key error:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete API key'

    if (message.includes('not found')) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'KEY_NOT_FOUND',
      })
    }

    return res.status(500).json({
      error: message,
      code: 'DELETE_KEY_ERROR',
    })
  }
})

export default router
