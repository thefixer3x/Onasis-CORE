import express from 'express'
import {
  createProjectHandler,
  deleteProjectHandler,
  getProject,
  listProjectApiKeys,
  listProjects,
  updateProjectHandler,
} from '../controllers/projects.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.get('/', requireAuth, listProjects)
router.post('/', requireAuth, createProjectHandler)
router.get('/:projectId/api-keys', requireAuth, listProjectApiKeys)
router.get('/:projectId', requireAuth, getProject)
router.put('/:projectId', requireAuth, updateProjectHandler)
router.delete('/:projectId', requireAuth, deleteProjectHandler)

export default router
