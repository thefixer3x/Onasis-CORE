import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

/**
 * Enhanced token hashing using bcrypt for security-critical tokens
 * Replaces SHA-256 with proper password hashing algorithms
 */

// Configurable bcrypt rounds (default: 12 for production)
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12

/**
 * Hash sensitive tokens using bcrypt
 * Use for refresh tokens, authorization codes, and other sensitive tokens
 */
export async function hashSensitiveToken(token: string): Promise<string> {
    return bcrypt.hash(token, BCRYPT_ROUNDS)
}

/**
 * Verify hashed sensitive token
 */
export async function verifySensitiveToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash)
}

/**
 * Hash less sensitive tokens with SHA-256 (for performance)
 * Use for session tokens, CSRF tokens, etc.
 */
export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
}/**
 * Enhanced authorization code hashing with bcrypt
 * Authorization codes are security-critical and should use slow hashing
 */
export async function hashAuthorizationCode(code: string): Promise<string> {
    return hashSensitiveToken(code)
}

/**
 * Verify authorization code against hash
 */
export async function verifyAuthorizationCode(code: string, hash: string): Promise<boolean> {
    return verifySensitiveToken(code, hash)
}

/**
 * Enhanced refresh token hashing
 * Refresh tokens have long lifetimes and need maximum security
 */
export async function hashRefreshToken(token: string): Promise<string> {
    return hashSensitiveToken(token)
}

/**
 * Verify refresh token against hash
 */
export async function verifyRefreshToken(token: string, hash: string): Promise<boolean> {
    return verifySensitiveToken(token, hash)
}

/**
 * Migration utility: Convert existing SHA-256 hashes to bcrypt
 * Run this during deployment to upgrade existing tokens
 */
export interface TokenMigrationResult {
    migrated: number
    failed: number
    errors: string[]
}

export async function migrateTokenHashes(): Promise<TokenMigrationResult> {
    const { dbPool } = await import('../../db/client.js')

    const result: TokenMigrationResult = {
        migrated: 0,
        failed: 0,
        errors: []
    }

    try {
        // Migrate authorization codes
        const authCodes = await dbPool.query(
            'SELECT id, code_hash FROM auth_gateway.oauth_authorization_codes WHERE code_hash IS NOT NULL'
        )

        for (const row of authCodes.rows) {
            try {
                // Skip if already bcrypt hashed (starts with $2b$)
                if (row.code_hash.startsWith('$2b$')) {
                    continue
                }

                // Cannot reverse SHA-256, so mark for regeneration
                await dbPool.query(
                    'UPDATE auth_gateway.oauth_authorization_codes SET code_hash = NULL, migration_required = TRUE WHERE id = $1',
                    [row.id]
                )
                result.migrated++
            } catch (error) {
                result.failed++
                result.errors.push(`Auth code ${row.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
        }

        // Migrate refresh tokens (similar approach)
        const refreshTokens = await dbPool.query(
            'SELECT id, token_hash FROM auth_gateway.oauth_tokens WHERE token_type = \'refresh\' AND token_hash IS NOT NULL'
        )

        for (const row of refreshTokens.rows) {
            try {
                if (row.token_hash.startsWith('$2b$')) {
                    continue
                }

                await dbPool.query(
                    'UPDATE auth_gateway.oauth_tokens SET token_hash = NULL, migration_required = TRUE WHERE id = $1',
                    [row.id]
                )
                result.migrated++
            } catch (error) {
                result.failed++
                result.errors.push(`Refresh token ${row.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
        }

    } catch (error) {
        result.errors.push(`Migration error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    return result
}