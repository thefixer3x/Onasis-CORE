import { getRedisClient } from './cache.service.js'
import { dbPool } from '../../db/client.js'
import { logger } from '../utils/logger.js'

const CSRF_KEY_PREFIX = 'csrf:'

interface PostgresCSRFEntry {
    state_key: string
    state_data: Record<string, unknown>
    expires_at: Date
    created_at: Date
}

interface StoredCSRFData {
    created: number
    clientId?: string
    sessionId?: string
}

export class PostgresCSRFStore {
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

    static async set(
        token: string,
        data: StoredCSRFData,
        ttlSeconds: number
    ): Promise<void> {
        const key = CSRF_KEY_PREFIX + token
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

        await this.setPostgres(key, data, ttlSeconds)
    }

    private static async setPostgres(
        key: string,
        data: StoredCSRFData,
        ttlSeconds: number
    ): Promise<void> {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
        await dbPool.query(`
            INSERT INTO auth_gateway.oauth_states (state_key, state_data, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (state_key) DO UPDATE SET
                state_data = $2,
                expires_at = $3,
                updated_at = NOW()
        `, [key, JSON.stringify(data), expiresAt])
    }

    static async get(token: string): Promise<StoredCSRFData | null> {
        const key = CSRF_KEY_PREFIX + token
        const client = getRedisClient()

        if (client) {
            try {
                if (await this.isRedisAvailable()) {
                    const cached = await client.get(key)
                    if (cached) {
                        return JSON.parse(cached) as StoredCSRFData
                    }
                }
            } catch {
                // Redis failed, fall through to database
            }
        }

        return this.getPostgres(key)
    }

    private static async getPostgres(key: string): Promise<StoredCSRFData | null> {
        const result = await dbPool.query(`
            SELECT state_data FROM auth_gateway.oauth_states
            WHERE state_key = $1 AND expires_at > NOW()
        `, [key])
        if (result.rows.length > 0) {
            const row = result.rows[0] as { state_data: string }
            return typeof row.state_data === 'string'
                ? JSON.parse(row.state_data) as StoredCSRFData
                : row.state_data as StoredCSRFData
        }
        return null
    }

    static async delete(token: string): Promise<void> {
        const key = CSRF_KEY_PREFIX + token
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
            await dbPool.query(
                'DELETE FROM auth_gateway.oauth_states WHERE state_key = $1',
                [key]
            )
        } catch (dbError) {
            logger.warn('Failed to delete CSRF token from database', { key, error: dbError })
        }
    }

    static async consume(token: string): Promise<StoredCSRFData | null> {
        const data = await this.get(token)
        if (data) {
            await this.delete(token)
        }
        return data
    }
}