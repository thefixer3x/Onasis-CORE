import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  DIRECT_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  SERVICE_ROLE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  SUPABASE_URL=https://<project-ref>.supabase.co
  SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_AUTH_URL=https://<project-ref>.supabase.co/auth/v1
  PORT: z
    .string()
    .default('4000')
    .transform((value) => Number.parseInt(value, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET=REDACTED_JWT_SECRET
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
  // Cookie and dashboard settings
  COOKIE_DOMAIN: z.string().default('.lanonasis.com'),
  DASHBOARD_URL: z.string().url().default('https://dashboard.lanonasis.com'),
  AUTH_GATEWAY_URL: z.string().url().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables for auth gateway:')
  console.error(parsed.error.format())
  throw new Error('Invalid environment configuration')
}

export const env = parsed.data
