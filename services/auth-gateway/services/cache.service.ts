import { Redis } from 'ioredis'
import { logger } from '../utils/logger.js'

/**
 * Redis-based caching layer with graceful degradation
 * Falls back to no-op mode if Redis is unavailable
 */

let redisClient: Redis | null = null
let redisAvailable = false

// Initialize Redis with graceful fallback
async function initializeRedis() {
    try {
        const client = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD,
            db: Number(process.env.REDIS_DB) || 0,
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            retryStrategy: () => null,
            connectTimeout: 5000,
        })

        client.on('connect', () => {
            logger.info('Redis connected successfully')
            redisAvailable = true
        })

        client.on('error', (error: Error) => {
            logger.warn('Redis unavailable:', error.message)
            redisAvailable = false
        })

        client.on('close', () => {
            logger.warn('Redis connection closed')
            redisAvailable = false
        })

        await client.connect().catch(() => {
            logger.warn('Redis unavailable - caching disabled')
            redisAvailable = false
        })

        redisClient = client
    } catch (error) {
        logger.warn('Redis init failed:', error instanceof Error ? error.message : 'Unknown error')
        redisAvailable = false
    }
}

// Only initialize Redis if explicitly configured
if (process.env.REDIS_ENABLED === 'true' || process.env.REDIS_HOST || process.env.REDIS_PASSWORD || process.env.REDIS_URL) {
    initializeRedis().catch(() => {})
} else {
    logger.info('Redis not configured - caching disabled (graceful degradation mode)')
}

async function safeRedis<T>(op: () => Promise<T>, fallback: T): Promise<T> {
    if (!redisAvailable || !redisClient) return fallback
    try {
        return await op()
    } catch {
        redisAvailable = false
        return fallback
    }
}

/**
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
        return safeRedis(
            () => redisClient!.get(CACHE_KEYS.OAUTH_CLIENT(clientId)).then(cached => cached ? JSON.parse(cached) : null),
            null
        )
    }

    static async set(clientId: string, client: Record<string, unknown>, ttl: number = 3600) {
        return safeRedis(
            () => redisClient!.setex(
                CACHE_KEYS.OAUTH_CLIENT(clientId),
                ttl,
                JSON.stringify(client)
            ),
            undefined as any
        )
    }

    static async invalidate(clientId: string) {
        return safeRedis(
            () => redisClient!.del(CACHE_KEYS.OAUTH_CLIENT(clientId)),
            undefined as any
        )
    }
}

/**
 * Authorization Code Caching
 */
export class AuthCodeCache {
    static async set(codeHash: string, codeData: Record<string, unknown>, ttl: number = 600) {
        return safeRedis(
            () => redisClient!.setex(
                CACHE_KEYS.AUTH_CODE(codeHash),
                ttl,
                JSON.stringify(codeData)
            ),
            undefined as any
        )
    }

    static async get(codeHash: string) {
        return safeRedis(
            () => redisClient!.get(CACHE_KEYS.AUTH_CODE(codeHash)).then(cached => cached ? JSON.parse(cached) : null),
            null
        )
    }

    static async consume(codeHash: string) {
        return safeRedis(
            async () => {
                const cached = await redisClient!.get(CACHE_KEYS.AUTH_CODE(codeHash))
                await redisClient!.del(CACHE_KEYS.AUTH_CODE(codeHash))
                return cached ? JSON.parse(cached) : null
            },
            null
        )
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
        return safeRedis(
            async () => {
                const now = Date.now()
                const windowStart = now - windowMs

                const pipe = redisClient!.pipeline()
                pipe.zremrangebyscore(CACHE_KEYS.RATE_LIMIT(key), 0, windowStart)
                pipe.zcard(CACHE_KEYS.RATE_LIMIT(key))
                pipe.zadd(CACHE_KEYS.RATE_LIMIT(key), now, `${now}-${Math.random()}`)
                pipe.expire(CACHE_KEYS.RATE_LIMIT(key), Math.ceil(windowMs / 1000))

                const results = await pipe.exec()
                const count = (results?.[1]?.[1] as number) || 0

                return {
                    allowed: count < limit,
                    count: count + 1,
                    remaining: Math.max(0, limit - count - 1),
                    resetTime: now + windowMs
                }
            },
            {
                allowed: true,
                count: 0,
                remaining: limit,
                resetTime: Date.now() + windowMs
            }
        )
    }
}

/**
 * CSRF Token Caching
 */
export class CSRFTokenCache {
    static async set(token: string, data: Record<string, unknown>, ttl: number = 900) {
        return safeRedis(
            () => redisClient!.setex(
                CACHE_KEYS.CSRF_TOKEN(token),
                ttl,
                JSON.stringify(data)
            ),
            undefined as any
        )
    }

    static async consume(token: string) {
        return safeRedis(
            async () => {
                const cached = await redisClient!.get(CACHE_KEYS.CSRF_TOKEN(token))
                await redisClient!.del(CACHE_KEYS.CSRF_TOKEN(token))
                return cached ? JSON.parse(cached) : null
            },
            null
        )
    }
}

/**
 * Token Validation Caching
 */
export class TokenCache {
    static async setRefreshToken(tokenHash: string, tokenData: Record<string, unknown>, ttl: number) {
        return safeRedis(
            () => redisClient!.setex(
                CACHE_KEYS.REFRESH_TOKEN(tokenHash),
                ttl,
                JSON.stringify(tokenData)
            ),
            undefined as any
        )
    }

    static async getRefreshToken(tokenHash: string) {
        return safeRedis(
            () => redisClient!.get(CACHE_KEYS.REFRESH_TOKEN(tokenHash)).then(cached => cached ? JSON.parse(cached) : null),
            null
        )
    }

    static async invalidateRefreshToken(tokenHash: string) {
        return safeRedis(
            () => redisClient!.del(CACHE_KEYS.REFRESH_TOKEN(tokenHash)),
            undefined as any
        )
    }

    static async setAccessToken(tokenHash: string, tokenData: Record<string, unknown>, ttl: number) {
        return safeRedis(
            () => redisClient!.setex(
                CACHE_KEYS.ACCESS_TOKEN(tokenHash),
                ttl,
                JSON.stringify(tokenData)
            ),
            undefined as any
        )
    }

    static async getAccessToken(tokenHash: string) {
        return safeRedis(
            () => redisClient!.get(CACHE_KEYS.ACCESS_TOKEN(tokenHash)).then(cached => cached ? JSON.parse(cached) : null),
            null
        )
    }
}

/**
 * Health check for Redis
 */
export async function checkRedisHealth() {
    if (!redisClient) {
        return {
            healthy: false,
            error: 'Redis client not initialized',
            connected: false
        }
    }

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
    if (!redisClient) return

    try {
        await redisClient.quit()
        logger.info('Redis connection closed gracefully')
    } catch (error) {
        logger.error('Error closing Redis connection:', error)
    }
}

export { redisClient }