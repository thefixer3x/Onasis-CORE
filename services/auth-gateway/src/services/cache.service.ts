import { Redis } from 'ioredis'
import { logger } from '../utils/logger.js'

/**
 * Redis-based caching layer for OAuth2 PKCE implementation
 * With graceful degradation when Redis is not available
 */

// Check if Redis is explicitly configured
const REDIS_ENABLED = !!(
    process.env.REDIS_URL ||
    process.env.REDIS_HOST ||
    process.env.REDIS_PASSWORD ||
    process.env.REDIS_ENABLED === 'true'
)

// Lazy Redis client - only created when Redis is configured
let redisClient: Redis | null = null
let redisConnectionFailed = false
let lastErrorLogTime = 0
const ERROR_LOG_THROTTLE_MS = 60000 // Only log errors once per minute

function getRedisClient(): Redis | null {
    if (!REDIS_ENABLED) {
        return null
    }

    if (redisConnectionFailed) {
        return null // Don't keep trying if we've already failed
    }

    if (!redisClient) {
        try {
            // Support REDIS_URL (common in cloud environments) or individual config
            const redisConfig = process.env.REDIS_URL
                ? { lazyConnect: true, maxRetriesPerRequest: 3 }
                : {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: Number(process.env.REDIS_PORT) || 6379,
                    password: process.env.REDIS_PASSWORD,
                    db: Number(process.env.REDIS_DB) || 0,
                    maxRetriesPerRequest: 3,
                    lazyConnect: true,
                    retryStrategy: (times: number) => {
                        if (times > 3) {
                            redisConnectionFailed = true
                            return null // Stop retrying
                        }
                        return Math.min(times * 200, 2000)
                    },
                }

            redisClient = process.env.REDIS_URL
                ? new Redis(process.env.REDIS_URL, redisConfig)
                : new Redis(redisConfig)

            redisClient.on('connect', () => {
                logger.info('Redis connected successfully')
                redisConnectionFailed = false
            })

            redisClient.on('error', (error: Error) => {
                // Throttle error logging to prevent log spam
                const now = Date.now()
                if (now - lastErrorLogTime > ERROR_LOG_THROTTLE_MS) {
                    logger.warn('Redis connection error (will use database fallback):', {
                        code: (error as NodeJS.ErrnoException).code,
                        message: error.message,
                    })
                    lastErrorLogTime = now
                }
            })

            redisClient.on('close', () => {
                logger.info('Redis connection closed')
            })

        } catch (error) {
            logger.warn('Failed to initialize Redis client, using database fallback', { error })
            redisConnectionFailed = true
            return null
        }
    }

    return redisClient
}

// Log startup status
if (REDIS_ENABLED) {
    logger.info('Redis caching enabled', {
        url: process.env.REDIS_URL ? '[REDIS_URL configured]' : undefined,
        host: process.env.REDIS_HOST,
    })
} else {
    logger.info('Redis not configured - using database fallback for state storage')
}/**
 * Cache keys with consistent prefixing
 */
const CACHE_KEYS = {
    OAUTH_CLIENT: (clientId: string) => `oauth:client:${clientId}`,
    AUTH_CODE: (codeHash: string) => `oauth:code:${codeHash}`,
    RATE_LIMIT: (key: string) => `rate:${key}`,
    CSRF_TOKEN: (token: string) => `csrf:${token}`,
    REFRESH_TOKEN: (tokenHash: string) => `oauth:refresh:${tokenHash}`,
    ACCESS_TOKEN: (tokenHash: string) => `oauth:access:${tokenHash}`,
} as const

/**
 * OAuth Client Caching (optional - gracefully degrades without Redis)
 */
export class OAuthClientCache {
    static async get(clientId: string) {
        const client = getRedisClient()
        if (!client) return null // No caching available
        try {
            const cached = await client.get(CACHE_KEYS.OAUTH_CLIENT(clientId))
            return cached ? JSON.parse(cached) : null
        } catch {
            return null // Fail silently for caching
        }
    }

    static async set(clientId: string, clientData: Record<string, unknown>, ttl: number = 3600) {
        const client = getRedisClient()
        if (!client) return // No caching available
        try {
            await client.setex(
                CACHE_KEYS.OAUTH_CLIENT(clientId),
                ttl,
                JSON.stringify(clientData)
            )
        } catch {
            // Fail silently for caching
        }
    }

    static async invalidate(clientId: string) {
        const client = getRedisClient()
        if (!client) return
        try {
            await client.del(CACHE_KEYS.OAUTH_CLIENT(clientId))
        } catch {
            // Fail silently for caching
        }
    }
}

/**
 * Authorization Code Caching (optional - gracefully degrades without Redis)
 */
