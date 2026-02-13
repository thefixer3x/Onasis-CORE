import type { Request, Response } from 'express'
import {
  ProjectServiceError,
  createProject,
  deleteProject,
  getProjectById,
  listProjectKeys,
  listProjectsForUser,
  updateProject,
} from '../services/projects.service.js'

// Helper to extract string param
const getStringParam = (param: string | string[]): string => {
  return typeof param === 'string' ? param : param[0] || ''
}

export async function listProjects(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const projects = await listProjectsForUser(req.user.sub, req.user.role)
    return res.json(projects)
  } catch (error) {
    return handleProjectError(res, error)
  }
}

export async function getProject(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const project = await getProjectById(getStringParam(req.params.projectId), req.user.sub, req.user.role)
    return res.json(project)
  } catch (error) {
    return handleProjectError(res, error)
  }
}

export async function createProjectHandler(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const project = await createProject(req.user.sub, {
      name: req.body?.name,
      description: req.body?.description,
      organizationId: req.body?.organizationId,
      teamMembers: req.body?.teamMembers,
      settings: req.body?.settings,
    })

    return res.status(201).json(project)
  } catch (error) {
    return handleProjectError(res, error)
  }
}

export async function updateProjectHandler(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const project = await updateProject(getStringParam(req.params.projectId), req.user.sub, req.user.role, {
      name: req.body?.name,
      description: req.body?.description,
      teamMembers: req.body?.teamMembers,
      settings: req.body?.settings,
    })

    return res.json(project)
  } catch (error) {
    return handleProjectError(res, error)
  }
}

export async function deleteProjectHandler(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    await deleteProject(getStringParam(req.params.projectId), req.user.sub, req.user.role)
    return res.json({ success: true })
  } catch (error) {
    return handleProjectError(res, error)
  }
}

export async function listProjectApiKeys(req: Request, res: Response) {
  if (!req.user?.sub) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
  }

  try {
    const keys = await listProjectKeys(getStringParam(req.params.projectId), req.user.sub, req.user.role)
    return res.json(keys)
  } catch (error) {
    return handleProjectError(res, error)
  }
}

function handleProjectError(res: Response, error: unknown) {
  if (error instanceof ProjectServiceError) {
    if (error.statusCode >= 500) {
      console.error('Project service error:', error)
    }
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    })
  }

  console.error('Unexpected project controller error:', error)
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  })
}
