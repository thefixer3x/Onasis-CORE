// Test setup file for auth-gateway
import { vi } from 'vitest'

// Mock environment variables (JWT_SECRET must be 32+ chars)
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-must-be-at-least-32-characters-long'
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key-that-is-long-enough'
process.env.NEON_DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
