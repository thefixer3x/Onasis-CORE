/**
 * Identity Resolution Service
 *
 * Resolves any authentication method to a canonical Universal Authentication Identifier (UAI).
 * This is the core service that ensures all auth flows map to a single identity.
 *
 * Resolution Flow:
 * 1. Extract method + identifier from auth input (JWT sub, API key hash, email, etc.)
 * 2. Query auth_credentials table for matching credential
 * 3. Return the associated auth_id (UAI)
 * 4. If not found and auto-create enabled, create new identity + credential
 */

import { Pool } from 'pg'

// Types for identity resolution
export interface ResolvedIdentity {
  authId: string           // UAI - Universal Authentication Identifier
  primaryEmail: string | null
  displayName: string | null
  status: 'active' | 'suspended' | 'deleted' | 'pending_verification'
  organizationId: string | null
  credentialId: string
  authMethod: string
  metadata: Record<string, unknown>
}

export interface IdentityResolutionOptions {
  createIfMissing?: boolean
  metadata?: Record<string, unknown>
  platform?: 'mcp' | 'cli' | 'web' | 'api' | 'mobile' | 'sdk'
  ipAddress?: string
  userAgent?: string
}

export interface LinkCredentialOptions {
  isPrimary?: boolean
  metadata?: Record<string, unknown>
  actorAuthId?: string
  provider?: string
  providerUserId?: string
  platform?: string
}

// Auth method types (must match migration CHECK constraint)
export type AuthMethod =
  | 'supabase_jwt'
  | 'api_key'
  | 'oauth_pkce'
  | 'oauth_token'
  | 'magic_link'
  | 'otp_email'
  | 'otp_sms'
  | 'sso_session'
  | 'password'
  | 'passkey'
  | 'mcp_token'

/**
 * Identity Resolution Service
 * Central service for UAI (Universal Authentication Identifier) management
 */
