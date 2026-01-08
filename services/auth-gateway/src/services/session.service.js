import { dbPool } from '../../db/client.js';
import { appendEventWithOutbox } from './event.service.js';
import crypto from 'node:crypto';
/**
 * Hash token for secure storage
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
/**
 * Create a new session
 */
export async function createSession(params) {
    const client = await dbPool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
        INSERT INTO auth_gateway.sessions (
          user_id, platform, token_hash, refresh_token_hash,
          client_id, scope, ip_address, user_agent,
          expires_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
            params.user_id,
            params.platform,
            hashToken(params.access_token),
            params.refresh_token ? hashToken(params.refresh_token) : null,
            params.client_id || null,
            params.scope || null,
            params.ip_address || null,
            params.user_agent || null,
            params.expires_at,
            params.metadata || {},
        ]);
        const session = result.rows[0];
        await appendEventWithOutbox({
            aggregate_type: 'session',
            aggregate_id: session.id,
            event_type: 'SessionCreated',
            payload: {
                user_id: session.user_id,
                platform: session.platform,
                scope: session.scope,
                expires_at: session.expires_at,
            },
            metadata: {
                ip_address: session.ip_address,
                user_agent: session.user_agent,
            },
        }, client);
        await client.query('COMMIT');
        return session;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * Find session by access token
 */
export async function findSessionByToken(token) {
    const client = await dbPool.connect();
    try {
        const result = await client.query(`
      SELECT * FROM auth_gateway.sessions
      WHERE token_hash = $1
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `, [hashToken(token)]);
        return result.rows[0] || null;
    }
    finally {
        client.release();
    }
}
/**
 * Update session last_used_at timestamp
 */
export async function touchSession(sessionId) {
    const client = await dbPool.connect();
    try {
        await client.query(`
      UPDATE auth_gateway.sessions
      SET last_used_at = NOW()
      WHERE id = $1
      `, [sessionId]);
    }
    finally {
        client.release();
    }
}
/**
 * Revoke session by token
 */
export async function revokeSession(token) {
    const client = await dbPool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
        DELETE FROM auth_gateway.sessions
        WHERE token_hash = $1
        RETURNING id, user_id, platform, scope, expires_at
      `, [hashToken(token)]);
        const deleted = result.rows[0];
        if (!deleted) {
            await client.query('COMMIT');
            return false;
        }
        await appendEventWithOutbox({
            aggregate_type: 'session',
            aggregate_id: deleted.id,
            event_type: 'SessionRevoked',
            payload: {
                user_id: deleted.user_id,
                platform: deleted.platform,
                scope: deleted.scope,
                expires_at: deleted.expires_at,
            },
        }, client);
        await client.query('COMMIT');
        return true;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * Revoke all sessions for a user
 */
export async function revokeAllUserSessions(userId) {
    const client = await dbPool.connect();
    try {
        const result = await client.query(`
      DELETE FROM auth_gateway.sessions
      WHERE user_id = $1
      RETURNING id
      `, [userId]);
        return result.rowCount ?? 0;
    }
    finally {
        client.release();
    }
}
/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions() {
    const client = await dbPool.connect();
    try {
        const result = await client.query(`
      DELETE FROM auth_gateway.sessions
      WHERE expires_at < NOW()
      RETURNING id
      `);
        return result.rowCount ?? 0;
    }
    finally {
        client.release();
    }
}
/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId) {
    const client = await dbPool.connect();
    try {
        const result = await client.query(`
      SELECT * FROM auth_gateway.sessions
      WHERE user_id = $1
        AND expires_at > NOW()
      ORDER BY last_used_at DESC
      `, [userId]);
        return result.rows;
    }
    finally {
        client.release();
    }
}
