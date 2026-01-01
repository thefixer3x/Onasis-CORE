// Test setup file for auth-gateway
import { vi } from 'vitest'

// Mock environment variables (JWT_SECRET=REDACTED_JWT_SECRET
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET=REDACTED_JWT_SECRET
process.env.SUPABASE_URL=https://<project-ref>.supabase.co
process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
process.env.NEON_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
