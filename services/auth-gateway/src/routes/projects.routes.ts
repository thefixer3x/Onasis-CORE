import express from 'express'
import {
  createProjectHandler,
  deleteProjectHandler,
  getProject,
  listProjects,
  updateProjectHandler,
} from '../controllers/projects.controller.js'
import {
  createStoredKeyHandler,
  deleteStoredKeyHandler,
  getStoredKey,
  listProjectStoredKeys,
  updateStoredKeyHandler,
} from '../controllers/stored-keys.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

// Project CRUD routes
router.get('/', requireAuth, listProjects)
router.post('/', requireAuth, createProjectHandler)
router.get('/:projectId', requireAuth, getProject)
router.put('/:projectId', requireAuth, updateProjectHandler)
router.delete('/:projectId', requireAuth, deleteProjectHandler)

// Stored API Keys CRUD routes (nested under project)
router.get('/:projectId/api-keys', requireAuth, listProjectStoredKeys)
router.post('/:projectId/api-keys', requireAuth, createStoredKeyHandler)
router.get('/:projectId/api-keys/:keyId', requireAuth, getStoredKey)
router.patch('/:projectId/api-keys/:keyId', requireAuth, updateStoredKeyHandler)
router.delete('/:projectId/api-keys/:keyId', requireAuth, deleteStoredKeyHandler)

export default router
