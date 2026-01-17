/**
 * Service Router Configuration
 * Maps service names to Supabase edge function paths
 * Ported from unified-router.cjs with TypeScript types
 */

import type { ServiceRegistry, RateLimitConfig, RateLimitTier } from '../src/types/router.types.js'

// Router version
export const ROUTER_VERSION = '1.0.0'

// Rate limit configurations by tier
export const RATE_LIMITS: Record<RateLimitTier, RateLimitConfig> = {
  general: {
    windowMs: 60 * 1000, // 1 minute
    max: 500,
    message: 'General API rate limit exceeded',
  },
  ai: {
    windowMs: 60 * 1000,
    max: 100,
    message: 'AI API rate limit exceeded',
  },
  media: {
    windowMs: 60 * 1000,
    max: 50,
    message: 'Media processing rate limit exceeded',
  },
  webhook: {
    windowMs: 60 * 1000,
    max: 200,
    message: 'Webhook rate limit exceeded',
  },
}

/**
 * Service Registry
 * Maps service names to Supabase edge function configurations
 * 
 * Add new services here as you create Supabase edge functions
 */
export const SERVICE_ROUTES: ServiceRegistry = {
  // ═══════════════════════════════════════════════════════════════════════════
  // AI SERVICES
  // ═══════════════════════════════════════════════════════════════════════════
  'ai-chat': {
    path: '/functions/v1/ai-chat',
    rateLimitTier: 'ai',
    description: 'Multi-model AI conversation with privacy protection',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 60000,
    scopes: ['ai:chat', 'ai:*'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════
  'text-to-speech': {
    path: '/functions/v1/elevenlabs-tts',
    rateLimitTier: 'media',
    description: 'Privacy-protected text-to-speech conversion',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 30000,
    scopes: ['media:tts', 'media:*'],
  },

  'speech-to-text': {
    path: '/functions/v1/elevenlabs-stt',
    rateLimitTier: 'media',
    description: 'Privacy-protected speech-to-text transcription',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 60000,
    scopes: ['media:stt', 'media:*'],
  },

  'transcribe': {
    path: '/functions/v1/whisper-transcribe',
    rateLimitTier: 'media',
    description: 'Advanced speech transcription with privacy',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 120000,
    scopes: ['media:transcribe', 'media:*'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════
  'extract-tags': {
    path: '/functions/v1/extract-tags',
    rateLimitTier: 'general',
    description: 'AI-powered content tag extraction',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 30000,
    scopes: ['content:tags', 'content:*'],
  },

  'generate-summary': {
    path: '/functions/v1/generate-summary',
    rateLimitTier: 'general',
    description: 'Intelligent content summarization',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 30000,
    scopes: ['content:summary', 'content:*'],
  },

  'generate-embedding': {
    path: '/functions/v1/generate-embedding',
    rateLimitTier: 'general',
    description: 'Vector embedding generation for semantic search',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 15000,
    scopes: ['content:embedding', 'content:*', 'memories:*'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY / MaaS SERVICES
  // ═══════════════════════════════════════════════════════════════════════════
  'memories': {
    path: '/functions/v1/memories',
    rateLimitTier: 'general',
    description: 'Memory CRUD operations',
    requiresAuth: true,
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    timeout: 30000,
    scopes: ['memories:read', 'memories:write', 'memories:*'],
  },

  'memories-search': {
    path: '/functions/v1/memories-search',
    rateLimitTier: 'general',
    description: 'Semantic memory search',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 15000,
    scopes: ['memories:read', 'memories:*'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════
  'mcp-handler': {
    path: '/functions/v1/mcp-handler',
    rateLimitTier: 'general',
    description: 'Model Context Protocol tool integration hub',
    requiresAuth: true,
    allowedMethods: ['POST'],
    timeout: 60000,
    scopes: ['mcp:connect', 'mcp:*'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBHOOKS (typically less restrictive auth)
  // ═══════════════════════════════════════════════════════════════════════════
  'webhook-handler': {
    path: '/functions/v1/webhook-handler',
    rateLimitTier: 'webhook',
    description: 'Generic webhook processing endpoint',
    requiresAuth: false, // Webhooks often use signatures instead
    allowedMethods: ['POST'],
    timeout: 30000,
  },
}

/**
 * Get service configuration by name
 */
export function getServiceConfig(serviceName: string) {
  return SERVICE_ROUTES[serviceName] || null
}

/**
 * Get all service names
 */
export function getServiceNames(): string[] {
  return Object.keys(SERVICE_ROUTES)
}

/**
 * Check if a service exists
 */
export function serviceExists(serviceName: string): boolean {
  return serviceName in SERVICE_ROUTES
}

/**
 * Get rate limit config for a tier
 */
export function getRateLimitConfig(tier: RateLimitTier): RateLimitConfig {
  return RATE_LIMITS[tier]
}