export class IdentityResolutionService {
  private pool: Pool

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  }

  /**
   * Resolve any auth method to a canonical UAI (auth_id)
   *
   * @param method - The authentication method type
   * @param identifier - The method-specific identifier (email, user_id, key hash, etc.)
   * @param options - Resolution options (createIfMissing, metadata, etc.)
   * @returns ResolvedIdentity or null if not found
   */
  async resolveIdentity(
    method: AuthMethod,
    identifier: string,
    options: IdentityResolutionOptions = {}
  ): Promise<ResolvedIdentity | null> {
    const client = await this.pool.connect()

    try {
      // First, try to find existing credential
      const credentialQuery = `
        SELECT
          c.id as credential_id,
          c.auth_id,
          c.method,
          c.metadata as credential_metadata,
          i.primary_email,
          i.display_name,
          i.status,
          i.organization_id,
          i.metadata as identity_metadata
        FROM auth_gateway.auth_credentials c
        JOIN auth_gateway.auth_identities i ON c.auth_id = i.auth_id
        WHERE c.method = $1
          AND c.identifier = $2
          AND c.is_active = true
          AND (c.expires_at IS NULL OR c.expires_at > NOW())
          AND i.status = 'active'
      `

      const result = await client.query(credentialQuery, [method, identifier])

      if (result.rows.length > 0) {
        const row = result.rows[0]

        // Update last_used_at for credential and last_auth_at for identity
        await client.query(`
          UPDATE auth_gateway.auth_credentials SET last_used_at = NOW() WHERE id = $1
        `, [row.credential_id])

        await client.query(`
          UPDATE auth_gateway.auth_identities SET last_auth_at = NOW() WHERE auth_id = $1
        `, [row.auth_id])

        // Log successful auth in provenance
        await this.logProvenance(client, {
          authId: row.auth_id,
          eventType: 'auth_success',
          credentialId: row.credential_id,
          actorType: 'user',
          platform: options.platform,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
          details: { method, identifier: this.maskIdentifier(identifier) }
        })

        return {
          authId: row.auth_id,
          primaryEmail: row.primary_email,
          displayName: row.display_name,
          status: row.status,
          organizationId: row.organization_id,
          credentialId: row.credential_id,
          authMethod: row.method,
          metadata: { ...row.identity_metadata, ...row.credential_metadata }
        }
      }

      // Not found - create if requested
      if (options.createIfMissing) {
        return await this.createIdentityWithCredential(client, method, identifier, options)
      }

      return null
    } finally {
      client.release()
    }
  }

  /**
   * Create a new identity with initial credential
   */
  private async createIdentityWithCredential(
    client: ReturnType<Pool['connect']> extends Promise<infer T> ? T : never,
    method: AuthMethod,
    identifier: string,
    options: IdentityResolutionOptions
  ): Promise<ResolvedIdentity> {
    await client.query('BEGIN')

    try {
      // Determine primary email from method
      const primaryEmail = this.extractEmail(method, identifier)

      // Create identity
      const identityResult = await client.query(`
        INSERT INTO auth_gateway.auth_identities (
          primary_email,
          status,
          email_verified,
          metadata
        ) VALUES ($1, 'active', $2, $3)
        RETURNING auth_id, primary_email, display_name, status, organization_id, metadata
      `, [
        primaryEmail,
        !!primaryEmail, // email_verified if we have an email
        JSON.stringify(options.metadata || {})
      ])

      const identity = identityResult.rows[0]

      // Create credential
      const credentialResult = await client.query(`
        INSERT INTO auth_gateway.auth_credentials (
          auth_id,
          method,
          identifier,
          platform,
          is_primary,
          is_active,
          metadata
        ) VALUES ($1, $2, $3, $4, true, true, $5)
        RETURNING id
      `, [
        identity.auth_id,
        method,
        identifier,
        options.platform || null,
        JSON.stringify(options.metadata || {})
      ])

      const credentialId = credentialResult.rows[0].id

      // Log provenance
      await this.logProvenance(client, {
        authId: identity.auth_id,
        eventType: 'identity_created',
        credentialId,
        actorType: 'system',
        platform: options.platform,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        details: {
          method,
          identifier: this.maskIdentifier(identifier),
          source: 'identity_resolution_service'
        }
      })

      await client.query('COMMIT')

      return {
        authId: identity.auth_id,
        primaryEmail: identity.primary_email,
        displayName: identity.display_name,
        status: identity.status,
        organizationId: identity.organization_id,
        credentialId,
        authMethod: method,
        metadata: identity.metadata || {}
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }

  /**
   * Link a new credential to an existing identity
   */
  async linkCredential(
    authId: string,
    method: AuthMethod,
    identifier: string,
    options: LinkCredentialOptions = {}
  ): Promise<string> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Check if credential already exists
      const existingResult = await client.query(`
        SELECT auth_id FROM auth_gateway.auth_credentials
        WHERE method = $1 AND identifier = $2
      `, [method, identifier])

      if (existingResult.rows.length > 0) {
        const existingAuthId = existingResult.rows[0].auth_id
        if (existingAuthId === authId) {
          // Already linked to this identity
          await client.query('COMMIT')
          const idResult = await client.query(
            `SELECT id FROM auth_gateway.auth_credentials WHERE method = $1 AND identifier = $2`,
            [method, identifier]
          )
          return idResult.rows[0].id
        }
        throw new Error('CREDENTIAL_ALREADY_LINKED: Credential is linked to a different identity')
      }

      // If setting as primary, unset other primaries
      if (options.isPrimary) {
        await client.query(`
          UPDATE auth_gateway.auth_credentials
          SET is_primary = false
          WHERE auth_id = $1 AND method = $2 AND is_primary = true
        `, [authId, method])
      }

      // Create credential
      const result = await client.query(`
        INSERT INTO auth_gateway.auth_credentials (
          auth_id,
          method,
          identifier,
          provider,
          provider_user_id,
          platform,
          is_primary,
          is_active,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
        RETURNING id
      `, [
        authId,
        method,
        identifier,
        options.provider || null,
        options.providerUserId || null,
        options.platform || null,
        options.isPrimary || false,
        JSON.stringify(options.metadata || {})
      ])

      const credentialId = result.rows[0].id

      // Log provenance
      await this.logProvenance(client, {
        authId,
        eventType: 'credential_added',
        credentialId,
        actorAuthId: options.actorAuthId,
        actorType: options.actorAuthId ? 'user' : 'system',
        details: {
          method,
          identifier: this.maskIdentifier(identifier),
          isPrimary: options.isPrimary
        }
      })

      await client.query('COMMIT')
      return credentialId
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Get identity by auth_id
   */
  async getIdentity(authId: string): Promise<ResolvedIdentity | null> {
    const result = await this.pool.query(`
      SELECT
        i.auth_id,
        i.primary_email,
        i.display_name,
        i.status,
        i.organization_id,
        i.metadata,
        (
          SELECT json_agg(json_build_object(
            'id', c.id,
            'method', c.method,
            'identifier', c.identifier,
            'is_primary', c.is_primary,
            'last_used_at', c.last_used_at
          ))
          FROM auth_gateway.auth_credentials c
          WHERE c.auth_id = i.auth_id AND c.is_active = true
        ) as credentials
      FROM auth_gateway.auth_identities i
      WHERE i.auth_id = $1 AND i.status = 'active'
    `, [authId])

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    const primaryCredential = row.credentials?.find((c: any) => c.is_primary) || row.credentials?.[0]

    return {
      authId: row.auth_id,
      primaryEmail: row.primary_email,
      displayName: row.display_name,
      status: row.status,
      organizationId: row.organization_id,
      credentialId: primaryCredential?.id,
      authMethod: primaryCredential?.method,
      metadata: { ...row.metadata, credentials: row.credentials }
    }
  }

  /**
   * Resolve legacy userId to UAI
   * Used for backward compatibility during migration
   */
  async resolveFromLegacyUserId(userId: string): Promise<string | null> {
    const result = await this.pool.query(`
      SELECT auth_id FROM auth_gateway.user_accounts WHERE user_id = $1
    `, [userId])

    return result.rows[0]?.auth_id || null
  }

  /**
   * Log identity provenance event
   */
  private async logProvenance(
    client: any,
    event: {
      authId: string
      eventType: string
      credentialId?: string
      actorAuthId?: string
      actorType?: string
      platform?: string
      ipAddress?: string
      userAgent?: string
      details?: Record<string, unknown>
    }
  ): Promise<void> {
    await client.query(`
      INSERT INTO auth_gateway.identity_provenance (
        auth_id,
        event_type,
        credential_id,
        actor_auth_id,
        actor_type,
        platform,
        ip_address,
        user_agent,
        details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9)
    `, [
      event.authId,
      event.eventType,
      event.credentialId || null,
      event.actorAuthId || null,
      event.actorType || 'system',
      event.platform || null,
      event.ipAddress || null,
      event.userAgent || null,
      JSON.stringify(event.details || {})
    ])
  }

  /**
   * Extract email from method-specific identifier
   */
  private extractEmail(method: AuthMethod, identifier: string): string | null {
    const emailMethods = ['magic_link', 'otp_email', 'supabase_jwt', 'password']
    if (emailMethods.includes(method) && identifier.includes('@')) {
      return identifier.toLowerCase()
    }
    return null
  }

  /**
   * Mask identifier for logging (privacy protection)
   */
  private maskIdentifier(identifier: string): string {
    if (identifier.includes('@')) {
      const [local, domain] = identifier.split('@')
      return `${local.slice(0, 2)}***@${domain}`
    }
    if (identifier.length > 8) {
      return `${identifier.slice(0, 4)}...${identifier.slice(-4)}`
    }
    return '***'
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end()
  }
}

// Singleton instance (lazy initialized)
let identityServiceInstance: IdentityResolutionService | null = null

/**
 * Get the identity resolution service instance
 */
export function getIdentityService(): IdentityResolutionService {
  if (!identityServiceInstance) {
    const neonDbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
    if (!neonDbUrl) {
      throw new Error('NEON_DATABASE_URL or DATABASE_URL environment variable is required for identity resolution')
    }
    identityServiceInstance = new IdentityResolutionService(neonDbUrl)
  }
  return identityServiceInstance
}

/**
 * Resolve authentication to UAI (convenience wrapper)
 */
export async function resolveToUAI(
  method: AuthMethod,
  identifier: string,
  options?: IdentityResolutionOptions
): Promise<ResolvedIdentity | null> {
  return getIdentityService().resolveIdentity(method, identifier, options)
}
