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
      /**
       * Request correlation ID. Set by the requestCorrelation middleware
       * (utils/correlation.ts) or generated lazily by requireAuth/resolve routes.
       * Propagated as X-Request-ID response header for downstream tracing.
       */
      requestId?: string
    }
  }
}

export {}
