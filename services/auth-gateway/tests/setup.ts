// Test setup file for auth-gateway
import { vi } from 'vitest'

// Mock environment variables (JWT_SECRET=REDACTED_JWT_SECRET
process.env.NODE_ENV = 'test'
process.env.PORT = '3001'
process.env.JWT_SECRET=REDACTED_JWT_SECRET
process.env.SUPABASE_URL=https://<project-ref>.supabase.co
process.env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
process.env.MAIN_SUPABASE_URL=https://<project-ref>.supabase.co
process.env.MAIN_SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
process.env.DIRECT_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
process.env.SERVICE_ROLE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
process.env.CORS_ORIGIN = 'http://localhost:3000,http://localhost:5173'
process.env.AUTH_BASE_URL = 'https://auth.lanonasis.com'
process.env.REDIS_URL = 'redis://localhost:6379'

// Keep legacy aliases for older code paths if needed
process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
process.env.NEON_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
