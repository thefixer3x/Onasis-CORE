import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
postgresql://<user>:<password>@<host>:<port>/<db>
postgresql://<user>:<password>@<host>:<port>/<db>
  SERVICE_ROLE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
https://<project-ref>.supabase.co
REDACTED_SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
REDACTED_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
https://<project-ref>.supabase.co/auth/v1
  PORT: z
    .string()
    .default('4000')
    .transform((value) => Number.parseInt(value, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('*.lanonasis.com,https://*.lanonasis.com,http://localhost:*'),
REDACTED_JWT_SECRET=REDACTED_JWT_SECRET
    .string()
    .min(32, 'JWT_SECRET=REDACTED_JWT_SECRET
  JWT_EXPIRY: z.string().default('7d'),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000')
    .transform((value) => Number.parseInt(value, 10)),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .default('100')
    .transform((value) => Number.parseInt(value, 10)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  // Cookie and dashboard settings - Organization-wide authentication
  COOKIE_DOMAIN: z.string().default('.lanonasis.com'),
  DASHBOARD_URL: z.string().url().default('https://dashboard.lanonasis.com'),
  AUTH_GATEWAY_URL: z.string().url().optional(),
  AUTH_BASE_URL: z.string().url().default('https://auth.lanonasis.com'),

  // Additional organizational subdomains (comma-separated)
  ADDITIONAL_SUBDOMAINS: z.string().optional(),

  // OAuth client auto-registration for new subdomains
  ENABLE_SUBDOMAIN_AUTO_REGISTRATION: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),

  // OAuth-specific configuration
  OAUTH_ISSUER: z.string().url().optional(),
  OAUTH_KEY_ROTATION_INTERVAL: z
    .string()
    .default('86400000') // 24 hours in ms
    .transform((value) => Number.parseInt(value, 10)),
  OAUTH_MAX_AUTHORIZATION_CODE_AGE: z
    .string()
    .default('600') // 10 minutes
    .transform((value) => Number.parseInt(value, 10)),

  // Token TTL configuration (in seconds)
  AUTH_CODE_TTL_SECONDS: z
    .string()
    .default('300') // 5 minutes
    .transform((value) => Number.parseInt(value, 10)),
  ACCESS_TOKEN_TTL_SECONDS: z
    .string()
    .default('3600') // 1 hour
    .transform((value) => Number.parseInt(value, 10)),
  REFRESH_TOKEN_TTL_SECONDS: z
    .string()
    .default('2592000') // 30 days
    .transform((value) => Number.parseInt(value, 10)),

  // Security configuration
  REQUIRE_PKCE: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() === 'true'),
  ALLOW_PLAIN_PKCE: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),
  ENFORCE_STATE_PARAMETER: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() === 'true'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables for auth gateway:')
  console.error(parsed.error.format())
  throw new Error('Invalid environment configuration')
}

export const env = parsed.data
