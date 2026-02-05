import 'dotenv/config'
import { z } from 'zod'

const normalizeBoolean = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

const booleanString = (defaultValue: boolean) =>
  z
    .string()
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => normalizeBoolean(value))

const integerString = (defaultValue: number) => z.coerce.number().int().default(defaultValue)

const optionalIntegerString = () => z.coerce.number().int().optional()

const requiredString = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .min(1, `${name} is required`)

const optionalNonEmptyString = (name: string) =>
  z
    .string()
    .optional()
    .refine((value) => value === undefined || value.trim().length > 0, `${name} cannot be empty`)

const urlString = (name: string) =>
  requiredString(name).url(`${name} must be a valid URL`)

const optionalUrlString = (name: string) => urlString(name).optional()

const envSchema = z.object({
  DATABASE_URL: urlString('DATABASE_URL'),
  DIRECT_DATABASE_URL: optionalUrlString('DIRECT_DATABASE_URL'),
  SERVICE_ROLE_DATABASE_URL: urlString('SERVICE_ROLE_DATABASE_URL'),
  NEON_DATABASE_URL: optionalUrlString('NEON_DATABASE_URL'),
  SUPABASE_URL: urlString('SUPABASE_URL'),
  SUPABASE_AUTH_URL: optionalUrlString('SUPABASE_AUTH_URL'),
  SUPABASE_ANON_KEY: requiredString('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: requiredString('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_SERVICE_KEY: optionalNonEmptyString('SUPABASE_SERVICE_KEY'),
  MAIN_SUPABASE_URL: optionalUrlString('MAIN_SUPABASE_URL'),
  MAIN_SUPABASE_ANON_KEY: optionalNonEmptyString('MAIN_SUPABASE_ANON_KEY'),
  MAIN_SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString('MAIN_SUPABASE_SERVICE_ROLE_KEY'),
  WEBHOOK_SECRET: optionalNonEmptyString('WEBHOOK_SECRET'),
  JWT_SECRET: requiredString('JWT_SECRET').min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRY: z.string().default('7d'),
  ACCESS_TOKEN_TTL_SECONDS: integerString(3600),
  REFRESH_TOKEN_TTL_SECONDS: integerString(60 * 60 * 24 * 30),
  AUTH_CODE_TTL_SECONDS: integerString(300),
  RATE_LIMIT_WINDOW_MS: integerString(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: integerString(100),
  OAUTH_KEY_ROTATION_INTERVAL: integerString(24 * 60 * 60 * 1000),
  OAUTH_MAX_AUTHORIZATION_CODE_AGE: integerString(600),
  UAI_CACHE_TTL: integerString(300),
  BCRYPT_ROUNDS: integerString(12),
  PORT: integerString(4000),
  MY_SERVER_PORT: optionalIntegerString(),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NODE_DISABLE_COLORS: optionalNonEmptyString('NODE_DISABLE_COLORS'),
  NODE_UNIQUE_ID: optionalNonEmptyString('NODE_UNIQUE_ID'),
  NODE_COMPILE_CACHE: optionalNonEmptyString('NODE_COMPILE_CACHE'),
  DOTENV_KEY: optionalNonEmptyString('DOTENV_KEY'),
  PATH: optionalNonEmptyString('PATH'),
  DEBUG: optionalNonEmptyString('DEBUG'),
  CI: booleanString(false),
  CI_ENVIRONMENT_NAME: optionalNonEmptyString('CI_ENVIRONMENT_NAME'),
  SKIP_SMOKE_TESTS: booleanString(false),
  TEST: optionalNonEmptyString('TEST'),
  TEST_PARALLEL_INDEX: optionalNonEmptyString('TEST_PARALLEL_INDEX'),
  TEST_WORKER_INDEX: optionalNonEmptyString('TEST_WORKER_INDEX'),
  BOOK_LANG: optionalNonEmptyString('BOOK_LANG'),
  ICEBERG_TOKEN: optionalNonEmptyString('ICEBERG_TOKEN'),
  CORS_ORIGIN: z
    .string()
    .default('*.lanonasis.com,https://*.lanonasis.com,http://localhost:*'),
  COOKIE_DOMAIN: z.string().default('.lanonasis.com'),
  DASHBOARD_URL: z
    .string()
    .url('DASHBOARD_URL must be a valid URL')
    .default('https://dashboard.lanonasis.com'),
  AUTH_GATEWAY_URL: z
    .string()
    .url('AUTH_GATEWAY_URL must be a valid URL')
    .optional(),
  AUTH_BASE_URL: z
    .string()
    .url('AUTH_BASE_URL must be a valid URL')
    .default('https://auth.lanonasis.com'),
  ADDITIONAL_SUBDOMAINS: optionalNonEmptyString('ADDITIONAL_SUBDOMAINS'),
  ENABLE_SUBDOMAIN_AUTO_REGISTRATION: booleanString(false),
  REQUIRE_PKCE: booleanString(true),
  ALLOW_PLAIN_PKCE: booleanString(false),
  ENFORCE_STATE_PARAMETER: booleanString(true),
  OAUTH_ISSUER: optionalUrlString('OAUTH_ISSUER'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  REDIS_ENABLED: booleanString(false),
  REDIS_URL: optionalUrlString('REDIS_URL'),
  UPSTASH_REDIS_URL: optionalUrlString('UPSTASH_REDIS_URL'),
  REDIS_HOST: optionalNonEmptyString('REDIS_HOST'),
  REDIS_PORT: optionalIntegerString(),
  REDIS_DB: optionalIntegerString(),
  REDIS_PASSWORD: optionalNonEmptyString('REDIS_PASSWORD'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables for auth gateway:')
  console.error(parsed.error.format())
  throw new Error('Invalid environment configuration')
}

export const env = parsed.data
