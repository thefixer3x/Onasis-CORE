import { dbPool } from '../../db/client.js';
import { appendEventWithOutbox } from './event.service.js';
export async function upsertUserAccount(params) {
    const client = await dbPool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
        INSERT INTO auth_gateway.user_accounts (
          user_id,
          email,
          role,
          provider,
          raw_metadata,
          last_sign_in_at
        ) VALUES ($1, LOWER($2), $3, $4, $5, $6::timestamptz)
        ON CONFLICT (user_id) DO UPDATE SET
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          provider = EXCLUDED.provider,
          raw_metadata = EXCLUDED.raw_metadata,
          last_sign_in_at = COALESCE(EXCLUDED.last_sign_in_at, auth_gateway.user_accounts.last_sign_in_at),
          updated_at = NOW()
        RETURNING *
      `, [
            params.user_id,
            params.email,
            params.role,
            params.provider ?? null,
            params.raw_metadata ?? {},
            params.last_sign_in_at ?? null,
        ]);
        const user = result.rows[0];
        await appendEventWithOutbox({
            aggregate_type: 'user',
            aggregate_id: user.user_id,
            event_type: 'UserUpserted',
            payload: {
                email: user.email,
                role: user.role,
                provider: user.provider,
                last_sign_in_at: user.last_sign_in_at,
            },
            metadata: {
                source: 'auth-gateway',
            },
        }, client);
        await client.query('COMMIT');
        return user;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function findUserAccountById(userId) {
    const client = await dbPool.connect();
    try {
        const result = await client.query(`
      SELECT * FROM auth_gateway.user_accounts
      WHERE user_id = $1
      LIMIT 1
      `, [userId]);
        return result.rows[0] ?? null;
    }
    finally {
        client.release();
    }
}
