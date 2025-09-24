/**
 * Authentication Service
 * Provides structured error handling and consistent session persistence.
 */

import { authConfig, buildAuthUrl, clearAuthStorage } from '@/config/auth.config'
import toast from 'react-hot-toast'

const DEFAULT_STATUS_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Invalid credentials',
  403: 'Account not verified - check your email',
  404: 'Requested resource not found',
  409: 'Conflict detected',
  429: 'Too many attempts - try again later',
  500: 'Authentication service unavailable',
}

class AuthHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'AuthHttpError'
  }
}

const isError = (error: unknown): error is Error => error instanceof Error
const isTypeError = (error: unknown): error is TypeError => error instanceof TypeError
const isErrorWithStatus = (error: unknown, code: number) =>
  isError(error) && error.message.includes(code.toString())

const resolveStatusMessage = (
  error: unknown,
  messages: Record<number, string>
): string | null => {
  for (const [status, message] of Object.entries(messages)) {
    if (isErrorWithStatus(error, Number(status))) {
      return message
    }
  }
  return null
}

const getNetworkErrorMessage = (
  error: unknown,
  fallback: string,
  overrides: Record<number, string> = {}
): string => {
  if (isTypeError(error)) {
    return 'Network error - check your connection'
  }

  const mergedMessages = { ...DEFAULT_STATUS_MESSAGES, ...overrides }

  if (error instanceof AuthHttpError) {
    return mergedMessages[error.status] ?? error.message ?? fallback
  }

  const statusMessage = resolveStatusMessage(error, mergedMessages)
  if (statusMessage) {
    return statusMessage
  }

  if (isError(error) && error.message) {
    return error.message
  }

  return fallback
}

const handleAuthError = (
  error: unknown,
  context: string,
  fallback: string,
  overrides: Record<number, string> = {}
): never => {
  const message = getNetworkErrorMessage(error, fallback, overrides)
  console.error(`${context} error:`, error)
  toast.error(message)
  if (isError(error)) {
    throw error
  }
  throw new Error(message)
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface SignupCredentials extends LoginCredentials {
  name: string
  confirmPassword: string
}

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role?: string
  createdAt: string
}

export interface AuthResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  user: User
}

class AuthService {
  private baseUrl: string
  
  constructor() {
    this.baseUrl = authConfig.apiBaseUrl
  }
  
  /**
   * Helper to properly join URL paths without double slashes
   */
  private joinUrl(path: string): string {
    const cleanBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `${cleanBase}${cleanPath}`
  }
  
