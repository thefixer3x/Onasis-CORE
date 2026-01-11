// Test setup file for auth-gateway
import { vi } from 'vitest'

// Mock environment variables (JWT_SECRET must be 32+ chars)
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-must-be-at-least-32-characters-long'
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-supabase-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-service-role-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.DIRECT_DATABASE_URL = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL
process.env.SERVICE_ROLE_DATABASE_URL = process.env.SERVICE_ROLE_DATABASE_URL || process.env.DATABASE_URL

// Keep legacy aliases for older code paths if needed
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.NEON_DATABASE_URL = process.env.DATABASE_URL
