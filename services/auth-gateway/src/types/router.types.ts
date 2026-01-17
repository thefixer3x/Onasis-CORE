/**
 * Service Router Types
 * Types for the unified service routing system (ported from unified-router.cjs)
 */

import type { Request } from 'express'
import type { JWTPayload } from '../utils/jwt.js'

// Rate limit tiers
export type RateLimitTier = 'general' | 'ai' | 'media' | 'webhook'

// Service configuration
export interface ServiceConfig {
  /** Path to Supabase edge function (e.g., '/functions/v1/ai-chat') */
  path: string
  /** Rate limit tier to apply */
  rateLimitTier: RateLimitTier
  /** Human-readable description */
  description: string
  /** Whether authentication is required */
  requiresAuth: boolean
  /** Allowed HTTP methods */
  allowedMethods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[]
  /** Request timeout in ms (default: 60000) */
  timeout?: number
  /** Required OAuth scopes (if auth required) */
  scopes?: string[]
}

// Service registry type
export type ServiceRegistry = Record<string, ServiceConfig>

// Extended request with router metadata
export interface RouterRequest extends Request {
  user?: JWTPayload
  scopes?: string[]
  /** Anonymous request ID for tracking */
  anonymousId?: string
  /** Request timestamp */
  timestamp?: number
  /** Anonymous client fingerprint */
  clientFingerprint?: string
  /** Target service name */
  serviceName?: string
  /** Router metadata attached during processing */
  routerMetadata?: {
    service: string
    startTime: number
    authenticated: boolean
    userId?: string
    projectScope?: string
  }
}

// Supabase routing result
export interface SupabaseRoutingResult<T = unknown> {
  data: T
  onasis_metadata: {
    service: string
    response_time: number
    request_id: string
    routed_via: 'supabase'
    privacy_level: 'high'
    vendor_masked: boolean
    pii_removed: boolean
  }
}

// Service discovery response
export interface ServiceDiscoveryResponse {
  available_services: Array<{
    name: string
    endpoint: string
    description: string
    methods: string[]
    requires_auth: boolean
    scopes?: string[]
  }>
  total_count: number
  base_url: string
  documentation: string
  version: string
}

// Router health response (extends gateway health)
export interface RouterHealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy'
  service: string
  database: {
    healthy: boolean
    latency_ms?: number
  }
  cache: {
    healthy: boolean
  }
  router: {
    enabled: boolean
    supabase_url: string
    available_services: string[]
    privacy_level: 'high'
  }
  outbox: {
    pending: number
    failed: number
  }
  timestamp: string
}

// Router error response
export interface RouterErrorResponse {
  error: {
    message: string
    type: string
    code: string
  }
  service?: string
  request_id?: string
  available_services?: string[]
}

// Rate limit configuration
export interface RateLimitConfig {
  windowMs: number
  max: number
  message: string
}

// PII fields to strip from requests
export const PII_FIELDS = [
  'user_id',
  'email',
  'ip_address',
  'session_id',
  'phone',
  'address',
  'name',
  'firstname',
  'lastname',
  'ssn',
  'credit_card',
  'passport',
  'date_of_birth',
  'social_security',
] as const

export type PIIField = (typeof PII_FIELDS)[number]
