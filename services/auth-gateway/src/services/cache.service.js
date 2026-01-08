import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
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
});
redisClient.on('connect', () => {
    logger.info('Redis connected successfully');
});
redisClient.on('error', (error) => {
    logger.error('Redis connection error:', error);
}); /**
 * Cache keys with consistent prefixing
 */
const CACHE_KEYS = {
    OAUTH_CLIENT: (clientId) => `oauth:client:${clientId}`,
    AUTH_CODE: (codeHash) => `oauth:code:${codeHash}`,
    RATE_LIMIT: (key) => `rate:${key}`,
    CSRF_TOKEN: (token) => `csrf:${token}`,
    REFRESH_TOKEN: (tokenHash) => `oauth:refresh:${tokenHash}`,
    ACCESS_TOKEN: (tokenHash) => `oauth:access:${tokenHash}`,
};
/**
 * OAuth Client Caching
 */
export class OAuthClientCache {
    static async get(clientId) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.OAUTH_CLIENT(clientId));
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            logger.error('OAuth client cache get error:', error);
            return null;
        }
    }
    static async set(clientId, client, ttl = 3600) {
        try {
            await redisClient.setex(CACHE_KEYS.OAUTH_CLIENT(clientId), ttl, JSON.stringify(client));
        }
        catch (error) {
            logger.error('OAuth client cache set error:', error);
        }
    }
    static async invalidate(clientId) {
        try {
            await redisClient.del(CACHE_KEYS.OAUTH_CLIENT(clientId));
        }
        catch (error) {
            logger.error('OAuth client cache invalidate error:', error);
        }
    }
}
/**
 * Authorization Code Caching
 */
export class AuthCodeCache {
    static async set(codeHash, codeData, ttl = 600) {
        try {
            await redisClient.setex(CACHE_KEYS.AUTH_CODE(codeHash), ttl, JSON.stringify(codeData));
        }
        catch (error) {
            logger.error('Auth code cache set error:', error);
        }
    }
    static async get(codeHash) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.AUTH_CODE(codeHash));
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            logger.error('Auth code cache get error:', error);
            return null;
        }
    }
    static async consume(codeHash) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.AUTH_CODE(codeHash));
            await redisClient.del(CACHE_KEYS.AUTH_CODE(codeHash));
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            logger.error('Auth code cache consume error:', error);
            return null;
        }
    }
}
/**
 * Rate Limiting with Redis
 */
export class RedisRateLimit {
    static async check(key, limit, windowMs) {
        try {
            const now = Date.now();
            const windowStart = now - windowMs;
            // Use Redis sorted set for sliding window
            const pipe = redisClient.pipeline();
            // Remove expired entries
            pipe.zremrangebyscore(CACHE_KEYS.RATE_LIMIT(key), 0, windowStart);
            // Count current requests
            pipe.zcard(CACHE_KEYS.RATE_LIMIT(key));
            // Add current request
            pipe.zadd(CACHE_KEYS.RATE_LIMIT(key), now, `${now}-${Math.random()}`);
            // Set expiry
            pipe.expire(CACHE_KEYS.RATE_LIMIT(key), Math.ceil(windowMs / 1000));
            const results = await pipe.exec();
            const count = results?.[1]?.[1] || 0;
            return {
                allowed: count < limit,
                count: count + 1,
                remaining: Math.max(0, limit - count - 1),
                resetTime: now + windowMs
            };
        }
        catch (error) {
            logger.error('Redis rate limit check error:', error);
            // Fail open for availability
            return {
                allowed: true,
                count: 0,
                remaining: limit,
                resetTime: Date.now() + windowMs
            };
        }
    }
}
/**
 * CSRF Token Caching
 */
export class CSRFTokenCache {
    static async set(token, data, ttl = 900) {
        try {
            await redisClient.setex(CACHE_KEYS.CSRF_TOKEN(token), ttl, JSON.stringify(data));
        }
        catch (error) {
            logger.error('CSRF token cache set error:', error);
        }
    }
    static async consume(token) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.CSRF_TOKEN(token));
            await redisClient.del(CACHE_KEYS.CSRF_TOKEN(token));
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            logger.error('CSRF token cache consume error:', error);
            return null;
        }
    }
}
/**
 * Token Validation Caching
 */
export class TokenCache {
    static async setRefreshToken(tokenHash, tokenData, ttl) {
        try {
            await redisClient.setex(CACHE_KEYS.REFRESH_TOKEN(tokenHash), ttl, JSON.stringify(tokenData));
        }
        catch (error) {
            logger.error('Refresh token cache set error:', error);
        }
    }
    static async getRefreshToken(tokenHash) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.REFRESH_TOKEN(tokenHash));
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            logger.error('Refresh token cache get error:', error);
            return null;
        }
    }
    static async invalidateRefreshToken(tokenHash) {
        try {
            await redisClient.del(CACHE_KEYS.REFRESH_TOKEN(tokenHash));
        }
        catch (error) {
            logger.error('Refresh token cache invalidate error:', error);
        }
    }
    static async setAccessToken(tokenHash, tokenData, ttl) {
        try {
            await redisClient.setex(CACHE_KEYS.ACCESS_TOKEN(tokenHash), ttl, JSON.stringify(tokenData));
        }
        catch (error) {
            logger.error('Access token cache set error:', error);
        }
    }
    static async getAccessToken(tokenHash) {
        try {
            const cached = await redisClient.get(CACHE_KEYS.ACCESS_TOKEN(tokenHash));
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            logger.error('Access token cache get error:', error);
            return null;
        }
    }
}
/**
 * Health check for Redis
 */
export async function checkRedisHealth() {
    try {
        const start = Date.now();
        await redisClient.ping();
        const latency = Date.now() - start;
        return {
            healthy: true,
            latency,
            connected: redisClient.status === 'ready'
        };
    }
    catch (error) {
        return {
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            connected: false
        };
    }
}
/**
 * Graceful shutdown
 */
export async function closeRedis() {
    try {
        await redisClient.quit();
        logger.info('Redis connection closed gracefully');
    }
    catch (error) {
        logger.error('Error closing Redis connection:', error);
    }
}
export { redisClient };
