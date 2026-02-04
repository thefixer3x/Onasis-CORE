// Test setup file for auth-gateway
import { vi } from 'vitest'

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.PORT = '3001'
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long-0000'
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-supabase-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-service-role-key'
process.env.MAIN_SUPABASE_URL = 'https://test.supabase.co'
process.env.MAIN_SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-service-role-key'
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
process.env.DIRECT_DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
process.env.SERVICE_ROLE_DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
process.env.CORS_ORIGIN = 'http://localhost:3000,http://localhost:5173'
process.env.AUTH_BASE_URL = 'https://auth.lanonasis.com'
process.env.REDIS_URL = 'redis://localhost:6379'

// CORS and domain configuration
process.env.CORS_ORIGIN = 'http://localhost:3000,http://localhost:5173'
process.env.COOKIE_DOMAIN = 'localhost'
process.env.DASHBOARD_URL = 'http://localhost:3000'
process.env.AUTH_BASE_URL = 'http://localhost:4000'

// Keep legacy aliases for older code paths if needed
process.env.SUPABASE_SERVICE_KEY = 'test-supabase-service-role-key'
process.env.NEON_DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
