import type { UnifiedUser } from '../middleware/auth.js'
import type { UAIContext } from '../middleware/uai-router.middleware.js'

declare global {
  namespace Express {
    interface Request {
      user?: UnifiedUser
      scopes?: string[]
      csrfToken?: string
      originalState?: string
      uai?: UAIContext
    }
  }
}

export {}
