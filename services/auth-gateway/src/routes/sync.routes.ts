/**
 * Sync Routes - Webhook endpoints for bidirectional Supabase ↔ Auth-Gateway sync
 *
 * These endpoints receive webhook calls from Supabase edge functions when entities
 * are created/updated, syncing hashed API keys to Auth-Gateway DB for validation.
 *
 * Architecture:
 * - Main DB (mxtsd***): Source of truth with raw + hashed keys
 * - Auth-Gateway DB (ptnrwr***): Only receives hashed keys for validation
 */

import { Router, type Request, type Response } from 'express'
import { dbPool } from '../../db/client.js'
import { appendEventWithOutbox } from '../services/event.service.js'

const router = Router()

// Default organization ID for API keys without explicit org
// This should match the default org in your system
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Webhook endpoint for API key sync from Supabase
 * Called by sync-api-key edge function when api_keys are created/updated/revoked
 *
 * POST /v1/sync/api-key
 * Headers: X-Webhook-Secret (for authentication)
 * Body: { event_type, id, user_id, organization_id, name, key_hash, access_level, permissions, expires_at, created_at, is_active }
 */
router.post('/api-key', async (req: Request, res: Response) => {
  try {
    // Verify webhook secret (REQUIRED in production)
    const webhookSecret = process.env.WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('CRITICAL: WEBHOOK_SECRET not configured - rejecting sync request')
      return res.status(500).json({ error: 'Server misconfiguration: webhook authentication not configured' })
    }
    if (req.headers['x-webhook-secret'] !== webhookSecret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const {
      event_type = 'INSERT',
      id,
      user_id,
      organization_id,  // ✅ Required - user's organization for RLS isolation
      name,
      key_hash,  // ✅ Now included from edge function
      access_level,
      permissions,
      expires_at,
      created_at,
      is_active = true,
      old_key_hash,  // For ROTATE events
    } = req.body

    if (!id || !user_id || !name) {
      return res.status(400).json({ error: 'Missing required fields: id, user_id, name' })
    }

    if (!key_hash) {
      console.warn(`API key sync received without key_hash for id=${id}`)
      return res.status(400).json({ error: 'Missing key_hash - cannot sync without hash' })
    }

    if (!organization_id) {
      console.warn(`API key sync received without organization_id for id=${id}`)
      return res.status(400).json({ error: 'Missing organization_id - required for RLS isolation' })
    }

    const client = await dbPool.connect()
    try {
      await client.query('BEGIN')

      // Determine event type for logging
      let eventType = 'ApiKeyCreated'
      if (event_type === 'REVOKE' || is_active === false) {
        eventType = 'ApiKeyRevoked'
      } else if (event_type === 'ROTATE') {
        eventType = 'ApiKeyRotated'
      } else if (event_type === 'UPDATE') {
        eventType = 'ApiKeyUpdated'
      }

      // ✅ INSERT/UPSERT into security_service.api_keys (Auth-Gateway DB)
      // This is the key fix - populating the secure table with hashed keys
      if (event_type === 'REVOKE' || is_active === false) {
        // Revoke: Set is_active to false
        await client.query(
          `
          UPDATE security_service.api_keys
          SET is_active = false
          WHERE id = $1::uuid
          `,
          [id]
        )
        console.log(`🔐 API key revoked in Auth-Gateway DB: ${id}`)
      } else {
        // Insert or Update (handles CREATE and ROTATE)
        await client.query(
          `
          INSERT INTO security_service.api_keys (
            id, name, key_hash, organization_id, user_id,
            permissions, expires_at, created_at, is_active
          ) VALUES (
            $1::uuid, $2, $3, $4::uuid, $5::uuid,
            $6::jsonb, $7::timestamptz, $8::timestamptz, $9
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            key_hash = EXCLUDED.key_hash,
            permissions = EXCLUDED.permissions,
            expires_at = EXCLUDED.expires_at,
            is_active = EXCLUDED.is_active
          `,
          [
            id,
            name,
            key_hash,
            organization_id,  // ✅ User's actual organization for proper RLS
            user_id,
            JSON.stringify(permissions || []),
            expires_at || null,
            created_at || new Date().toISOString(),
            is_active !== false,
          ]
        )
        console.log(`🔐 API key ${event_type === 'ROTATE' ? 'rotated' : 'synced'} to Auth-Gateway DB: ${id} (hash: ${key_hash.substring(0, 16)}...)`)
      }

      // Emit event for audit trail
      await appendEventWithOutbox(
        {
          aggregate_type: 'api_key',
          aggregate_id: id,
          event_type: eventType,
          payload: {
            user_id,
            access_level: access_level || 'authenticated',
            permissions: permissions || [],
            expires_at,
            name,
            created_at,
            is_active: is_active !== false,
            // Note: We don't store key_hash in events for security
          },
          metadata: {
            source: 'supabase-webhook',
            triggered_at: new Date().toISOString(),
            sync_type: event_type,
          },
        },
        client
      )

      await client.query('COMMIT')

      res.json({
        success: true,
        message: `API key ${eventType.replace('ApiKey', '').toLowerCase()} and synced to Auth-Gateway DB`,
        event_type: eventType,
        api_key_id: id,
        key_hash_stored: true,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Sync webhook error (api-key):', error)
    res.status(500).json({
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * Webhook endpoint for new users created in Supabase
 * Called by Supabase database webhook when simple_users INSERT occurs
 *
 * POST /v1/sync/user
 * Headers: X-Webhook-Secret (for authentication)
 * Body: { id, email, role, provider, metadata, last_sign_in_at }
 */
router.post('/user', async (req: Request, res: Response) => {
  try {
    // Verify webhook secret (REQUIRED in production)
    const webhookSecret = process.env.WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('CRITICAL: WEBHOOK_SECRET not configured - rejecting sync request')
      return res.status(500).json({ error: 'Server misconfiguration: webhook authentication not configured' })
    }
    if (req.headers['x-webhook-secret'] !== webhookSecret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { id, email, role, provider, metadata, last_sign_in_at } = req.body

    if (!id || !email) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const client = await dbPool.connect()
    try {
      await client.query('BEGIN')

      // Upsert into auth_gateway.user_accounts
      await client.query(
        `
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
        `,
        [id, email, role || 'authenticated', provider || 'email', metadata || {}, last_sign_in_at || null]
      )

      // Emit UserUpserted event
      await appendEventWithOutbox(
        {
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
        },
        client
      )

      await client.query('COMMIT')

      res.json({
        success: true,
        message: 'User synced to Neon event store',
        user_id: id,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Sync webhook error (user):', error)
    res.status(500).json({
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * Health check for sync webhooks
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'sync-webhooks',
    endpoints: ['/v1/sync/api-key', '/v1/sync/user'],
    features: {
      api_key_hash_sync: true,  // Now syncs key_hash to security_service.api_keys
      event_sourcing: true,
      audit_trail: true,
    },
    timestamp: new Date().toISOString(),
  })
})

/**
 * Backfill endpoint - Sync all existing API keys to Auth-Gateway DB
 * POST /v1/sync/backfill-api-keys
 * Headers: X-Webhook-Secret (for authentication)
 *
 * This is a one-time operation to populate Auth-Gateway DB with existing keys
 */
router.post('/backfill-api-keys', async (req: Request, res: Response) => {
  try {
    // Verify webhook secret
    const webhookSecret = process.env.WEBHOOK_SECRET
    if (!webhookSecret) {
      return res.status(500).json({ error: 'Server misconfiguration' })
    }
    if (req.headers['x-webhook-secret'] !== webhookSecret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // This endpoint expects the keys to be passed from a secure source
    const { keys } = req.body

    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: 'Missing keys array in request body' })
    }

    const client = await dbPool.connect()
    let synced = 0
    let failed = 0

    try {
      for (const key of keys) {
        try {
          await client.query(
            `
            INSERT INTO security_service.api_keys (
              id, name, key_hash, organization_id, user_id,
              permissions, expires_at, created_at, is_active
            ) VALUES (
              $1::uuid, $2, $3, $4::uuid, $5::uuid,
              $6::jsonb, $7::timestamptz, $8::timestamptz, $9
            )
            ON CONFLICT (id) DO UPDATE SET
              key_hash = EXCLUDED.key_hash,
              is_active = EXCLUDED.is_active
            `,
            [
              key.id,
              key.name,
              key.key_hash,
              key.organization_id,  // ✅ User's actual organization
              key.user_id,
              JSON.stringify(key.permissions || []),
              key.expires_at || null,
              key.created_at || new Date().toISOString(),
              key.is_active !== false,
            ]
          )
          synced++
        } catch (err) {
          console.error(`Failed to sync key ${key.id}:`, err)
          failed++
        }
      }

      res.json({
        success: true,
        message: `Backfill complete: ${synced} synced, ${failed} failed`,
        synced,
        failed,
        total: keys.length,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Backfill error:', error)
    res.status(500).json({
      error: 'Backfill failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
