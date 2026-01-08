import { setTimeout as delay } from 'node:timers/promises';
import { supabaseAdmin } from '../../db/client.js';
import { fetchPendingOutbox, markOutboxFailed, markOutboxSent, } from '../services/event.service.js';
const MAX_BATCH_SIZE = 50;
const MAX_RETRIES = 5;
async function deliverToSupabase(row) {
    const { error } = await supabaseAdmin.from('auth_events').upsert({
        event_id: row.event_id,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_id,
        version: row.version,
        event_type: row.event_type,
        event_type_version: row.event_type_version ?? 1,
        payload: row.payload ?? {},
        metadata: row.metadata ?? {},
        occurred_at: row.occurred_at,
    });
    if (error) {
        throw new Error(error.message);
    }
}
async function processBatch() {
    const rows = await fetchPendingOutbox(MAX_BATCH_SIZE);
    if (rows.length === 0) {
        console.log('Outbox forwarder: no pending events');
        return;
    }
    console.log(`Outbox forwarder: delivering ${rows.length} event(s)`);
    for (const row of rows) {
        try {
            if (row.destination === 'supabase') {
                await deliverToSupabase(row);
            }
            else {
                throw new Error(`Unsupported destination ${row.destination}`);
            }
            await markOutboxSent(row.outbox_id);
            console.log(`Outbox forwarder: delivered event ${row.event_id} -> ${row.destination}`);
        }
        catch (error) {
            const attempts = row.attempts + 1;
            const backoff = Math.min(300, Math.pow(2, attempts)); // cap at 5 minutes
            await markOutboxFailed(row.outbox_id, error instanceof Error ? error.message : String(error), backoff);
            console.warn(`Outbox forwarder: failed event ${row.event_id} (attempt ${attempts}/${MAX_RETRIES}):`, error instanceof Error ? error.message : error);
            if (attempts >= MAX_RETRIES) {
                console.error(`Outbox forwarder: giving up on event ${row.event_id} after ${attempts} attempts`);
            }
        }
    }
}
async function main() {
    try {
        await processBatch();
    }
    catch (error) {
        console.error('Outbox forwarder encountered an unrecoverable error:', error);
        process.exitCode = 1;
    }
    finally {
        // Small delay to allow async logs to flush in some environments
        await delay(10);
    }
}
main();
