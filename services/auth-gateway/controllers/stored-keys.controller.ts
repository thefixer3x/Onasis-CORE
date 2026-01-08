import type { Request, Response } from 'express'
import {
  StoredKeyServiceError,
  createStoredKey,
  deleteStoredKey,
  getStoredKeyById,
  listStoredKeysForProject,
  updateStoredKey,
} from '../services/stored-keys.service.js'

/**
 * List all stored API keys for a project
 * GET /api/v1/projects/:projectId/api-keys
 */
export async function listProjectStoredKeys(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const keys = await listStoredKeysForProject(req.params.projectId, req.user.sub, req.user.role)
    return res.json(keys)
  } catch (error) {
    return handleStoredKeyError(res, error)
  }
}

/**
 * Get a specific stored API key
 * GET /api/v1/projects/:projectId/api-keys/:keyId
 */
export async function getStoredKey(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const key = await getStoredKeyById(
      req.params.projectId,
      req.params.keyId,
      req.user.sub,
      req.user.role
    )
    return res.json(key)
  } catch (error) {
    return handleStoredKeyError(res, error)
  }
}

/**
 * Create a new stored API key
 * POST /api/v1/projects/:projectId/api-keys
 */
export async function createStoredKeyHandler(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const key = await createStoredKey(req.params.projectId, req.user.sub, req.user.role, {
      name: req.body?.name,
      encryptedValue: req.body?.encryptedValue,
      keyType: req.body?.keyType,
      environment: req.body?.environment,
      accessLevel: req.body?.accessLevel,
      tags: req.body?.tags,
      rotationFrequency: req.body?.rotationFrequency,
      expiresAt: req.body?.expiresAt,
      metadata: req.body?.metadata,
    })

    return res.status(201).json(key)
  } catch (error) {
    return handleStoredKeyError(res, error)
  }
}

/**
 * Update an existing stored API key
 * PATCH /api/v1/projects/:projectId/api-keys/:keyId
 */
export async function updateStoredKeyHandler(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const key = await updateStoredKey(
      req.params.projectId,
      req.params.keyId,
      req.user.sub,
      req.user.role,
      {
        name: req.body?.name,
        encryptedValue: req.body?.encryptedValue,
        keyType: req.body?.keyType,
        environment: req.body?.environment,
        accessLevel: req.body?.accessLevel,
        status: req.body?.status,
        tags: req.body?.tags,
        rotationFrequency: req.body?.rotationFrequency,
        expiresAt: req.body?.expiresAt,
        metadata: req.body?.metadata,
      }
    )

    return res.json(key)
  } catch (error) {
    return handleStoredKeyError(res, error)
  }
}

/**
 * Delete a stored API key
 * DELETE /api/v1/projects/:projectId/api-keys/:keyId
 */
export async function deleteStoredKeyHandler(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    await deleteStoredKey(req.params.projectId, req.params.keyId, req.user.sub, req.user.role)
    return res.json({ success: true })
  } catch (error) {
    return handleStoredKeyError(res, error)
  }
}

function handleStoredKeyError(res: Response, error: unknown) {
  if (error instanceof StoredKeyServiceError) {
    if (error.statusCode >= 500) {
      console.error('Stored key service error:', error)
    }
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    })
  }

  console.error('Unexpected stored key controller error:', error)
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  })
}