  /**
   * Login with email and password
   * FIXED: Now uses internal Lanonasis authentication
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(this.joinUrl(this.baseUrl, '/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Login failed')
      }
      
      const data = await response.json()
      
      // Store authentication data
      this.storeAuthData(data)
      
      return data
    } catch (error) {
      handleCatch(error, 'Login error')
    }
  }
  
  /**
   * Signup new user
   * FIXED: Creates account in Lanonasis system
   */
  async signup(credentials: SignupCredentials): Promise<AuthResponse> {
    try {
      // Validate passwords match
      if (credentials.password !== credentials.confirmPassword) {
        throw new Error('Passwords do not match')
      }
      
      const response = await fetch(this.joinUrl(this.baseUrl, '/auth/signup'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          name: credentials.name,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Signup failed')
      }
      
      const data = await response.json()
      
      // Store authentication data
      this.storeAuthData(data)
      
      return data
    } catch (error) {
      console.error('Signup error:', error)
      toast.error(getNetworkErrorMessage(error, 'Signup failed'))
      throw error
    }
  }
  
  /**
   * OAuth login flow
   * FIXED: Redirects to Lanonasis OAuth endpoint
   */
  async loginWithOAuth(): Promise<void> {
    try {
      const { oauth } = authConfig
      
      // Generate state for CSRF protection
      const state = this.generateState()
      sessionStorage.setItem('oauth_state', state)
      
      // Generate PKCE challenge
      const codeVerifier = this.generateCodeVerifier()
      const codeChallenge = await this.generateCodeChallenge(codeVerifier)
      sessionStorage.setItem('oauth_code_verifier', codeVerifier)
      
      // Build authorization URL
      const params = new URLSearchParams({
        client_id: oauth.clientId,
        redirect_uri: oauth.redirectUri,
        response_type: 'code',
        scope: oauth.scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })
      
      const authUrl = buildAuthUrl(`${oauth.endpoints.authorize}?${params}`)
      
      // Redirect to authorization endpoint
      window.location.href = authUrl
    } catch (error) {
      console.error('OAuth login error:', error)
      toast.error(getNetworkErrorMessage(error, 'Failed to initiate OAuth login'))
      throw error
    }
  }
  
  /**
   * Handle OAuth callback
   * FIXED: Processes callback from Lanonasis OAuth
   */
  async handleOAuthCallback(code: string, state: string): Promise<AuthResponse> {
    try {
      // Verify state
      const savedState = sessionStorage.getItem('oauth_state')
      if (state !== savedState) {
        throw new Error('Invalid state - possible CSRF attack')
      }
      
      // Get code verifier
      const codeVerifier = sessionStorage.getItem('oauth_code_verifier')
      if (!codeVerifier) {
        throw new Error('Code verifier not found')
      }
      
      // Exchange code for token
      const response = await fetch(buildAuthUrl(authConfig.oauth.endpoints.token), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: authConfig.oauth.clientId,
          redirect_uri: authConfig.oauth.redirectUri,
          code_verifier: codeVerifier,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error_description || 'Token exchange failed')
      }
      
      const tokenData = await response.json()
      
      // Get user info
      const userResponse = await fetch(buildAuthUrl(authConfig.oauth.endpoints.userInfo), {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      })
      
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user info')
      }
      
      const userData = await userResponse.json()
      
      const authData: AuthResponse = {
        ...tokenData,
        user: userData,
      }
      
      // Store authentication data
      this.storeAuthData(authData)
      
      // Clean up session storage
      sessionStorage.removeItem('oauth_state')
      sessionStorage.removeItem('oauth_code_verifier')
      
      return authData
    } catch (error) {
      console.error('OAuth callback error:', error)
      toast.error(getNetworkErrorMessage(error, 'OAuth callback failed'))
      throw error
    }
  }
  
  /**
   * Logout user
   * FIXED: Properly clears session and redirects
   */
  async logout(): Promise<void> {
    try {
      const token = localStorage.getItem(authConfig.session.tokenKey)
      
      if (token) {
        // Revoke token on server
        await fetch(buildAuthUrl(authConfig.oauth.endpoints.logout), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
      }
    } catch (error) {
      console.error('Logout error:', error)
      toast.error(getNetworkErrorMessage(error, 'Logout failed'))
      throw error
    } finally {
      // Always clear local storage
      clearAuthStorage()
      
      // Redirect to home
      window.location.href = authConfig.routes.home
    }
  }
  
  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthResponse> {
    try {
      const refreshToken = localStorage.getItem(authConfig.session.refreshTokenKey)
      
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }
      
      const response = await fetch(buildAuthUrl(authConfig.oauth.endpoints.token), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: authConfig.oauth.clientId,
        }),
      })
      
      if (!response.ok) {
        throw new Error('Token refresh failed')
      }
      
      const data = await response.json()
      
      // Update stored tokens
      localStorage.setItem(authConfig.session.tokenKey, data.access_token)
      if (data.refresh_token) {
        localStorage.setItem(authConfig.session.refreshTokenKey, data.refresh_token)
      }
      
      // Update expiry
      const expiryTime = new Date(Date.now() + data.expires_in * 1000)
      localStorage.setItem(authConfig.session.expiryKey, expiryTime.toISOString())
      
      return data
    } catch (error) {
      console.error('Token refresh error:', error)
      toast.error(getNetworkErrorMessage(error, 'Token refresh failed'))
      clearAuthStorage()
      window.location.href = authConfig.routes.login
      throw error
    }
  }
  
  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    const userStr = localStorage.getItem(authConfig.session.userKey)
    if (!userStr) return null
    
    try {
      return JSON.parse(userStr)
    } catch {
      return null
    }
  }
  
  /**
   * Store authentication data in localStorage
   */
  private storeAuthData(data: AuthResponse): void {
    // Set secure, httpOnly cookies instead of localStorage
    this.setSecureCookie(authConfig.session.tokenKey, data.access_token, data.expires_in);
    
    if (data.refresh_token) {
      this.setSecureCookie(authConfig.session.refreshTokenKey, data.refresh_token, 30 * 24 * 60 * 60); // 30 days
    }
    
    if (data.user) {
      // Only store non-sensitive user data in localStorage
      const safeUserData = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        avatar: data.user.avatar
      };
      localStorage.setItem(authConfig.session.userKey, JSON.stringify(safeUserData));
    }
    
    // Calculate and store expiry time
    const expiryTime = new Date(Date.now() + data.expires_in * 1000)
    localStorage.setItem(authConfig.session.expiryKey, expiryTime.toISOString())
  }
  
  private setSecureCookie(name: string, value: string, maxAge: number): void {
    document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; Secure; SameSite=Strict; HttpOnly`;
  }
  
  /**
   * Generate random state for OAuth
   */
  private generateState(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return this.base64URLEncode(array)
  }
  
  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return this.base64URLEncode(array)
  }
  
  /**
   * Generate PKCE code challenge
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return this.base64URLEncode(hash)
  }
  
  /**
   * Base64 URL encode
   */
  private base64URLEncode(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }
}

export const authService = new AuthService()