export class AuthCodeCache {
    static async set(codeHash: string, codeData: Record<string, unknown>, ttl: number = 600) {
        const client = getRedisClient()
        if (!client) return
        try {
            await client.setex(
                CACHE_KEYS.AUTH_CODE(codeHash),
                ttl,
                JSON.stringify(codeData)
            )
        } catch {
            // Fail silently for caching
        }
    }

    static async get(codeHash: string) {
        const client = getRedisClient()
        if (!client) return null
        try {
            const cached = await client.get(CACHE_KEYS.AUTH_CODE(codeHash))
            return cached ? JSON.parse(cached) : null
        } catch {
            return null
        }
    }

    static async consume(codeHash: string) {
        const client = getRedisClient()
        if (!client) return null
        try {
            const cached = await client.get(CACHE_KEYS.AUTH_CODE(codeHash))
            await client.del(CACHE_KEYS.AUTH_CODE(codeHash))
            return cached ? JSON.parse(cached) : null
        } catch {
            return null
        }
    }
}

/**
 * Rate Limiting with Redis (optional - fails open without Redis)
 */
export class RedisRateLimit {
    static async check(key: string, limit: number, windowMs: number): Promise<{
        allowed: boolean
        count: number
        remaining: number
        resetTime: number
    }> {
        const client = getRedisClient()
        // Without Redis, fail open (allow all requests)
        if (!client) {
            return {
                allowed: true,
                count: 0,
                remaining: limit,
                resetTime: Date.now() + windowMs
            }
        }

        try {
            const now = Date.now()
            const windowStart = now - windowMs

            // Use Redis sorted set for sliding window
            const pipe = client.pipeline()

            // Remove expired entries
            pipe.zremrangebyscore(CACHE_KEYS.RATE_LIMIT(key), 0, windowStart)

            // Count current requests
            pipe.zcard(CACHE_KEYS.RATE_LIMIT(key))

            // Add current request
            pipe.zadd(CACHE_KEYS.RATE_LIMIT(key), now, `${now}-${Math.random()}`)

            // Set expiry
            pipe.expire(CACHE_KEYS.RATE_LIMIT(key), Math.ceil(windowMs / 1000))

            const results = await pipe.exec()
            const count = (results?.[1]?.[1] as number) || 0

            return {
                allowed: count < limit,
                count: count + 1,
                remaining: Math.max(0, limit - count - 1),
                resetTime: now + windowMs
            }
        } catch {
            // Fail open for availability
            return {
                allowed: true,
                count: 0,
                remaining: limit,
                resetTime: Date.now() + windowMs
            }
        }
    }
}

/**
 * CSRF Token Caching (optional - gracefully degrades without Redis)
 */
export class CSRFTokenCache {
    static async set(token: string, data: Record<string, unknown>, ttl: number = 900) {
        const client = getRedisClient()
        if (!client) return
        try {
            await client.setex(
                CACHE_KEYS.CSRF_TOKEN(token),
                ttl,
                JSON.stringify(data)
            )
        } catch {
            // Fail silently
        }
    }

    static async consume(token: string) {
        const client = getRedisClient()
        if (!client) return null
        try {
            const cached = await client.get(CACHE_KEYS.CSRF_TOKEN(token))
            await client.del(CACHE_KEYS.CSRF_TOKEN(token))
            return cached ? JSON.parse(cached) : null
        } catch {
            return null
        }
    }
}

/**
 * Token Validation Caching (optional - gracefully degrades without Redis)
 */
export class TokenCache {
    static async setRefreshToken(tokenHash: string, tokenData: Record<string, unknown>, ttl: number) {
        const client = getRedisClient()
        if (!client) return
        try {
            await client.setex(
                CACHE_KEYS.REFRESH_TOKEN(tokenHash),
                ttl,
                JSON.stringify(tokenData)
            )
        } catch {
            // Fail silently
        }
    }

    static async getRefreshToken(tokenHash: string) {
        const client = getRedisClient()
        if (!client) return null
        try {
            const cached = await client.get(CACHE_KEYS.REFRESH_TOKEN(tokenHash))
            return cached ? JSON.parse(cached) : null
        } catch {
            return null
        }
    }

    static async invalidateRefreshToken(tokenHash: string) {
        const client = getRedisClient()
        if (!client) return
        try {
            await client.del(CACHE_KEYS.REFRESH_TOKEN(tokenHash))
        } catch {
            // Fail silently
        }
    }

    static async setAccessToken(tokenHash: string, tokenData: Record<string, unknown>, ttl: number) {
        const client = getRedisClient()
        if (!client) return
        try {
            await client.setex(
                CACHE_KEYS.ACCESS_TOKEN(tokenHash),
                ttl,
                JSON.stringify(tokenData)
            )
        } catch {
            // Fail silently
        }
    }

