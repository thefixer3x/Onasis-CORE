import { dbPool } from '../../db/client.js'
import {
    CodeChallengeMethod,
    generateOpaqueToken,
    hashAuthorizationCode,
    hashToken,
} from '../utils/pkce.js'
import { OAuthClientCache, AuthCodeCache } from './cache.service.js'

// Token TTLs can be configured via environment variables.
// AUTH_CODE_TTL_SECONDS: Authorization code lifetime in seconds (default: 300)
// ACCESS_TOKEN_TTL_SECONDS: Access token lifetime in seconds (default: 900)
// REFRESH_TOKEN_TTL_SECONDS: Refresh token lifetime in seconds (default: 2592000)
const AUTH_CODE_TTL_SECONDS = Number(process.env.AUTH_CODE_TTL_SECONDS) || 5 * 60
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 15 * 60
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 30 * 24 * 60 * 60

export type OAuthStatus = 'active' | 'inactive' | 'revoked'
export type OAuthClientType = 'public' | 'confidential'
export type ApplicationType = 'native' | 'cli' | 'mcp' | 'web' | 'server'

export interface OAuthClient {
    id: string
    client_id: string
    client_name: string
    client_type: OAuthClientType
    application_type?: ApplicationType // Optional for backward compatibility
    require_pkce: boolean
    allowed_code_challenge_methods: CodeChallengeMethod[] | null
    allowed_redirect_uris: string[] | null
    allowed_scopes: string[] | null
    default_scopes: string[] | null
    status: OAuthStatus
    description: string | null
    created_at: Date
    updated_at: Date
    created_by: string | null
}

export interface AuthorizationCodeRecord {
    id: string
    code_hash: string
    client_id: string
    user_id: string
    code_challenge: string
    code_challenge_method: CodeChallengeMethod
    redirect_uri: string
    scope: string[] | null
    state: string | null
    expires_at: Date
    consumed: boolean
    consumed_at: Date | null
    created_at: Date
    ip_address: string | null
    user_agent: string | null
}

export interface TokenRecord {
    id: string
    token_hash: string
    token_type: 'access' | 'refresh'
    client_id: string
    user_id: string
    scope: string[] | null
    expires_at: Date
    revoked: boolean
    revoked_at: Date | null
    revoked_reason: string | null
    created_at: Date
    last_used_at: Date | null
    ip_address: string | null
    user_agent: string | null
    parent_token_id: string | null
}

export interface OAuthAuditEvent {
    event_type: string
    client_id?: string
    user_id?: string
    ip_address?: string
    user_agent?: string
    scope?: string[]
    redirect_uri?: string
    grant_type?: string
    success: boolean
    error_code?: string
    error_description?: string
    metadata?: Record<string, unknown>
}

export class OAuthServiceError extends Error {
    constructor(
        message: string,
        public readonly oauthError: string = 'invalid_request',
        public readonly statusCode: number = 400
    ) {
        super(message)
        this.name = 'OAuthServiceError'
    }
}

interface DbClient {
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>
    release: () => void
}

type TransactionCallback<T> = (client: DbClient) => Promise<T>

async function withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
    const client = (await dbPool.connect()) as unknown as DbClient
    try {
        await client.query('BEGIN')
        const result = await callback(client)
        await client.query('COMMIT')
        return result
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
    }
}

function arrayOrNull(value?: string[] | null): string[] | null {
    if (!value || value.length === 0) {
        return null
    }
    return value
}

function ensureClientActive(client: OAuthClient | null): asserts client is OAuthClient {
    if (!client) {
        throw new OAuthServiceError('OAuth client not found', 'invalid_client', 400)
    }
    if (client.status !== 'active') {
        throw new OAuthServiceError('OAuth client is not active', 'invalid_client', 403)
    }
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
    // Try cache first
    const cached = await OAuthClientCache.get(clientId)
    if (cached) {
        return cached as OAuthClient
    }

    // Cache miss - fetch from database
    const result = await dbPool.query('SELECT * FROM auth_gateway.oauth_clients WHERE LOWER(client_id) = LOWER($1)', [clientId])
    const client = (result.rows[0] as OAuthClient | undefined) ?? null

    // Cache the result (including null to prevent repeated DB queries)
    if (client) {
        await OAuthClientCache.set(clientId, client as unknown as Record<string, unknown>, 3600) // 1 hour TTL
    }

    return client
}

// Standard MCP scopes that are auto-allowed for public MCP clients
// This enables plug-and-play experience without requiring database updates
const MCP_AUTO_ALLOWED_SCOPES = [
    'mcp:full',
    'mcp:tools',
    'mcp:resources',
    'mcp:prompts',
    'mcp:connect',
    'api:access',
    'memories:read',
    'memories:write',
    'memories:delete',
    'profile'
]

