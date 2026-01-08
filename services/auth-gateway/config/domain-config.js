/**
 * Domain Configuration for Organization-Wide Authentication
 * Supports dynamic subdomain registration and validation
 */
/**
 * Centralized registry of all organizational subdomains
 * Add new subdomains here as they are deployed
 */
export const ORGANIZATIONAL_SUBDOMAINS = [
    {
        subdomain: 'dashboard',
        name: 'Main Dashboard',
        type: 'admin',
        status: 'active',
        oauthEnabled: true,
        redirectUris: ['https://dashboard.lanonasis.com/oauth/callback']
    },
    {
        subdomain: 'api',
        name: 'Core API Gateway',
        type: 'api',
        status: 'active',
        oauthEnabled: true,
        redirectUris: ['https://api.lanonasis.com/auth/callback']
    },
    {
        subdomain: 'platform',
        name: 'Platform Services',
        type: 'platform',
        status: 'active',
        oauthEnabled: true,
        redirectUris: ['https://platform.lanonasis.com/oauth/callback']
    },
    {
        subdomain: 'aiplayground',
        name: 'AI Playground',
        type: 'app',
        status: 'planned',
        oauthEnabled: true,
        redirectUris: [
            'https://aiplayground.lanonasis.com/auth/callback',
            'https://aiplayground.lanonasis.com/oauth/callback'
        ]
    },
    // Add future subdomains here
    {
        subdomain: 'analytics',
        name: 'Analytics Dashboard',
        type: 'admin',
        status: 'planned',
        oauthEnabled: true
    },
    {
        subdomain: 'docs',
        name: 'Documentation Portal',
        type: 'platform',
        status: 'planned',
        oauthEnabled: false // Public documentation
    }
];
/**
 * Get all active subdomains for CORS configuration
 */
export const getActiveSubdomains = () => {
    return ORGANIZATIONAL_SUBDOMAINS
        .filter(config => config.status === 'active')
        .map(config => `${config.subdomain}.lanonasis.com`);
};
/**
 * Get all OAuth-enabled redirect URIs
 */
export const getOAuthRedirectUris = () => {
    return ORGANIZATIONAL_SUBDOMAINS
        .filter(config => config.oauthEnabled && config.redirectUris)
        .flatMap(config => config.redirectUris || []);
};
/**
 * Generate CORS origin patterns for wildcard support
 */
export const generateCorsOrigins = () => {
    const basePatterns = [
        '*.lanonasis.com',
        'https://*.lanonasis.com',
        'http://localhost:*', // Development
        'http://127.0.0.1:*' // Development
    ];
    return basePatterns.join(',');
};
/**
 * Validate if a subdomain is authorized
 */
export const isAuthorizedSubdomain = (subdomain) => {
    return ORGANIZATIONAL_SUBDOMAINS.some(config => config.subdomain === subdomain && config.status === 'active');
};
