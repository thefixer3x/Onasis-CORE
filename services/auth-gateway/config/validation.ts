import { env } from './env.js'
import crypto from 'node:crypto'

interface ValidationResult {
    isValid: boolean
    errors: string[]
    warnings: string[]
}

/**
 * Comprehensive OAuth environment validation
 * Validates all OAuth-related configuration at startup
 */
export function validateOAuthEnvironment(): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

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
        const entropy = calculateEntropy(secretBuffer)
        if (entropy < 4.0) {
            warnings.push(`JWT_SECRET=REDACTED_JWT_SECRET
        }
    } catch (error) {
        warnings.push('Could not calculate JWT_SECRET=REDACTED_JWT_SECRET
    }

    // 2. CORS Configuration Validation
    if (env.CORS_ORIGIN === '*' && env.NODE_ENV === 'production') {
        errors.push('CORS_ORIGIN cannot be "*" in production. Specify allowed domains')
    }

    const corsOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim())
    for (const origin of corsOrigins) {
        if (origin !== '*' && !origin.match(/^https?:\/\/.+/)) {
            errors.push(`Invalid CORS origin format: ${origin}. Must include protocol (http/https)`)
        }
    }

    // 3. Token TTL Validation
    if (env.AUTH_CODE_TTL_SECONDS > 600) {
        warnings.push('AUTH_CODE_TTL_SECONDS > 10 minutes may violate OAuth security best practices')
    }

    if (env.AUTH_CODE_TTL_SECONDS < 30) {
        warnings.push('AUTH_CODE_TTL_SECONDS < 30 seconds may cause UX issues')
    }

    if (env.ACCESS_TOKEN_TTL_SECONDS > 7200) {
        warnings.push('ACCESS_TOKEN_TTL_SECONDS > 2 hours increases security risk')
    }

    if (env.REFRESH_TOKEN_TTL_SECONDS > 2592000 * 3) { // 90 days
        warnings.push('REFRESH_TOKEN_TTL_SECONDS > 90 days may violate compliance requirements')
    }

    // 4. Database Configuration Validation
    if (!env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        errors.push('DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    } else {
        // Validate database URL format
        try {
            const dbUrl = new URL(env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol)) {
                errors.push('DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            }
            if (!dbUrl.hostname || !dbUrl.port) {
                warnings.push('DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            }
        } catch (error) {
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
        warnings.push('REQUIRE_PKCE should be true in production for security')
    }

    if (env.ALLOW_PLAIN_PKCE && env.NODE_ENV === 'production') {
        errors.push('ALLOW_PLAIN_PKCE must be false in production (plain PKCE is insecure)')
    }

    // 7. Cookie Domain Validation
    if (env.NODE_ENV === 'production' && env.COOKIE_DOMAIN === '.lanonasis.com') {
        // This is probably correct, but warn if using default in production
        warnings.push('Using default COOKIE_DOMAIN in production - ensure this matches your domain')
    }

    // 8. Port Configuration
    const commonPorts = [80, 443, 3000, 8080, 8000]
    if (env.NODE_ENV === 'production' && commonPorts.includes(env.PORT)) {
        warnings.push(`Port ${env.PORT} is commonly used. Consider using a non-standard port for security`)
    }

    // 9. Rate Limiting Validation
    if (env.RATE_LIMIT_MAX_REQUESTS > 1000) {
        warnings.push('RATE_LIMIT_MAX_REQUESTS is very high - may not prevent abuse effectively')
    }

    if (env.RATE_LIMIT_WINDOW_MS < 60000) { // 1 minute
        warnings.push('RATE_LIMIT_WINDOW_MS < 1 minute may be too aggressive')
    }

    // 10. SSL/TLS Requirements for Production
    if (env.NODE_ENV === 'production') {
        const urls = [env.DASHBOARD_URL, env.SUPABASE_URL=https://<project-ref>.supabase.co
        for (const url of urls) {
            if (url && !url.startsWith('https://')) {
                errors.push(`Production URL must use HTTPS: ${url}`)
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}

/**
 * Calculate entropy of a buffer (simple implementation)
 */
function calculateEntropy(buffer: Buffer): number {
    const freq: { [key: number]: number } = {}

    // Count byte frequencies
    for (const byte of buffer) {
        freq[byte] = (freq[byte] || 0) + 1
    }

    // Calculate entropy
    let entropy = 0
    const length = buffer.length

    for (const count of Object.values(freq)) {
        const probability = count / length
        entropy -= probability * Math.log2(probability)
    }

    return entropy
}

/**
 * Validate OAuth client configuration in database
 */
export async function validateOAuthClients(): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    try {
        // This would typically connect to the database and validate client configurations
        // For now, we'll just validate the environment supports it

        if (!env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            errors.push('Cannot validate OAuth clients: DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            return { isValid: false, errors, warnings }
        }

        // TODO: Implement database client validation
        // - Check for clients with weak secrets
        // - Validate redirect URI formats
        // - Check for expired or inactive clients

        warnings.push('OAuth client validation not yet implemented - consider manual review')

    } catch (error) {
        errors.push(`OAuth client validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}

/**
 * Generate a secure JWT secret if one doesn't exist
 */
export function generateSecureJWTSecret(): string {
    return crypto.randomBytes(64).toString('hex')
}

/**
 * Check system dependencies for OAuth functionality
 */
export function validateSystemDependencies(): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Check Node.js version
    const nodeVersion = process.version
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0])

    if (majorVersion < 18) {
        errors.push(`Node.js version ${nodeVersion} is too old. OAuth requires Node.js 18+`)
    } else if (majorVersion < 20) {
        warnings.push(`Node.js ${nodeVersion} works but Node.js 20+ is recommended`)
    }

    // Check available crypto algorithms
    try {
        crypto.createHash('sha256')
        crypto.randomBytes(32)
    } catch (error) {
        errors.push('Required crypto algorithms not available')
    }

    // Check memory limits (basic)
    const memUsage = process.memoryUsage()
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)

    if (heapUsedMB > 500) {
        warnings.push(`High memory usage at startup: ${heapUsedMB}MB`)
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}

/**
 * Run all validations and report results
 */
export async function runAllValidations(): Promise<void> {
    console.log('🔍 Validating OAuth environment configuration...')

    const envValidation = validateOAuthEnvironment()
    const sysValidation = validateSystemDependencies()
    const clientValidation = await validateOAuthClients()

    // Report errors
    const allErrors = [
        ...envValidation.errors,
        ...sysValidation.errors,
        ...clientValidation.errors
    ]

    if (allErrors.length > 0) {
        console.error('❌ OAuth configuration validation failed:')
        allErrors.forEach(error => console.error(`   • ${error}`))
        throw new Error('Invalid OAuth configuration - server cannot start')
    }

    // Report warnings
    const allWarnings = [
        ...envValidation.warnings,
        ...sysValidation.warnings,
        ...clientValidation.warnings
    ]

    if (allWarnings.length > 0) {
        console.warn('⚠️  OAuth configuration warnings:')
        allWarnings.forEach(warning => console.warn(`   • ${warning}`))
    }

    console.log('✅ OAuth environment validation passed')
}