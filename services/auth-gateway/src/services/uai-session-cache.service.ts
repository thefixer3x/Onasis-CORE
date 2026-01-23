/**
 * UAI Session Cache Service
 *
 * Caches resolved UAIs to avoid database lookups on every request.
 *
 * Cache Hierarchy (in order of preference):
 * 1. Redis (if configured) - fastest, ~1ms
 * 2. Postgres (fallback) - persistent, shared across instances, ~5-20ms
 * 3. In-memory (last resort) - development only, lost on restart
 *
 * Flow:
 * 1. User authenticates with any method (JWT, API key, session cookie)
 * 2. First request: Resolve UAI from auth DB, cache it
 * 3. Subsequent requests: Return cached UAI (no auth DB hit)
 * 4. Cache expires after TTL: Re-resolve on next request
 *
 * Cache key patterns:
 * - JWT: `uai:supabase_jwt:{user_id}`
 * - API Key: `uai:api_key:{key_hash_prefix}`
 * - Session: `uai:sso_session:{session_id}`
 */

import { createClient, type RedisClientType } from 'redis'
import { Pool } from 'pg'
import { getIdentityService, type AuthMethod, type ResolvedIdentity } from './identity-resolution.service.js'

// Cache configuration
const UAI_CACHE_TTL = 300 // 5 minutes (short-lived as requested)
const UAI_CACHE_PREFIX = 'uai:'

// Cache layer types
type CacheLayer = 'redis' | 'postgres' | 'memory'

export interface CachedUAISession {
  authId: string           // The canonical UAI
  organizationId: string | null
  email: string | null
  authMethod: string
  credentialId: string
  resolvedAt: number       // Unix timestamp
  expiresAt: number        // Unix timestamp
}

export interface UAIResolutionResult {
  authId: string
  organizationId: string | null
  email: string | null
  authMethod: string
  credentialId: string
  fromCache: boolean       // True if returned from cache
  cacheLayer?: CacheLayer  // Which cache layer served this result
}

/**
 * UAI Session Cache Service
 *
 * Provides fast UAI resolution with tiered caching:
 * 1. Redis (primary) - fastest, if configured
 * 2. Postgres (secondary) - persistent, shared across instances
 * 3. Memory (fallback) - development/single instance only
 */
export class UAISessionCacheService {
  private redis: RedisClientType | null = null
  private pgPool: Pool | null = null
  private memoryCache: Map<string, CachedUAISession> = new Map()
  private readonly ttlSeconds: number
  private activeLayers: CacheLayer[] = []

  constructor(
    redisUrl?: string,
    postgresUrl?: string,
    ttlSeconds: number = UAI_CACHE_TTL
  ) {
    this.ttlSeconds = ttlSeconds

    // Initialize cache layers in order of preference
    this.initializeCacheLayers(redisUrl, postgresUrl)
  }

  private async initializeCacheLayers(redisUrl?: string, postgresUrl?: string): Promise<void> {
    // Layer 1: Redis (fastest)
    if (redisUrl) {
      await this.initRedis(redisUrl)
    }

    // Layer 2: Postgres (persistent fallback)
    if (postgresUrl) {
      await this.initPostgres(postgresUrl)
    }

    // Layer 3: Memory (always available as last resort)
    this.activeLayers.push('memory')

    console.log(`UAI Session Cache: Active layers: [${this.activeLayers.join(' → ')}]`)
  }

  private async initRedis(redisUrl: string): Promise<void> {
    try {
      this.redis = createClient({ url: redisUrl })
      this.redis.on('error', (err: Error) => {
        console.error('Redis error:', err)
        // Don't null out redis - let it reconnect
      })
      await this.redis.connect()
      this.activeLayers.push('redis')
      console.log('UAI Session Cache: Redis connected (primary)')
    } catch (error) {
      console.warn('UAI Session Cache: Redis connection failed', error)
      this.redis = null
    }
  }