    static async getAccessToken(tokenHash: string) {
        const client = getRedisClient()
        if (!client) return null
        try {
            const cached = await client.get(CACHE_KEYS.ACCESS_TOKEN(tokenHash))
            return cached ? JSON.parse(cached) : null
        } catch {
            return null
        }
    }
}

/**
 * OAuth State Storage with Database Fallback
 * Used for OAuth and Magic Link state that MUST persist even if Redis is down
 * This class ALWAYS works - uses Redis if available, otherwise PostgreSQL
 */
export class OAuthStateCache {
    private static async isRedisAvailable(): Promise<boolean> {
        const client = getRedisClient()
        if (!client) return false
        try {
            await client.ping()
            return client.status === 'ready'
        } catch {
            return false
        }
    }

    static async set(key: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void> {
        const client = getRedisClient()

        // Try Redis first (if configured and available)
        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    await client.setex(key, ttlSeconds, JSON.stringify(data))
                    return
                }
            } catch {
                // Redis failed, fall through to database
            }
        }

        // Fallback to database (always available)
        try {
            const { dbPool } = await import('../../db/client.js')
            const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
            await dbPool.query(`
                INSERT INTO auth_gateway.oauth_states (state_key, state_data, expires_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (state_key) DO UPDATE SET
                    state_data = $2,
                    expires_at = $3,
                    updated_at = NOW()
            `, [key, JSON.stringify(data), expiresAt])
        } catch (dbError) {
            logger.error('Failed to store OAuth state in database', { key, error: dbError })
            throw new Error('Failed to store OAuth state')
        }
    }

    static async get(key: string): Promise<Record<string, unknown> | null> {
        const client = getRedisClient()

        // Try Redis first (if configured and available)
        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    const cached = await client.get(key)
                    if (cached) {
                        return JSON.parse(cached)
                    }
                }
            } catch {
                // Redis failed, fall through to database
            }
        }

        // Fallback to database
        try {
            const { dbPool } = await import('../../db/client.js')
            const result = await dbPool.query(`
                SELECT state_data FROM auth_gateway.oauth_states
                WHERE state_key = $1 AND expires_at > NOW()
            `, [key])
            if (result.rows.length > 0) {
                const data = result.rows[0] as { state_data: string }
                return typeof data.state_data === 'string'
                    ? JSON.parse(data.state_data)
                    : data.state_data
            }
        } catch (dbError) {
            logger.error('Failed to get OAuth state from database', { key, error: dbError })
        }

        return null
    }

    static async delete(key: string): Promise<void> {
        const client = getRedisClient()

        // Delete from Redis if available
        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    await client.del(key)
                }
            } catch {
                // Redis failed, continue to database cleanup
            }
        }

        // Always delete from database
        try {
            const { dbPool } = await import('../../db/client.js')
            await dbPool.query('DELETE FROM auth_gateway.oauth_states WHERE state_key = $1', [key])
        } catch (dbError) {
            logger.warn('Failed to delete OAuth state from database', { key, error: dbError })
        }
    }

    static async consume(key: string): Promise<Record<string, unknown> | null> {
        const data = await this.get(key)
        if (data) {
            await this.delete(key)
        }
        return data
    }
}

/**
 * Health check for Redis
 */
export async function checkRedisHealth() {
    const client = getRedisClient()

    if (!client) {
        return {
            healthy: true, // Not configured = healthy (using database fallback)
            enabled: false,
            message: 'Redis not configured, using database fallback',
            connected: false
        }
    }

    try {
        const start = Date.now()
        await client.ping()
        const latency = Date.now() - start

        return {
            healthy: true,
            enabled: true,
            latency,
            connected: client.status === 'ready'
        }
    } catch (error) {
        return {
            healthy: false,
            enabled: true,
            error: error instanceof Error ? error.message : 'Unknown error',
            connected: false
        }
    }
}

/**
 * Graceful shutdown
 */
export async function closeRedis() {
    if (!redisClient) {
        return // Nothing to close
    }

    try {
        await redisClient.quit()
        logger.info('Redis connection closed gracefully')
    } catch {
        // Ignore close errors - we're shutting down anyway
    }
}

/**
 * Check if Redis caching is enabled
 */
export function isRedisCachingEnabled(): boolean {
    return REDIS_ENABLED
}

/**
 * Device Code Storage with Database Fallback (RFC 8628)
 * Used for CLI device authorization flow
 * This class ALWAYS works - uses Redis if available, otherwise PostgreSQL
 */
export class DeviceCodeCache {
    private static async isRedisAvailable(): Promise<boolean> {
        const client = getRedisClient()
        if (!client) return false
        try {
            await client.ping()
            return client.status === 'ready'
        } catch {
            return false
        }
    }