export function resolveScopes(client: OAuthClient, requested?: string[]): string[] {
    const normalizedRequested = requested?.filter(Boolean) ?? []
    const allowed = client.allowed_scopes ?? []
    const defaults = client.default_scopes ?? []

    if (normalizedRequested.length === 0) {
        return defaults.length ? defaults : []
    }

    if (allowed.length === 0) {
        throw new OAuthServiceError('Client has no allowed scopes configured', 'invalid_scope', 400)
    }

    // For public MCP clients, auto-allow standard MCP scopes for plug-and-play experience
    const isPublicMcpClient = client.client_type === 'public' && (
        client.application_type === 'mcp' ||
        client.description?.includes('MCP') ||
        client.client_name?.includes('MCP')
    )

    const effectiveAllowed = isPublicMcpClient
        ? [...new Set([...allowed, ...MCP_AUTO_ALLOWED_SCOPES])]
        : allowed

    const unauthorized = normalizedRequested.filter((scope) => !effectiveAllowed.includes(scope))
    if (unauthorized.length > 0) {
        throw new OAuthServiceError(
            `Requested scope not allowed: ${unauthorized.join(', ')}`,
            'invalid_scope',
            400
        )
    }
    return normalizedRequested
}

export function isRedirectUriAllowed(client: OAuthClient, redirectUri: string): boolean {
    return client.allowed_redirect_uris?.includes(redirectUri) ?? false
}

export function isChallengeMethodAllowed(
    client: OAuthClient,
    method: CodeChallengeMethod
): boolean {
    if (!client.require_pkce) {
        return true
    }
    return client.allowed_code_challenge_methods?.includes(method) ?? false
}

export interface CreateAuthorizationCodeParams {
    client: OAuthClient
    userId: string
    redirectUri: string
    scope: string[]
    state?: string
    codeChallenge: string
    codeChallengeMethod: CodeChallengeMethod
    ipAddress?: string
    userAgent?: string
}

export interface AuthorizationCodeResult {
    authorizationCode: string
    record: AuthorizationCodeRecord
}

export async function createAuthorizationCode(
    params: CreateAuthorizationCodeParams
): Promise<AuthorizationCodeResult> {
    ensureClientActive(params.client)

    const authorizationCode = generateOpaqueToken(48)
    const hashedCode = hashAuthorizationCode(authorizationCode)
    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000)

    const result = await dbPool.query(
        `
      INSERT INTO auth_gateway.oauth_authorization_codes (
        code_hash, client_id, user_id, code_challenge, code_challenge_method,
        redirect_uri, scope, state, expires_at, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `,
        [
            hashedCode,
            params.client.client_id,
            params.userId,
            params.codeChallenge,
            params.codeChallengeMethod,
            params.redirectUri,
            arrayOrNull(params.scope),
            params.state || null,
            expiresAt,
            params.ipAddress || null,
            params.userAgent || null,
        ]
    )

    const record = result.rows[0] as AuthorizationCodeRecord

    // Cache the authorization code for quick lookup
    await AuthCodeCache.set(hashedCode, record as unknown as Record<string, unknown>, AUTH_CODE_TTL_SECONDS)

    return {
        authorizationCode,
        record,
    }
}

export interface ConsumeAuthorizationCodeParams {
    client: OAuthClient
    code: string
    redirectUri?: string
}

