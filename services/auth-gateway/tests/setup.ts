// Test setup file for auth-gateway
import { vi } from 'vitest'

// Mock environment variables (JWT_SECRET=REDACTED_JWT_SECRET
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET=REDACTED_JWT_SECRET
process.env.SUPABASE_URL=https://<project-ref>.supabase.co
process.env.SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
process.env.DIRECT_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
process.env.SERVICE_ROLE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

// Keep legacy aliases for older code paths if needed
process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
process.env.NEON_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
