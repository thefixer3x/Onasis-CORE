/**
 * Authentication Configuration
 * CRITICAL: This file contains the authentication configuration
 * that was causing the redirect issues. All URLs must point to
 * Lanonasis infrastructure, NOT external platforms.
 */

const env = import.meta.env

export const authConfig = {
  // Base URLs - FIXED: Stable production-ready endpoints
  authBaseUrl: env.VITE_AUTH_BASE_URL || 'https://auth.lanonasis.com',
  apiBaseUrl: env.VITE_API_BASE_URL || 'https://auth.lanonasis.com',
  
  // OAuth Configuration - FIXED: Proper Lanonasis endpoints
  oauth: {
    clientId: env.VITE_AUTH_CLIENT_ID || 'lanonasis-api-dashboard',
    redirectUri: env.VITE_AUTH_REDIRECT_URI || `${window.location.origin}/v1/auth/callback`,
    scope: 'api:read api:write user:profile dashboard:access',
    
    // Authorization endpoints - FIXED: Internal Lanonasis auth
    endpoints: {
      authorize: '/v1/auth/authorize',
      token: '/v1/auth/token',
      userInfo: '/v1/auth/userinfo',
      logout: '/v1/auth/logout',
      revoke: '/v1/auth/revoke',
    },
  },
  
  // Session Configuration
  session: {
    tokenKey: 'lanonasis_access_token',
    refreshTokenKey: 'lanonasis_refresh_token',
    userKey: 'lanonasis_user',
    expiryKey: 'lanonasis_token_expiry',
  },
  
  // JWT Configuration
  jwt: {
    secret: env.VITE_JWT_SECRET=REDACTED_JWT_SECRET
    expiresIn: env.VITE_JWT_EXPIRY || '7d',
  },
  
  // Route Configuration - FIXED: Internal dashboard routes
  routes: {
    login: '/login',
    signup: '/signup',
    dashboard: '/dashboard',
    callback: '/v1/auth/callback',
    unauthorized: '/unauthorized',
    home: '/',
  },
  
  // Feature Flags
  features: {
    enableOAuth: env.VITE_ENABLE_OAUTH === 'true',
    enableMCP: env.VITE_ENABLE_MCP === 'true',
    enableAnalytics: env.VITE_ENABLE_ANALYTICS === 'true',
  },
}

// Helper function to build full auth URLs
export const buildAuthUrl = (endpoint: string): string => {
  const baseUrl = authConfig.authBaseUrl
  // Ensure no double slashes by removing trailing slash from baseUrl and leading slash from endpoint
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${cleanBaseUrl}${cleanEndpoint}`
}

// Helper function to check if user is authenticated
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem(authConfig.session.tokenKey)
  const expiry = localStorage.getItem(authConfig.session.expiryKey)
  
  if (!token) return false
  
  if (expiry) {
    const expiryTime = new Date(expiry).getTime()
    if (Date.now() > expiryTime) {
      // Token expired, clear storage
      clearAuthStorage()
      return false
    }
  }
  
  return true
}

// Helper function to clear authentication storage
export const clearAuthStorage = (): void => {
  localStorage.removeItem(authConfig.session.tokenKey)
  localStorage.removeItem(authConfig.session.refreshTokenKey)
  localStorage.removeItem(authConfig.session.userKey)
  localStorage.removeItem(authConfig.session.expiryKey)
}