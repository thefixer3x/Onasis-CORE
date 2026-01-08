/**
 * Sync Routes - Webhook endpoints for bidirectional Supabase ↔ Neon sync
 *
 * OPTION 1 FALLBACK: Database webhooks from Supabase
 *
 * These endpoints receive webhook calls from Supabase when entities are created/updated
 * in the dashboard, ensuring Neon stays in sync with Supabase changes.
 */
import { Router } from 'express';
import { dbPool } from '../../db/client.js';
import { appendEventWithOutbox } from '../services/event.service.js';
const router = Router();
/**
 * Webhook endpoint for new API keys created in Supabase
 * Called by Supabase database webhook when api_keys INSERT occurs
 *
 * POST /v1/sync/api-key
 * Headers: X-Webhook-Secret (for authentication)
 * Body: { id, user_id, name, access_level, expires_at, created_at }
 */
router.post('/api-key', async (req, res) => {
    try {
        // Verify webhook secret (REQUIRED in production)
        const webhookSecret = process.env.WEBHOOK_SECRET=REDACTED_WEBHOOK_SECRET
        if (!webhookSecret) {
            console.error('CRITICAL: WEBHOOK_SECRET=REDACTED_WEBHOOK_SECRET
            return res.status(500).json({ error: 'Server misconfiguration: webhook authentication not configured' });
        }
        if (req.headers['x-webhook-secret'] !== webhookSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { id, user_id, name, access_level, expires_at, created_at } = req.body;
        if (!id || !user_id || !name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');
            // Emit ApiKeyCreated event
            await appendEventWithOutbox({
                aggregate_type: 'api_key',
                aggregate_id: id,
                event_type: 'ApiKeyCreated',
                payload: {
                    user_id,
                    access_level: access_level || 'authenticated',
                    expires_at,
                    name,
                    created_at,
                },
                metadata: {
                    source: 'supabase-webhook',
                    triggered_at: new Date().toISOString(),
                },
            }, client);
            await client.query('COMMIT');
            res.json({
                success: true,
                message: 'API key synced to Neon event store',
                event_id: id,
            });
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        console.error('Sync webhook error (api-key):', error);
        res.status(500).json({
            error: 'Failed to process webhook',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * Webhook endpoint for new users created in Supabase
 * Called by Supabase database webhook when simple_users INSERT occurs
 *
 * POST /v1/sync/user
 * Headers: X-Webhook-Secret (for authentication)
 * Body: { id, email, role, provider, metadata, last_sign_in_at }
 */
router.post('/user', async (req, res) => {
    try {
        // Verify webhook secret (REQUIRED in production)
        const webhookSecret = process.env.WEBHOOK_SECRET=REDACTED_WEBHOOK_SECRET
        if (!webhookSecret) {
            console.error('CRITICAL: WEBHOOK_SECRET=REDACTED_WEBHOOK_SECRET
            return res.status(500).json({ error: 'Server misconfiguration: webhook authentication not configured' });
        }
        if (req.headers['x-webhook-secret'] !== webhookSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { id, email, role, provider, metadata, last_sign_in_at } = req.body;
        if (!id || !email) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');
            // Upsert into auth_gateway.user_accounts
            await client.query(`
          INSERT INTO auth_gateway.user_accounts (
            user_id, email, role, provider, raw_metadata, last_sign_in_at
          ) VALUES ($1, LOWER($2), $3, $4, $5, $6::timestamptz)
          ON CONFLICT (user_id) DO UPDATE SET
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            provider = EXCLUDED.provider,
            raw_metadata = EXCLUDED.raw_metadata,
            last_sign_in_at = COALESCE(EXCLUDED.last_sign_in_at, auth_gateway.user_accounts.last_sign_in_at),
            updated_at = NOW()
        `, [id, email, role || 'authenticated', provider || 'email', metadata || {}, last_sign_in_at || null]);
            // Emit UserUpserted event
            await appendEventWithOutbox({
                aggregate_type: 'user',
                aggregate_id: id,
                event_type: 'UserUpserted',
                payload: {
                    email,
                    role: role || 'authenticated',
                    provider: provider || 'email',
                    last_sign_in_at,
                },
                metadata: {
                    source: 'supabase-webhook',
                    triggered_at: new Date().toISOString(),
                },
            }, client);
            await client.query('COMMIT');
            res.json({
                success: true,
                message: 'User synced to Neon event store',
                user_id: id,
            });
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        console.error('Sync webhook error (user):', error);
        res.status(500).json({
            error: 'Failed to process webhook',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * Health check for sync webhooks
 */
router.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'sync-webhooks',
        endpoints: ['/v1/sync/api-key', '/v1/sync/user'],
        timestamp: new Date().toISOString(),
    });
});
export default router;
