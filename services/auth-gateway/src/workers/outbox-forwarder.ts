import { setTimeout as delay } from 'node:timers/promises'
import { supabaseUsers } from '../../db/client.js'
import { env } from '../../config/env.js'
import {
  fetchPendingOutbox,
  markOutboxFailed,
  markOutboxSent,
  type PendingOutboxRow,
} from '../services/event.service.js'

const MAX_BATCH_SIZE = 50
const MAX_RETRIES = 5

/**
 * Validate required credentials before starting
 */
function validateCredentials(): void {
  if (!env.MAIN_SUPABASE_URL || !env.MAIN_SUPABASE_SERVICE_ROLE_KEY) {
    console.error('═══════════════════════════════════════════════════════════════')
    console.error('❌ OUTBOX FORWARDER MISCONFIGURED')
    console.error('═══════════════════════════════════════════════════════════════')
    console.error('')
    console.error('Missing required environment variables:')
    console.error('  - MAIN_SUPABASE_URL')
    console.error('  - MAIN_SUPABASE_SERVICE_ROLE_KEY')
    console.error('')
    console.error('The outbox forwarder needs Main DB credentials to project events.')
    console.error('Without these, events will be written to the wrong database!')
    console.error('')
    console.error('Add to your .env:')
    console.error('  MAIN_SUPABASE_URL=<your-main-db-url>')
    console.error('  MAIN_SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>')
    console.error('═══════════════════════════════════════════════════════════════')
    process.exit(1)
  }

  console.log('✓ Outbox forwarder credentials validated')
  console.log(`  Target: Main DB (${env.MAIN_SUPABASE_URL})`)
}

/**
 * Forward event to Main DB (mxtsdgkwzjzlttpotole.supabase.co)
 *
 * This projects auth events from Auth-Gateway DB to Main DB's auth_events table
 * for consumption by dashboards, Netlify functions, and other read-side consumers.
 *
 * IMPORTANT: Uses supabaseUsers (Main DB), NOT supabaseAdmin (Auth-Gateway DB)
 */
async function deliverToSupabase(row: PendingOutboxRow) {
  const { error } = await supabaseUsers.from('auth_events').upsert({
    event_id: row.event_id,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    version: row.version,
    event_type: row.event_type,
    event_type_version: row.event_type_version ?? 1,
    payload: row.payload ?? {},
    metadata: row.metadata ?? {},
    occurred_at: row.occurred_at,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function processBatch() {
  const rows = await fetchPendingOutbox(MAX_BATCH_SIZE)

  if (rows.length === 0) {
    console.log('Outbox forwarder: no pending events')
    return
  }

  console.log(`Outbox forwarder: delivering ${rows.length} event(s)`)

  for (const row of rows) {
    try {
      if (row.destination === 'supabase') {
        await deliverToSupabase(row)
      } else {
        throw new Error(`Unsupported destination ${row.destination}`)
      }

      await markOutboxSent(row.outbox_id)
      console.log(`Outbox forwarder: delivered event ${row.event_id} -> ${row.destination}`)
    } catch (error) {
      const attempts = row.attempts + 1
      const backoff = Math.min(300, Math.pow(2, attempts)) // cap at 5 minutes
      await markOutboxFailed(
        row.outbox_id,
        error instanceof Error ? error.message : String(error),
        backoff
      )

      console.warn(
        `Outbox forwarder: failed event ${row.event_id} (attempt ${attempts}/${MAX_RETRIES}):`,
        error instanceof Error ? error.message : error
      )

      if (attempts >= MAX_RETRIES) {
        console.error(`Outbox forwarder: giving up on event ${row.event_id} after ${attempts} attempts`)
      }
    }
  }
}

async function main() {
  // Validate credentials before processing
  validateCredentials()

  try {
    await processBatch()
  } catch (error) {
    console.error('Outbox forwarder encountered an unrecoverable error:', error)
    process.exitCode = 1
  } finally {
    // Small delay to allow async logs to flush in some environments
    await delay(10)
  }
}

main()
