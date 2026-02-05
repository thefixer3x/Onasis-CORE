import 'dotenv/config'
import z from 'zod'

const schema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid Supabase project URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  API_KEY_ENCRYPTION_KEY: z.string().min(32, 'API_KEY_ENCRYPTION_KEY must be at least 32 characters'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('4100')
    .transform((value) => Number.parseInt(value, 10)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid security service environment configuration')
  console.error(parsed.error.format())
  throw new Error('Invalid environment configuration for security service')
}

export const env = parsed.data
