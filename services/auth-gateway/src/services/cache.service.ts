import { Redis } from 'ioredis'
import { logger } from '../utils/logger.js'

/**
 * Redis-based caching layer for OAuth2 PKCE implementation
 * Replaces in-memory stores for production scalability
 */

// Redis client configuration
const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB) || 0,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
})

redisClient.on('connect', () => {
    logger.info('Redis connected successfully')
})

redisClient.on('error', (error: Error) => {
    logger.error('Redis connection error:', error)
})/**
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
 * OAuth Client Caching
 */
export class OAuthClientCache {
    static async get(clientId: string) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.OAUTH_CLIENT(clientId))
            return cached ? JSON.parse(cached) : null
        } catch (error) {
            logger.error('OAuth client cache get error:', error)
            return null
        }
    }

    static async set(clientId: string, client: Record<string, unknown>, ttl: number = 3600) {
        try {
            await redisClient.setex(
                CACHE_KEYS.OAUTH_CLIENT(clientId),
                ttl,
                JSON.stringify(client)
            )
        } catch (error) {
            logger.error('OAuth client cache set error:', error)
        }
    }

    static async invalidate(clientId: string) {
        try {
            await redisClient.del(CACHE_KEYS.OAUTH_CLIENT(clientId))
        } catch (error) {
            logger.error('OAuth client cache invalidate error:', error)
        }
    }
}

/**
 * Authorization Code Caching
 */
export class AuthCodeCache {
    static async set(codeHash: string, codeData: Record<string, unknown>, ttl: number = 600) {
        try {
            await redisClient.setex(
                CACHE_KEYS.AUTH_CODE(codeHash),
                ttl,
                JSON.stringify(codeData)
            )
        } catch (error) {
            logger.error('Auth code cache set error:', error)
        }
    }

    static async get(codeHash: string) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.AUTH_CODE(codeHash))
            return cached ? JSON.parse(cached) : null
        } catch (error) {
            logger.error('Auth code cache get error:', error)
            return null
        }
    }

    static async consume(codeHash: string) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.AUTH_CODE(codeHash))
            await redisClient.del(CACHE_KEYS.AUTH_CODE(codeHash))
            return cached ? JSON.parse(cached) : null
        } catch (error) {
            logger.error('Auth code cache consume error:', error)
            return null
        }
    }
}

/**
 * Rate Limiting with Redis
 */
export class RedisRateLimit {
    static async check(key: string, limit: number, windowMs: number): Promise<{
        allowed: boolean
        count: number
        remaining: number
        resetTime: number
    }> {
        try {
            const now = Date.now()
            const windowStart = now - windowMs

            // Use Redis sorted set for sliding window
            const pipe = redisClient.pipeline()

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
        } catch (error) {
            logger.error('Redis rate limit check error:', error)
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
 * CSRF Token Caching
 */
export class CSRFTokenCache {
    static async set(token: string, data: Record<string, unknown>, ttl: number = 900) {
        try {
            await redisClient.setex(
                CACHE_KEYS.CSRF_TOKEN(token),
                ttl,
                JSON.stringify(data)
            )
        } catch (error) {
            logger.error('CSRF token cache set error:', error)
        }
    }

    static async consume(token: string) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.CSRF_TOKEN(token))
            await redisClient.del(CACHE_KEYS.CSRF_TOKEN(token))
            return cached ? JSON.parse(cached) : null
        } catch (error) {
            logger.error('CSRF token cache consume error:', error)
            return null
        }
    }
}

/**
 * Token Validation Caching
 */
export class TokenCache {
    static async setRefreshToken(tokenHash: string, tokenData: Record<string, unknown>, ttl: number) {
        try {
            await redisClient.setex(
                CACHE_KEYS.REFRESH_TOKEN(tokenHash),
                ttl,
                JSON.stringify(tokenData)
            )
        } catch (error) {
            logger.error('Refresh token cache set error:', error)
        }
    }

    static async getRefreshToken(tokenHash: string) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.REFRESH_TOKEN(tokenHash))
            return cached ? JSON.parse(cached) : null
        } catch (error) {
            logger.error('Refresh token cache get error:', error)
            return null
        }
    }

    static async invalidateRefreshToken(tokenHash: string) {
        try {
            await redisClient.del(CACHE_KEYS.REFRESH_TOKEN(tokenHash))
        } catch (error) {
            logger.error('Refresh token cache invalidate error:', error)
        }
    }

    static async setAccessToken(tokenHash: string, tokenData: Record<string, unknown>, ttl: number) {
        try {
            await redisClient.setex(
                CACHE_KEYS.ACCESS_TOKEN(tokenHash),
                ttl,
                JSON.stringify(tokenData)
            )
        } catch (error) {
            logger.error('Access token cache set error:', error)
        }
    }

    static async getAccessToken(tokenHash: string) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.ACCESS_TOKEN(tokenHash))
            return cached ? JSON.parse(cached) : null
        } catch (error) {
            logger.error('Access token cache get error:', error)
            return null
        }
    }
}

/**
 * OAuth State Storage with Database Fallback
 * Used for OAuth and Magic Link state that MUST persist even if Redis is down
 */
export class OAuthStateCache {
    private static async isRedisAvailable(): Promise<boolean> {
        try {
            await redisClient.ping()
            return redisClient.status === 'ready'
        } catch {
            return false
        }
    }

    static async set(key: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void> {
        try {
            // Try Redis first
            if (await this.isRedisAvailable()) {
                await redisClient.setex(key, ttlSeconds, JSON.stringify(data))
                return
            }
        } catch (error) {
            logger.warn('Redis unavailable for OAuth state, falling back to database', { key, error })
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
            logger.error('Failed to store OAuth state in database fallback', { key, error: dbError })
            throw new Error('Failed to store OAuth state')
        }
    }

    static async get(key: string): Promise<Record<string, unknown> | null> {
        try {
            // Try Redis first
            if (await this.isRedisAvailable()) {
                const cached = await redisClient.get(key)
                if (cached) {
                    return JSON.parse(cached)
                }
            }
        } catch (error) {
            logger.warn('Redis unavailable for OAuth state get, checking database', { key, error })
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
            logger.error('Failed to get OAuth state from database fallback', { key, error: dbError })
        }

        return null
    }

    static async delete(key: string): Promise<void> {
        // Delete from both Redis and database to ensure cleanup
        try {
            if (await this.isRedisAvailable()) {
                await redisClient.del(key)
            }
        } catch (error) {
            logger.warn('Failed to delete OAuth state from Redis', { key, error })
        }

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
    try {
        const start = Date.now()
        await redisClient.ping()
        const latency = Date.now() - start

        return {
            healthy: true,
            latency,
            connected: redisClient.status === 'ready'
        }
    } catch (error) {
        return {
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            connected: false
        }
    }
}

/**
 * Graceful shutdown
 */
export async function closeRedis() {
    try {
        await redisClient.quit()
        logger.info('Redis connection closed gracefully')
    } catch (error) {
        logger.error('Error closing Redis connection:', error)
    }
}

export { redisClient }