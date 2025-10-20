import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid Postgres connection string URL'),
  DIRECT_DATABASE_URL: z.string().optional(),
  SERVICE_ROLE_DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_AUTH_URL: z.string().optional(),
  PORT: z
    .string()
    .default('4000')
    .transform((value) => Number.parseInt(value, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long for security'),
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
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables for auth gateway:')
  console.error(parsed.error.format())
  throw new Error('Invalid environment configuration')
}

export const env = parsed.data
