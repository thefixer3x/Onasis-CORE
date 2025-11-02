import { dbPool } from '../../db/client.js'
import { env } from '../../config/env.js'
import { ORGANIZATIONAL_SUBDOMAINS, type SubdomainConfig } from '../../config/domain-config.js'
import { logger } from '../utils/logger.js'

/**
 * Dynamic OAuth Client Registration for Organization Subdomains
 * Automatically registers OAuth clients for new organizational subdomains
 */

export interface AutoRegistrationResult {
    success: boolean
    clientId: string
    message: string
}

/**
 * Auto-register OAuth client for a new organizational subdomain
 */
export async function autoRegisterSubdomainClient(
    subdomainConfig: SubdomainConfig
): Promise<AutoRegistrationResult> {
    try {
        const clientId = `${subdomainConfig.subdomain}-client`

        // Generate redirect URIs based on subdomain type
        const redirectUris = generateRedirectUris(subdomainConfig)

        // Determine scopes based on subdomain type
        const scopes = generateScopes(subdomainConfig)

        const query = `
      INSERT INTO oauth_clients (
        client_id,
        client_name,
        client_type,
        require_pkce,
        allowed_code_challenge_methods,
        allowed_redirect_uris,
        allowed_scopes,
        default_scopes,
        status,
        description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (client_id) DO UPDATE SET
        client_name = EXCLUDED.client_name,
        allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
        allowed_scopes = EXCLUDED.allowed_scopes,
        updated_at = NOW()
      RETURNING client_id
    `

        const values = [
            clientId,
            `${subdomainConfig.name} Client`,
            'public',
            true, // require_pkce
            ['S256'],
            JSON.stringify(redirectUris),
            scopes,
            getDefaultScopes(subdomainConfig),
            subdomainConfig.status,
            `Auto-registered OAuth client for ${subdomainConfig.name} (${subdomainConfig.subdomain}.lanonasis.com)`
        ]

        const result = await dbPool.query(query, values)

        logger.info('Auto-registered OAuth client', {
            clientId,
            subdomain: subdomainConfig.subdomain,
            redirectUris,
            scopes
        })

        return {
            success: true,
            clientId,
            message: `Successfully registered OAuth client for ${subdomainConfig.subdomain}.lanonasis.com`
        }

    } catch (error) {
        logger.error('Failed to auto-register OAuth client', {
            subdomain: subdomainConfig.subdomain,
            error: error instanceof Error ? error.message : 'Unknown error'
        })

        return {
            success: false,
            clientId: '',
            message: `Failed to register OAuth client: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
    }
}

/**
 * Generate appropriate redirect URIs based on subdomain configuration
 */
function generateRedirectUris(config: SubdomainConfig): string[] {
    const baseUrl = `https://${config.subdomain}.lanonasis.com`
    const uris: string[] = []

    // Add configured redirect URIs
    if (config.redirectUris) {
        uris.push(...config.redirectUris)
    }

    // Add standard OAuth callback patterns
    const standardCallbacks = [
        `${baseUrl}/auth/callback`,
        `${baseUrl}/oauth/callback`,
    ]

    // Add type-specific callbacks
    switch (config.type) {
        case 'app':
            standardCallbacks.push(
                `${baseUrl}/auth/success`,
                `${baseUrl}/login/callback`
            )
            break
        case 'api':
            standardCallbacks.push(
                `${baseUrl}/v1/auth/callback`,
                `${baseUrl}/auth/token/callback`
            )
            break
        case 'admin':
            standardCallbacks.push(
                `${baseUrl}/admin/auth/callback`,
                `${baseUrl}/dashboard/auth/callback`
            )
            break
        case 'platform':
            standardCallbacks.push(
                `${baseUrl}/platform/auth/callback`,
                `${baseUrl}/auth/platform/callback`
            )
            break
    }

    uris.push(...standardCallbacks)

    // Remove duplicates and return
    return [...new Set(uris)]
}

/**
 * Generate appropriate scopes based on subdomain type
 */
function generateScopes(config: SubdomainConfig): string[] {
    const baseScopes = ['profile', 'openid']

    switch (config.type) {
        case 'admin':
            return [
                ...baseScopes,
                'memories:read',
                'memories:write',
                'memories:delete',
                'admin',
                'user:manage',
                'audit:read'
            ]
        case 'api':
            return [
                ...baseScopes,
                'memories:read',
                'memories:write',
                'memories:delete',
                'api:access'
            ]
        case 'app':
            return [
                ...baseScopes,
                'memories:read',
                'memories:write'
            ]
        case 'platform':
            return [
                ...baseScopes,
                'memories:read',
                'platform:access'
            ]
        default:
            return baseScopes
    }
}

/**
 * Get default scopes for a subdomain configuration
 */
function getDefaultScopes(config: SubdomainConfig): string[] {
    const baseDefaults = ['profile']

    switch (config.type) {
        case 'admin':
            return [...baseDefaults, 'memories:read', 'audit:read']
        case 'api':
            return [...baseDefaults, 'memories:read', 'api:access']
        case 'app':
            return [...baseDefaults, 'memories:read']
        case 'platform':
            return [...baseDefaults, 'memories:read']
        default:
            return baseDefaults
    }
}

/**
 * Register all organizational subdomains that don't have OAuth clients yet
 */
export async function registerAllOrganizationalSubdomains(): Promise<AutoRegistrationResult[]> {
    if (!env.ENABLE_SUBDOMAIN_AUTO_REGISTRATION) {
        logger.info('Subdomain auto-registration is disabled')
        return []
    }

    const results: AutoRegistrationResult[] = []

    for (const subdomainConfig of ORGANIZATIONAL_SUBDOMAINS) {
        if (subdomainConfig.oauthEnabled && subdomainConfig.status === 'active') {
            const result = await autoRegisterSubdomainClient(subdomainConfig)
            results.push(result)

            // Small delay to avoid overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 100))
        }
    }

    logger.info('Completed organizational subdomain registration', {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
    })

    return results
}

/**
 * Validate if a redirect URI is authorized for the organization
 */
export function isAuthorizedRedirectUri(uri: string): boolean {
    // Allow localhost for development
    if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
        return env.NODE_ENV === 'development'
    }

    // Check if URI matches organizational domain patterns
    const organizationalDomains = [
        '.lanonasis.com',
        'lanonasis.com'
    ]

    return organizationalDomains.some(domain =>
        uri.includes(domain) ||
        new URL(uri).hostname.endsWith(domain)
    )
}