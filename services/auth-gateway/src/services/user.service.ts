import { dbPool } from '../../db/client.js'

export interface UpsertUserAccountParams {
  user_id: string
  email: string
  role: string
  provider?: string | null
  raw_metadata?: Record<string, unknown> | null
  last_sign_in_at?: string | null
}

export interface UserAccount {
  user_id: string
  email: string
  role: string
  provider: string | null
  raw_metadata: Record<string, unknown> | null
  created_at: string
  last_sign_in_at: string | null
  updated_at: string
}

export async function upsertUserAccount(params: UpsertUserAccountParams): Promise<UserAccount> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
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
      `,
      [
        params.user_id,
        params.email,
        params.role,
        params.provider ?? null,
        params.raw_metadata ?? {},
        params.last_sign_in_at ?? null,
      ]
    )

    return result.rows[0] as UserAccount
  } finally {
    client.release()
  }
}

export async function findUserAccountById(userId: string): Promise<UserAccount | null> {
  const client = await dbPool.connect()
  try {
    const result = await client.query(
      `
      SELECT * FROM auth_gateway.user_accounts
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    )

    return (result.rows[0] as UserAccount) ?? null
  } finally {
    client.release()
  }
}