  private async initPostgres(postgresUrl: string): Promise<void> {
    try {
      this.pgPool = new Pool({
        connectionString: postgresUrl,
        max: 5, // Small pool for cache operations
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      })

      // Verify connection and ensure cache table exists
      const client = await this.pgPool.connect()
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS auth_gateway.uai_session_cache (
            cache_key VARCHAR(255) PRIMARY KEY,
            auth_id UUID NOT NULL,
            organization_id UUID,
            email VARCHAR(255),
            auth_method VARCHAR(50) NOT NULL,
            credential_id UUID NOT NULL,
            resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)

        // Index for TTL cleanup
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_uai_cache_expires
          ON auth_gateway.uai_session_cache(expires_at)
        `)

        this.activeLayers.push('postgres')
        console.log('UAI Session Cache: Postgres connected (secondary)')
      } finally {
        client.release()
      }
    } catch (error) {
      console.warn('UAI Session Cache: Postgres init failed', error)
      this.pgPool = null
    }
  }

  /**
   * Build cache key from auth method and identifier
   */
  private buildCacheKey(method: AuthMethod, identifier: string): string {
    // For API keys, use first 16 chars of hash to avoid storing full key
    const safeIdentifier = method === 'api_key'
      ? identifier.slice(0, 16)
      : identifier

    return `${UAI_CACHE_PREFIX}${method}:${safeIdentifier}`
  }

  /**
   * Get cached UAI session (tries each layer in order)
   * Returns the session and which layer it came from
   */
  private async getFromCache(key: string): Promise<{ session: CachedUAISession; layer: CacheLayer } | null> {
    const now = Date.now()

    // Layer 1: Try Redis first (fastest)
    if (this.redis) {
      try {
        const cached = await this.redis.get(key)
        if (cached) {
          const session = JSON.parse(cached) as CachedUAISession
          if (session.expiresAt > now) {
            return { session, layer: 'redis' }
          }
        }
      } catch (error) {
        console.warn('Redis cache get error:', error)
      }
    }

    // Layer 2: Try Postgres (persistent)
    if (this.pgPool) {
      try {
        const result = await this.pgPool.query<{
          auth_id: string
          organization_id: string | null
          email: string | null
          auth_method: string
          credential_id: string
          resolved_at: Date
          expires_at: Date
        }>(`
          SELECT auth_id, organization_id, email, auth_method, credential_id, resolved_at, expires_at
          FROM auth_gateway.uai_session_cache
          WHERE cache_key = $1 AND expires_at > NOW()
        `, [key])

        if (result.rows.length > 0) {
          const row = result.rows[0]
          const session: CachedUAISession = {
            authId: row.auth_id,
            organizationId: row.organization_id,
            email: row.email,
            authMethod: row.auth_method,
            credentialId: row.credential_id,
            resolvedAt: row.resolved_at.getTime(),
            expiresAt: row.expires_at.getTime(),
          }

          // Promote to Redis if available (cache warming)
          if (this.redis) {
            const remainingTtl = Math.floor((session.expiresAt - now) / 1000)
            if (remainingTtl > 0) {
              this.redis.set(key, JSON.stringify(session), { EX: remainingTtl }).catch(() => {})
            }
          }

          return { session, layer: 'postgres' }
        }
      } catch (error) {
        console.warn('Postgres cache get error:', error)
      }
    }

    // Layer 3: Try memory cache (last resort)
    const memSession = this.memoryCache.get(key)
    if (memSession && memSession.expiresAt > now) {
      return { session: memSession, layer: 'memory' }
    }
    // Clean up expired
    if (memSession) {
      this.memoryCache.delete(key)
    }

    return null
  }

  /**
   * Store UAI session in all available cache layers
   */
  private async setInCache(key: string, session: CachedUAISession): Promise<void> {
    const promises: Promise<void>[] = []

    // Layer 1: Redis (if available)
    if (this.redis) {
      promises.push(
        this.redis.set(key, JSON.stringify(session), { EX: this.ttlSeconds })
          .then(() => {})
          .catch((err: Error) => console.warn('Redis cache set error:', err))
      )
    }

    // Layer 2: Postgres (if available)
    if (this.pgPool) {
      promises.push(
        this.pgPool.query(`
          INSERT INTO auth_gateway.uai_session_cache (
            cache_key, auth_id, organization_id, email, auth_method, credential_id, resolved_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7/1000.0), to_timestamp($8/1000.0))
          ON CONFLICT (cache_key) DO UPDATE SET
            auth_id = EXCLUDED.auth_id,
            organization_id = EXCLUDED.organization_id,
            email = EXCLUDED.email,
            auth_method = EXCLUDED.auth_method,
            credential_id = EXCLUDED.credential_id,
            resolved_at = EXCLUDED.resolved_at,
            expires_at = EXCLUDED.expires_at
        `, [
          key,
          session.authId,
          session.organizationId,
          session.email,
          session.authMethod,
          session.credentialId,
          session.resolvedAt,
          session.expiresAt,
        ])
          .then(() => {})
          .catch((err: Error) => console.warn('Postgres cache set error:', err))
      )
    }

    // Layer 3: Memory cache (always)
    this.memoryCache.set(key, session)
    if (this.memoryCache.size > 10000) {
      // Cleanup expired entries
      const now = Date.now()
      for (const [k, v] of this.memoryCache) {
        if (v.expiresAt < now) {
          this.memoryCache.delete(k)
        }
      }
    }

    // Wait for all cache writes (non-blocking for the caller)
    await Promise.allSettled(promises)
  }

  /**
   * Invalidate cached UAI session from all layers
   */
  async invalidate(method: AuthMethod, identifier: string): Promise<void> {
    const key = this.buildCacheKey(method, identifier)
    const promises: Promise<void>[] = []

    // Invalidate from Redis
    if (this.redis) {
      promises.push(
        this.redis.del(key)
          .then(() => {})
          .catch((err: Error) => console.warn('Redis invalidate error:', err))
      )
    }

    // Invalidate from Postgres
    if (this.pgPool) {
      promises.push(
        this.pgPool.query('DELETE FROM auth_gateway.uai_session_cache WHERE cache_key = $1', [key])
          .then(() => {})
          .catch((err: Error) => console.warn('Postgres invalidate error:', err))
      )
    }

    // Invalidate from memory
    this.memoryCache.delete(key)

    await Promise.allSettled(promises)
  }

  /**
   * Clean up expired entries from Postgres cache
   * Should be called periodically (e.g., every 5 minutes)
   */
  async cleanupExpired(): Promise<number> {
    if (!this.pgPool) return 0

    try {
      const result = await this.pgPool.query(
        'DELETE FROM auth_gateway.uai_session_cache WHERE expires_at < NOW()'
      )
      return result.rowCount || 0
    } catch (error) {
      console.warn('Postgres cleanup error:', error)
      return 0
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    layers: CacheLayer[]
    memoryCacheSize: number
    postgresCacheSize?: number
  }> {
    const stats: {
      layers: CacheLayer[]
      memoryCacheSize: number
      postgresCacheSize?: number
    } = {
      layers: this.activeLayers,
      memoryCacheSize: this.memoryCache.size,
    }

    if (this.pgPool) {
      try {
        const result = await this.pgPool.query(
          'SELECT COUNT(*) as count FROM auth_gateway.uai_session_cache WHERE expires_at > NOW()'
        )
        stats.postgresCacheSize = parseInt(result.rows[0].count, 10)
      } catch {
        // Ignore errors
      }
    }

    return stats
  }

  /**
   * Resolve UAI with tiered caching
   *
   * This is the main entry point:
   * 1. Check cache layers (Redis → Postgres → Memory)
   * 2. If not cached, resolve from auth database
   * 3. Cache the result in all available layers
   *
   * @param method - Auth method (supabase_jwt, api_key, sso_session, etc.)
   * @param identifier - Method-specific identifier (user_id, key hash, etc.)
   * @param options - Additional context for resolution
   * @returns UAI resolution result with cache status
   */
  async resolveUAI(
    method: AuthMethod,
    identifier: string,
    options?: {
      platform?: 'mcp' | 'cli' | 'web' | 'api' | 'mobile' | 'sdk'
      ipAddress?: string
      userAgent?: string
      skipCache?: boolean
    }
  ): Promise<UAIResolutionResult | null> {
    const cacheKey = this.buildCacheKey(method, identifier)

    // Step 1: Check cache layers (unless explicitly skipped)
    if (!options?.skipCache) {
      const cached = await this.getFromCache(cacheKey)
      if (cached) {
        return {
          authId: cached.session.authId,
          organizationId: cached.session.organizationId,
          email: cached.session.email,
          authMethod: cached.session.authMethod,
          credentialId: cached.session.credentialId,
          fromCache: true,
          cacheLayer: cached.layer,
        }
      }
    }

    // Step 2: Resolve from auth database (cache miss)
    const identityService = getIdentityService()
    const identity = await identityService.resolveIdentity(method, identifier, {
      createIfMissing: true, // Auto-create UAI if not exists
      platform: options?.platform,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    })

    if (!identity) {
      return null
    }

    // Step 3: Cache the resolved UAI in all layers
    const now = Date.now()
    const session: CachedUAISession = {
      authId: identity.authId,
      organizationId: identity.organizationId,
      email: identity.primaryEmail,
      authMethod: identity.authMethod,
      credentialId: identity.credentialId,
      resolvedAt: now,
      expiresAt: now + (this.ttlSeconds * 1000),
    }

    await this.setInCache(cacheKey, session)

    return {
      authId: identity.authId,
      organizationId: identity.organizationId,
      email: identity.primaryEmail,
      authMethod: identity.authMethod,
      credentialId: identity.credentialId,
      fromCache: false,
      cacheLayer: undefined, // Not from cache
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    const promises: Promise<void>[] = []

    if (this.redis) {
      promises.push(this.redis.quit().then(() => {}))
    }

    if (this.pgPool) {
      promises.push(this.pgPool.end())
    }

    this.memoryCache.clear()

    await Promise.allSettled(promises)
  }
}

// Singleton instance
let uaiCacheInstance: UAISessionCacheService | null = null

/**
 * Get the UAI session cache service instance
 *
 * Cache hierarchy:
 * 1. Redis (if REDIS_URL or UPSTASH_REDIS_URL is set) - fastest
 * 2. Postgres (if NEON_DATABASE_URL or DATABASE_URL is set) - persistent
 * 3. Memory (always available) - development fallback
 */
export function getUAISessionCache(): UAISessionCacheService {
  if (!uaiCacheInstance) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL
    const postgresUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
    const ttl = parseInt(process.env.UAI_CACHE_TTL || '300', 10)

    uaiCacheInstance = new UAISessionCacheService(redisUrl, postgresUrl, ttl)
  }
  return uaiCacheInstance
}

/**
 * Convenience function: Resolve UAI with caching
 */
export async function resolveUAICached(
  method: AuthMethod,
  identifier: string,
  options?: {
    platform?: 'mcp' | 'cli' | 'web' | 'api' | 'mobile' | 'sdk'
    ipAddress?: string
    userAgent?: string
    skipCache?: boolean
  }
): Promise<UAIResolutionResult | null> {
  return getUAISessionCache().resolveUAI(method, identifier, options)
}

/**
 * Start periodic cleanup of expired Postgres cache entries
 * Returns the interval ID for cleanup
 */
export function startCacheCleanup(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
  const cache = getUAISessionCache()

  // Run immediately on start
  cache.cleanupExpired().then(count => {
    if (count > 0) {
      console.log(`UAI Cache: Cleaned up ${count} expired entries`)
    }
  }).catch(() => {})

  // Then run periodically
  return setInterval(async () => {
    try {
      const count = await cache.cleanupExpired()
      if (count > 0) {
        console.log(`UAI Cache: Cleaned up ${count} expired entries`)
      }
    } catch (error) {
      console.warn('UAI Cache cleanup error:', error)
    }
  }, intervalMs)
}

/**
 * Get cache health/stats for monitoring
 */
export async function getCacheStats() {
  return getUAISessionCache().getStats()
}
