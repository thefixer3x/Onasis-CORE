import { env } from './env.js';
import crypto from 'node:crypto';
/**
 * Comprehensive OAuth environment validation
 * Validates all OAuth-related configuration at startup
 */
export function validateOAuthEnvironment() {
    const errors = [];
    const warnings = [];
    // 1. JWT Secret Security Validation
    if (env.JWT_SECRET=REDACTED_JWT_SECRET
        errors.push('JWT_SECRET=REDACTED_JWT_SECRET
    }
    if (env.JWT_SECRET=REDACTED_JWT_SECRET
        errors.push('JWT_SECRET=REDACTED_JWT_SECRET
    }
    // Test JWT secret entropy
    try {
        const secretBuffer = Buffer.from(env.JWT_SECRET=REDACTED_JWT_SECRET
        const entropy = calculateEntropy(secretBuffer);
        if (entropy < 4.0) {
            warnings.push(`JWT_SECRET=REDACTED_JWT_SECRET
        }
    }
    catch (error) {
        warnings.push('Could not calculate JWT_SECRET=REDACTED_JWT_SECRET
    }
    // 2. CORS Configuration Validation
    if (env.CORS_ORIGIN === '*' && env.NODE_ENV === 'production') {
        errors.push('CORS_ORIGIN cannot be "*" in production. Specify allowed domains');
    }
    const corsOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim());
    for (const origin of corsOrigins) {
        if (origin !== '*' && !origin.match(/^https?:\/\/.+/)) {
            errors.push(`Invalid CORS origin format: ${origin}. Must include protocol (http/https)`);
        }
    }
    // 3. Token TTL Validation
    if (env.AUTH_CODE_TTL_SECONDS > 600) {
        warnings.push('AUTH_CODE_TTL_SECONDS > 10 minutes may violate OAuth security best practices');
    }
    if (env.AUTH_CODE_TTL_SECONDS < 30) {
        warnings.push('AUTH_CODE_TTL_SECONDS < 30 seconds may cause UX issues');
    }
    if (env.ACCESS_TOKEN_TTL_SECONDS > 7200) {
        warnings.push('ACCESS_TOKEN_TTL_SECONDS > 2 hours increases security risk');
    }
    if (env.REFRESH_TOKEN_TTL_SECONDS > 2592000 * 3) { // 90 days
        warnings.push('REFRESH_TOKEN_TTL_SECONDS > 90 days may violate compliance requirements');
    }
    // 4. Database Configuration Validation
    if (!env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        errors.push('DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    }
    else {
        // Validate database URL format
        try {
            const dbUrl = new URL(env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol)) {
                errors.push('DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            }
            // Check for valid hostname
            if (!dbUrl.hostname) {
                warnings.push('DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            }
            // Neon and other cloud providers may use pooler URLs without explicit ports
            // or include port in hostname (e.g., ep-name-pooler.region.aws.neon.tech)
            // Only warn if neither port nor common cloud provider patterns are present
            const isCloudProvider = dbUrl.hostname.includes('neon.tech') ||
                dbUrl.hostname.includes('supabase.') ||
                dbUrl.hostname.includes('amazonaws.com') ||
                dbUrl.hostname.includes('azure.com') ||
                dbUrl.hostname.includes('aiven.io');
            if (!dbUrl.port && !isCloudProvider) {
                warnings.push('DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            }
        }
        catch (error) {
            errors.push('DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        }
    }
    // 5. Supabase Configuration Validation
    if (!env.SUPABASE_URL=https://<project-ref>.supabase.co
        errors.push('SUPABASE_URL=https://<project-ref>.supabase.co
    }
    if (env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
        // This appears to be a service role key, validate format
        const parts = env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
        if (parts.length !== 3) {
            warnings.push('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
        }
    }
    // 6. PKCE Configuration Validation
    if (!env.REQUIRE_PKCE && env.NODE_ENV === 'production') {
        warnings.push('REQUIRE_PKCE should be true in production for security');
    }
    if (env.ALLOW_PLAIN_PKCE && env.NODE_ENV === 'production') {
        errors.push('ALLOW_PLAIN_PKCE must be false in production (plain PKCE is insecure)');
    }
    // 7. Cookie Domain Validation
    // Only warn if cookie domain doesn't match expected patterns
    if (env.NODE_ENV === 'production') {
        if (!env.COOKIE_DOMAIN) {
            warnings.push('COOKIE_DOMAIN not set - cookies will be limited to exact domain');
        }
        else if (env.COOKIE_DOMAIN === 'localhost' || env.COOKIE_DOMAIN === '.localhost') {
            errors.push('COOKIE_DOMAIN cannot be localhost in production');
        }
        else if (!env.COOKIE_DOMAIN.startsWith('.')) {
            warnings.push('COOKIE_DOMAIN should start with "." for subdomain compatibility');
        }
        // .lanonasis.com is the correct production domain, no warning needed
    }
    // 8. Port Configuration
    const commonPorts = [80, 443, 3000, 8080, 8000];
    if (env.NODE_ENV === 'production' && commonPorts.includes(env.PORT)) {
        warnings.push(`Port ${env.PORT} is commonly used. Consider using a non-standard port for security`);
    }
    // 9. Rate Limiting Validation
    if (env.RATE_LIMIT_MAX_REQUESTS > 1000) {
        warnings.push('RATE_LIMIT_MAX_REQUESTS is very high - may not prevent abuse effectively');
    }
    if (env.RATE_LIMIT_WINDOW_MS < 60000) { // 1 minute
        warnings.push('RATE_LIMIT_WINDOW_MS < 1 minute may be too aggressive');
    }
    // 10. SSL/TLS Requirements for Production
    if (env.NODE_ENV === 'production') {
        const urls = [env.DASHBOARD_URL, env.SUPABASE_URL=https://<project-ref>.supabase.co
        for (const url of urls) {
            if (url && !url.startsWith('https://')) {
                errors.push(`Production URL must use HTTPS: ${url}`);
            }
        }
    }
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Calculate entropy of a buffer (simple implementation)
 */
function calculateEntropy(buffer) {
    const freq = {};
    // Count byte frequencies
    for (const byte of buffer) {
        freq[byte] = (freq[byte] || 0) + 1;
    }
    // Calculate entropy
    let entropy = 0;
    const length = buffer.length;
    for (const count of Object.values(freq)) {
        const probability = count / length;
        entropy -= probability * Math.log2(probability);
    }
    return entropy;
}
/**
 * Check if a URI is a localhost URI
 */
function isLocalhostUri(uri) {
    try {
        const url = new URL(uri);
        return url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname === '[::1]';
    }
    catch {
        return false;
    }
}
/**
 * Validate OAuth client configuration in database
 */
export async function validateOAuthClients() {
    const errors = [];
    const warnings = [];
    const info = [];
    const summary = {
        total: 0,
        active: 0,
        inactive: 0,
        byType: {}
    };
    try {
        if (!env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            errors.push('Cannot validate OAuth clients: DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            return { isValid: false, errors, warnings, summary };
        }
        // Import database module dynamically to avoid circular dependencies
        const { dbPool } = await import('../db/client.js');
        const pool = dbPool;
        // Check if oauth_clients table exists and has data
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'auth_gateway' 
                AND table_name = 'oauth_clients'
            )
        `);
        if (!tableCheck.rows[0]?.exists) {
            warnings.push('OAuth clients table not found - skipping client validation');
            return { isValid: true, errors, warnings, summary };
        }
        // Validate existing OAuth clients - include application_type if column exists
        const clients = await pool.query(`
            SELECT 
                client_id, 
                client_name, 
                allowed_redirect_uris, 
                status,
                COALESCE(application_type, 'web') as application_type,
                created_at, 
                updated_at
            FROM auth_gateway.oauth_clients
        `);
        summary.total = clients.rows.length;
        if (clients.rows.length === 0) {
            warnings.push('No OAuth clients configured in database');
        }
        for (const client of clients.rows) {
            const applicationType = (client.application_type || 'web');
            summary.byType[applicationType] = (summary.byType[applicationType] || 0) + 1;
            // Track active/inactive
            if (client.status && client.status !== 'active') {
                summary.inactive++;
                info.push(`Client '${client.client_name}' is marked as ${client.status}`);
            }
            else {
                summary.active++;
            }
            const redirectUris = Array.isArray(client.allowed_redirect_uris)
                ? client.allowed_redirect_uris
                : [];
            for (const uri of redirectUris) {
                try {
                    const url = new URL(uri);
                    const isLocalhost = isLocalhostUri(uri);
                    // Localhost is EXPECTED for native/CLI/MCP clients - don't warn
                    if (isLocalhost && env.NODE_ENV === 'production') {
                        // Only warn for web/server clients with localhost in production
                        if (!['native', 'cli', 'mcp'].includes(applicationType)) {
                            warnings.push(`Client '${client.client_name}' (${applicationType}) has localhost redirect URI in production: ${uri}`);
                        }
                        // For native/CLI/MCP, this is expected - no warning needed
                    }
                    // Warn about non-HTTPS in production (except localhost)
                    if (env.NODE_ENV === 'production' && url.protocol === 'http:' &&
                        !isLocalhost) {
                        warnings.push(`Client '${client.client_name}' has non-HTTPS redirect URI: ${uri}`);
                    }
                }
                catch (e) {
                    errors.push(`Client '${client.client_name}' has invalid redirect URI: ${uri}`);
                }
            }
            // Check for old clients that haven't been updated
            const updatedDate = new Date(client.updated_at || client.created_at);
            const daysSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUpdate > 180) { // 6 months
                warnings.push(`Client '${client.client_name}' hasn't been updated in ${Math.round(daysSinceUpdate)} days`);
            }
        }
    }
    catch (error) {
        // Don't fail on validation errors, just warn
        warnings.push(`OAuth client validation skipped: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        info,
        summary
    };
}
/**
 * Generate a secure JWT secret if one doesn't exist
 */
export function generateSecureJWTSecret() {
    return crypto.randomBytes(64).toString('hex');
}
/**
 * Check system dependencies for OAuth functionality
 */
export function validateSystemDependencies() {
    const errors = [];
    const warnings = [];
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
        errors.push(`Node.js version ${nodeVersion} is too old. OAuth requires Node.js 18+`);
    }
    else if (majorVersion < 20) {
        warnings.push(`Node.js ${nodeVersion} works but Node.js 20+ is recommended`);
    }
    // Check available crypto algorithms
    try {
        crypto.createHash('sha256');
        crypto.randomBytes(32);
    }
    catch (error) {
        errors.push('Required crypto algorithms not available');
    }
    // Check memory limits (basic)
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    if (heapUsedMB > 500) {
        warnings.push(`High memory usage at startup: ${heapUsedMB}MB`);
    }
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Run all validations and report results
 */
export async function runAllValidations() {
    console.log('🔍 Validating OAuth environment configuration...');
    const envValidation = validateOAuthEnvironment();
    const sysValidation = validateSystemDependencies();
    const clientValidation = await validateOAuthClients();
    // Report errors
    const allErrors = [
        ...envValidation.errors,
        ...sysValidation.errors,
        ...clientValidation.errors
    ];
    if (allErrors.length > 0) {
        console.error('❌ OAuth configuration validation failed:');
        allErrors.forEach(error => console.error(`   • ${error}`));
        throw new Error('Invalid OAuth configuration - server cannot start');
    }
    // Report OAuth client summary if available
    if (clientValidation.summary) {
        const { summary } = clientValidation;
        console.log('');
        console.log('📋 OAuth Configuration:');
        console.log(`   Total clients: ${summary.total} (${summary.active} active, ${summary.inactive} inactive)`);
        // Type breakdown with labels
        const typeLabels = {
            native: '💻 Native/Desktop',
            cli: '⌨️  CLI',
            mcp: '🤖 MCP',
            web: '🌐 Web',
            server: '🖥️  Server'
        };
        for (const [type, count] of Object.entries(summary.byType)) {
            const label = typeLabels[type] || type;
            const note = ['native', 'cli', 'mcp'].includes(type) ? ' (localhost allowed)' : '';
            console.log(`   ${label}: ${count}${note}`);
        }
        // Show inactive clients (collapsed)
        const inactiveClients = clientValidation.info?.filter(i => i.includes('marked as')) || [];
        if (inactiveClients.length > 0) {
            console.log('');
            console.log(`💤 Inactive clients (${inactiveClients.length}):`);
            inactiveClients.forEach(info => {
                const match = info.match(/Client '([^']+)' is marked as (\w+)/);
                if (match) {
                    console.log(`   • ${match[1]}`);
                }
            });
        }
    }
    // Separate warnings into categories
    const envWarnings = envValidation.warnings;
    const sysWarnings = sysValidation.warnings;
    const clientWarnings = clientValidation.warnings;
    // Only show client warnings if there are any (excluding expected localhost for native/CLI/MCP)
    if (clientWarnings.length > 0) {
        console.log('');
        console.log('⚠️  OAuth configuration notes:');
        clientWarnings.forEach(warning => console.warn(`   • ${warning}`));
    }
    // Show environment and system warnings if any
    const otherWarnings = [...envWarnings, ...sysWarnings];
    if (otherWarnings.length > 0) {
        console.log('');
        console.log('⚠️  Configuration warnings:');
        otherWarnings.forEach(warning => console.warn(`   • ${warning}`));
    }
    console.log('');
    console.log('✅ OAuth environment validation passed');
}
