/**
 * LanOnasis Security Service
 * Enterprise-grade security for secrets, API keys, and access control
 */

// Services
export { SecretService } from './services/secretService.js';
export { ApiKeyService, apiKeyService } from './services/apiKeyService.js';

// Middleware
export { authMiddleware, requireRole, requirePlan } from './middleware/auth.js';

// Types
export type { UnifiedUser } from './middleware/auth.js';
export type { JWTPayload } from './types/auth.js';
export type {
  ApiKey,
  ApiKeyProject,
  MCPTool,
  MCPSession
} from './services/apiKeyService.js';

// Re-export for convenience
export * from './services/secretService.js';
export * from './services/apiKeyService.js';