    static async set(key: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void> {
        const client = getRedisClient()

        // Try Redis first (if configured and available)
        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    await client.setex(key, ttlSeconds, JSON.stringify(data))
                    return
                }
            } catch {
                // Redis failed, fall through to database
            }
        }

        // Fallback to database
        try {
            const { dbPool } = await import('../../db/client.js')
            const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
            await dbPool.query(`
                INSERT INTO auth_gateway.oauth_states (state_key, state_data, expires_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (state_key) DO UPDATE SET
                    state_data = $2,
                    expires_at = $3,
                    updated_at = NOW()
            `, [key, JSON.stringify(data), expiresAt])
        } catch (dbError) {
            logger.error('Failed to store device code in database', { key, error: dbError })
            throw new Error('Failed to store device code')
        }
    }

    static async get(key: string): Promise<Record<string, unknown> | null> {
        const client = getRedisClient()

        // Try Redis first (if configured and available)
        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    const cached = await client.get(key)
                    if (cached) {
                        return JSON.parse(cached)
                    }
                }
            } catch {
                // Redis failed, fall through to database
            }
        }

        // Fallback to database
        try {
            const { dbPool } = await import('../../db/client.js')
            const result = await dbPool.query(`
                SELECT state_data FROM auth_gateway.oauth_states
                WHERE state_key = $1 AND expires_at > NOW()
            `, [key])
            if (result.rows.length > 0) {
                const data = result.rows[0] as { state_data: string }
                return typeof data.state_data === 'string'
                    ? JSON.parse(data.state_data)
                    : data.state_data
            }
        } catch (dbError) {
            logger.error('Failed to get device code from database', { key, error: dbError })
        }

        return null
    }

    static async delete(key: string): Promise<void> {
        const client = getRedisClient()

        // Delete from Redis if available
        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    await client.del(key)
                }
            } catch {
                // Redis failed, continue to database cleanup
            }
        }

        // Always delete from database
        try {
            const { dbPool } = await import('../../db/client.js')
            await dbPool.query('DELETE FROM auth_gateway.oauth_states WHERE state_key = $1', [key])
        } catch (dbError) {
            logger.warn('Failed to delete device code from database', { key, error: dbError })
        }
    }
}

/**
 * OTP State Storage with Database Fallback
 * Used for passwordless OTP authentication
 * This class ALWAYS works - uses Redis if available, otherwise PostgreSQL
 */
export class OtpStateCache {
    private static async isRedisAvailable(): Promise<boolean> {
        const client = getRedisClient()
        if (!client) return false
        try {
            await client.ping()
            return client.status === 'ready'
        } catch {
            return false
        }
    }

    static async set(key: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void> {
        const client = getRedisClient()

        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    await client.setex(key, ttlSeconds, JSON.stringify(data))
                    return
                }
            } catch {
                // Redis failed, fall through to database
            }
        }

        try {
            const { dbPool } = await import('../../db/client.js')
            const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
            await dbPool.query(`
                INSERT INTO auth_gateway.oauth_states (state_key, state_data, expires_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (state_key) DO UPDATE SET
                    state_data = $2,
                    expires_at = $3,
                    updated_at = NOW()
            `, [key, JSON.stringify(data), expiresAt])
        } catch (dbError) {
            logger.error('Failed to store OTP state in database', { key, error: dbError })
            throw new Error('Failed to store OTP state')
        }
    }

    static async get(key: string): Promise<Record<string, unknown> | null> {
        const client = getRedisClient()

        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    const cached = await client.get(key)
                    if (cached) {
                        return JSON.parse(cached)
                    }
                }
            } catch {
                // Redis failed, fall through to database
            }
        }

        try {
            const { dbPool } = await import('../../db/client.js')
            const result = await dbPool.query(`
                SELECT state_data FROM auth_gateway.oauth_states
                WHERE state_key = $1 AND expires_at > NOW()
            `, [key])
            if (result.rows.length > 0) {
                const data = result.rows[0] as { state_data: string }
                return typeof data.state_data === 'string'
                    ? JSON.parse(data.state_data)
                    : data.state_data
            }
        } catch (dbError) {
            logger.error('Failed to get OTP state from database', { key, error: dbError })
        }

        return null
    }

    static async delete(key: string): Promise<void> {
        const client = getRedisClient()

        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    await client.del(key)
                }
            } catch {
                // Redis failed, continue to database cleanup
            }
        }

        try {
            const { dbPool } = await import('../../db/client.js')
            await dbPool.query('DELETE FROM auth_gateway.oauth_states WHERE state_key = $1', [key])
        } catch (dbError) {
            logger.warn('Failed to delete OTP state from database', { key, error: dbError })
        }
    }
}

// Export getRedisClient for direct Redis access where needed
export { getRedisClient }

// Export for backward compatibility (may be null if Redis not configured)
export { redisClient, REDIS_ENABLED }