export async function consumeAuthorizationCode(
    params: ConsumeAuthorizationCodeParams
): Promise<AuthorizationCodeRecord> {
    ensureClientActive(params.client)

    const hashedCode = hashAuthorizationCode(params.code)

    // Check cache first for fast path validation (non-authoritative)
    const cached = await AuthCodeCache.get(hashedCode)
    if (!cached) {
        // Code not in cache - likely expired or already consumed
        throw new OAuthServiceError('Authorization code not found or expired', 'invalid_grant', 400)
    }

    return withTransaction(async (client) => {
        const selectResult = await client.query(
            `
        SELECT * FROM auth_gateway.oauth_authorization_codes
        WHERE code_hash = $1
        FOR UPDATE
      `,
            [hashedCode]
        )

        if (selectResult.rowCount === 0) {
            // Remove stale cache entry
            await AuthCodeCache.consume(hashedCode)
            throw new OAuthServiceError('Authorization code not found', 'invalid_grant', 400)
        }

        const record = selectResult.rows[0] as AuthorizationCodeRecord

        if (record.client_id !== params.client.client_id) {
            throw new OAuthServiceError('Authorization code does not belong to client', 'invalid_grant', 400)
        }

        if (params.redirectUri && record.redirect_uri !== params.redirectUri) {
            throw new OAuthServiceError('Redirect URI mismatch', 'invalid_grant', 400)
        }

        if (record.consumed) {
            throw new OAuthServiceError('Authorization code already used', 'invalid_grant', 400)
        }

        if (record.expires_at.getTime() <= Date.now()) {
            await client.query('DELETE FROM auth_gateway.oauth_authorization_codes WHERE id = $1', [record.id])
            throw new OAuthServiceError('Authorization code expired', 'invalid_grant', 400)
        }

        const updateResult = await client.query(
            `
        UPDATE auth_gateway.oauth_authorization_codes
        SET consumed = TRUE, consumed_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
            [record.id]
        )

        // Invalidate cache after consuming
        await AuthCodeCache.consume(hashedCode)

        return updateResult.rows[0] as AuthorizationCodeRecord
    })
}

interface TokenInsertConfig {
    clientId: string
    userId: string
    scope: string[]
    ipAddress?: string
    userAgent?: string
    parentTokenId?: string | null
}

interface GeneratedToken {
    value: string
    record: TokenRecord
}

async function insertToken(
    client: DbClient,
    tokenType: 'access' | 'refresh',
    config: TokenInsertConfig,
    expiresAt: Date
): Promise<GeneratedToken> {
    const tokenValue = generateOpaqueToken(tokenType === 'refresh' ? 64 : 48)
    const hashedValue = hashToken(tokenValue)

    const result = await client.query(
        `
      INSERT INTO auth_gateway.oauth_tokens (
        token_hash, token_type, client_id, user_id, scope,
        expires_at, ip_address, user_agent, parent_token_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
        [
            hashedValue,
            tokenType,
            config.clientId,
            config.userId,
            arrayOrNull(config.scope),
            expiresAt,
            config.ipAddress || null,
            config.userAgent || null,
            config.parentTokenId || null,
        ]
    )

    return {
        value: tokenValue,
        record: result.rows[0] as TokenRecord,
    }
}

export interface IssueTokenPairParams {
    client: OAuthClient
    userId: string
    scope: string[]
    ipAddress?: string
    userAgent?: string
}

export interface IssuedTokenPair {
    accessToken: GeneratedToken
    refreshToken: GeneratedToken
    accessTokenExpiresIn: number
    refreshTokenExpiresIn: number
}

export async function issueTokenPair(
    params: IssueTokenPairParams
): Promise<IssuedTokenPair> {
    ensureClientActive(params.client)

    return withTransaction(async (client) => {
        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
        const refreshToken = await insertToken(
            client,
            'refresh',
            {
                clientId: params.client.client_id,
                userId: params.userId,
                scope: params.scope,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                parentTokenId: null,
            },
            refreshExpiresAt
        )

        const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000)
        const accessToken = await insertToken(
            client,
            'access',
            {
                clientId: params.client.client_id,
                userId: params.userId,
                scope: params.scope,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                parentTokenId: refreshToken.record.id,
            },
            accessExpiresAt
        )

        return {
            accessToken,
            refreshToken,
            accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
            refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
        }
    })
}

export async function findRefreshToken(
    token: string,
    clientId: string
): Promise<TokenRecord | null> {
    const hashed = hashToken(token)
    const result = await dbPool.query(
        `
      SELECT * FROM auth_gateway.oauth_tokens
      WHERE token_hash = $1
        AND token_type = 'refresh'
        AND client_id = $2
        AND revoked = FALSE
    `,
        [hashed, clientId]
    )

    const record = (result.rows[0] as TokenRecord | undefined) ?? null
    if (!record) {
        return null
    }

    if (record.expires_at.getTime() <= Date.now()) {
        // Revoke the entire chain when an expired refresh token is encountered
        await revokeTokenChain(record.id, 'expired')
        return null
    }

    return record
}

export async function revokeTokenById(id: string, reason = 'revoked'): Promise<boolean> {
    const result = await dbPool.query(
        `
      UPDATE auth_gateway.oauth_tokens
      SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
      WHERE id = $1 AND revoked = FALSE
    `,
        [id, reason]
    )
    return (result.rowCount ?? 0) > 0
}

export async function revokeTokenChain(
    rootTokenId: string,
    reason = 'revoked'
): Promise<void> {
    await dbPool.query(
        `
            WITH RECURSIVE token_tree AS (
                SELECT id FROM auth_gateway.oauth_tokens WHERE id = $1
                UNION
                SELECT t.id FROM auth_gateway.oauth_tokens t
                INNER JOIN token_tree tt ON t.parent_token_id = tt.id
            )
            UPDATE auth_gateway.oauth_tokens
            SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
            WHERE id IN (SELECT id FROM token_tree) AND revoked = FALSE
        `,
        [rootTokenId, reason]
    )
}

export interface RotateRefreshTokenParams {
    existingToken: TokenRecord
    client: OAuthClient
    scope?: string[]
    ipAddress?: string
    userAgent?: string
}

export async function rotateRefreshToken(
    params: RotateRefreshTokenParams
): Promise<IssuedTokenPair> {
    ensureClientActive(params.client)

    return withTransaction(async (client) => {
        await client.query(
            `
        UPDATE auth_gateway.oauth_tokens
        SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'rotated'
        WHERE id = $1 AND revoked = FALSE
      `,
            [params.existingToken.id]
        )

        await client.query(
            `
        UPDATE auth_gateway.oauth_tokens
        SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'ancestor_rotated'
        WHERE parent_token_id = $1 AND revoked = FALSE
      `,
            [params.existingToken.id]
        )

        const scope = params.scope?.length ? params.scope : params.existingToken.scope ?? []

        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
        const refreshToken = await insertToken(
            client,
            'refresh',
            {
                clientId: params.client.client_id,
                userId: params.existingToken.user_id,
                scope,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                parentTokenId: params.existingToken.id,
            },
            refreshExpiresAt
        )

        const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000)
        const accessToken = await insertToken(
            client,
            'access',
            {
                clientId: params.client.client_id,
                userId: params.existingToken.user_id,
                scope,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                parentTokenId: refreshToken.record.id,
            },
            accessExpiresAt
        )

        return {
            accessToken,
            refreshToken,
            accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
            refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
        }
    })
}

export async function revokeTokenByValue(
    token: string,
    hint?: 'access_token' | 'refresh_token'
): Promise<{ revoked: boolean; clientId?: string; userId?: string; tokenType?: 'access' | 'refresh' }> {
    const hashed = hashToken(token)
    // First, find the token to determine its type and id
    const select = await dbPool.query(
        `
      SELECT id, token_type, client_id, user_id FROM auth_gateway.oauth_tokens
      WHERE token_hash = $1
        AND ($2::text IS NULL OR token_type = CASE WHEN $2 = 'refresh_token' THEN 'refresh' ELSE 'access' END)
        AND revoked = FALSE
    `,
        [hashed, hint || null]
    )
    if ((select.rowCount ?? 0) === 0) {
        return { revoked: false }
    }
    const row = select.rows[0] as { id: string; token_type: 'access' | 'refresh'; client_id: string; user_id: string }
    if (row.token_type === 'refresh') {
        await revokeTokenChain(row.id, 'revoked')
    } else {
        await revokeTokenById(row.id, 'revoked')
    }
    return { revoked: true, clientId: row.client_id, userId: row.user_id, tokenType: row.token_type }
}

export interface TokenIntrospectionResult {
    active: boolean
    client_id?: string
    user_id?: string
    scope?: string
    token_type?: 'access' | 'refresh'
    exp?: number
    iat?: number
    revoked?: boolean
}

export async function introspectToken(token: string): Promise<TokenIntrospectionResult> {
    const hashed = hashToken(token)
    const result = await dbPool.query(
        `
      SELECT * FROM auth_gateway.oauth_tokens
      WHERE token_hash = $1
    `,
        [hashed]
    )

    const record = (result.rows[0] as TokenRecord | undefined) ?? null
    if (!record) {
        return { active: false }
    }

    if (record.revoked || record.expires_at.getTime() <= Date.now()) {
        return {
            active: false,
            client_id: record.client_id,
            user_id: record.user_id,
            scope: record.scope?.join(' ') || undefined,
            token_type: record.token_type,
            exp: Math.floor(record.expires_at.getTime() / 1000),
            revoked: record.revoked,
        }
    }

    return {
        active: true,
        client_id: record.client_id,
        user_id: record.user_id,
        scope: record.scope?.join(' ') || undefined,
        token_type: record.token_type,
        exp: Math.floor(record.expires_at.getTime() / 1000),
        iat: Math.floor(record.created_at.getTime() / 1000),
    }
}

export async function logOAuthEvent(event: OAuthAuditEvent): Promise<void> {
    try {
        await dbPool.query(
            `
        INSERT INTO auth_gateway.oauth_audit_log (
          event_type, client_id, user_id, ip_address, user_agent,
          scope, redirect_uri, grant_type, success, error_code,
          error_description, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
            [
                event.event_type,
                event.client_id || null,
                event.user_id || null,
                event.ip_address || null,
                event.user_agent || null,
                event.scope ?? null,
                event.redirect_uri || null,
                event.grant_type || null,
                event.success,
                event.error_code || null,
                event.error_description || null,
                event.metadata || {},
            ]
        )
    } catch (error) {
        console.error('Failed to write OAuth audit log entry', error)
    }
}
