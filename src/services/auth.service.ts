/**
 * Authentication Service
 * Provides structured error handling and consistent session persistence.
 */

import { authConfig, buildAuthUrl, clearAuthStorage } from '@/config/auth.config'
import toast from 'react-hot-toast'

// HTTP status code to user message mapping
const DEFAULT_STATUS_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Invalid credentials',
  403: 'Account not verified - check your email',
  404: 'Requested resource not found',
  409: 'Conflict detected',
  429: 'Too many attempts - try again later',
  500: 'Authentication service unavailable',
}

// Custom error class for HTTP errors
class AuthHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'AuthHttpError'
  }
}

// Type guards
const isError = (error: unknown): error is Error => error instanceof Error
const isTypeError = (error: unknown): error is TypeError => error instanceof TypeError

// Centralized HTTP response handler
const parseResponse = async <T>(response: Response): Promise<T> => {
  try {
    const text = await response.text()
    if (!text) {
      throw new AuthHttpError('Empty response', response.status)
    }
    return JSON.parse(text) as T
  } catch (error) {
    console.error('Failed to parse response:', error)
    throw new AuthHttpError('Invalid response format', response.status)
  }
}

// Create structured HTTP error
const createHttpError = async (response: Response, fallback: string): Promise<AuthHttpError> => {
  try {
    const errorData = await parseResponse<{ message?: string; error_description?: string }>(response)
    const message = errorData?.message || errorData?.error_description || fallback
    return new AuthHttpError(message, response.status)
  } catch {
    return new AuthHttpError(fallback, response.status)
  }
}

// Get user-friendly error message
const getErrorMessage = (
  error: unknown,
  fallback: string,
  overrides: Record<number, string> = {}
): string => {
  if (isTypeError(error)) {
    return 'Network error - check your connection'
  }

  if (error instanceof AuthHttpError) {
    const messages = { ...DEFAULT_STATUS_MESSAGES, ...overrides }
    return messages[error.status] || error.message || fallback
  }

  if (isError(error)) {
    return error.message || fallback
  }

  return fallback
}

// Centralized error handler
const handleAuthError = (
  error: unknown,
  context: string,
  fallback: string,
  overrides: Record<number, string> = {}
): never => {
  const message = getErrorMessage(error, fallback, overrides)
  console.error(`${context} error:`, error)
  toast.error(message)
  throw isError(error) ? error : new Error(message)
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
  private readonly baseUrl: string

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
   * Ensure HTTP response is successful and parse data
   */
  private async ensureSuccess<T>(response: Response, fallback: string): Promise<T> {
    if (!response.ok) {
      const httpError = await createHttpError(response, fallback)
      throw httpError
    }
    return parseResponse<T>(response)
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(this.joinUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const data = await this.ensureSuccess<AuthResponse>(response, 'Login failed')

      this.storeAuthData(data)
      return data
    } catch (error) {
      return handleAuthError(error, 'Login', 'Login failed', {
        401: 'Invalid email or password',
        403: 'Account not verified - check your email',
        429: 'Too many attempts - try again later',
      })
    }
  }

  /**
   * Signup new user
   */
  async signup(credentials: SignupCredentials): Promise<AuthResponse> {
    try {
      if (credentials.password !== credentials.confirmPassword) {
        throw new Error('Passwords do not match')
      }

      const response = await fetch(this.joinUrl('/auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          name: credentials.name,
        }),
      })

      const data = await this.ensureSuccess<AuthResponse>(response, 'Signup failed')

      this.storeAuthData(data)
      return data
    } catch (error) {
      return handleAuthError(error, 'Signup', 'Signup failed', {
        400: 'Invalid signup information',
        409: 'An account with this email already exists',
      })
    }
  }

  /**
   * OAuth login flow - stores state/verifier in localStorage for persistence
   */
  async loginWithOAuth(): Promise<void> {
    try {
      const { oauth } = authConfig
      const state = this.generateState()
      const codeVerifier = this.generateCodeVerifier()
      const codeChallenge = await this.generateCodeChallenge(codeVerifier)

      // Store in localStorage for persistence across page refreshes
      localStorage.setItem('oauth_state', state)
      localStorage.setItem('oauth_code_verifier', codeVerifier)

      const params = new URLSearchParams({
        client_id: oauth.clientId,
        redirect_uri: oauth.redirectUri,
        response_type: 'code',
        scope: oauth.scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })

      window.location.href = buildAuthUrl(`${oauth.endpoints.authorize}?${params.toString()}`)
    } catch (error) {
      handleAuthError(error, 'OAuth login', 'Failed to initiate OAuth login')
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(code: string, state: string): Promise<AuthResponse> {
    try {
      // Verify state from localStorage
      const savedState = localStorage.getItem('oauth_state')
      if (state !== savedState) {
        throw new Error('Invalid state - possible CSRF attack')
      }

      const codeVerifier = localStorage.getItem('oauth_code_verifier')
      if (!codeVerifier) {
        throw new Error('Code verifier not found')
      }

      // Exchange code for token
      const tokenResponse = await fetch(buildAuthUrl(authConfig.oauth.endpoints.token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: authConfig.oauth.clientId,
          redirect_uri: authConfig.oauth.redirectUri,
          code_verifier: codeVerifier,
        }),
      })

      const tokenData = await this.ensureSuccess<AuthResponse>(tokenResponse, 'Token exchange failed')

      // Get user info
      const userResponse = await fetch(buildAuthUrl(authConfig.oauth.endpoints.userInfo), {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })

      const userData = await this.ensureSuccess<User>(userResponse, 'Failed to fetch user info')

      const authData: AuthResponse = { ...tokenData, user: userData }
      this.storeAuthData(authData)

      // Clean up OAuth state
      localStorage.removeItem('oauth_state')
      localStorage.removeItem('oauth_code_verifier')

      return authData
    } catch (error) {
      return handleAuthError(error, 'OAuth callback', 'OAuth callback failed')
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      const token = localStorage.getItem(authConfig.session.tokenKey)

      if (token) {
        const response = await fetch(buildAuthUrl(authConfig.oauth.endpoints.logout), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })

        // Don't throw on logout endpoint errors - still clear local storage
        if (!response.ok) {
          console.warn('Server logout failed, clearing local storage anyway')
        }
      }
    } catch (error) {
      // Log but don't throw - we want to clear storage regardless
      console.error('Logout error:', error)
    } finally {
      clearAuthStorage()
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: authConfig.oauth.clientId,
        }),
      })

      const data = await this.ensureSuccess<AuthResponse>(response, 'Token refresh failed')
      this.storeAuthData(data)
      return data
    } catch (error) {
      clearAuthStorage()
      window.location.href = authConfig.routes.login
      return handleAuthError(error, 'Token refresh', 'Token refresh failed')
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    const userStr = localStorage.getItem(authConfig.session.userKey)
    if (!userStr) return null

    try {
      return JSON.parse(userStr) as User
    } catch {
      return null
    }
  }

  /**
   * Store authentication data consistently in localStorage
   */
  private storeAuthData(data: AuthResponse): void {
    localStorage.setItem(authConfig.session.tokenKey, data.access_token)

    if (data.refresh_token) {
      localStorage.setItem(authConfig.session.refreshTokenKey, data.refresh_token)
    }

    if (data.user) {
      const safeUserData = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        avatar: data.user.avatar,
        role: data.user.role,
        createdAt: data.user.createdAt
      }
      localStorage.setItem(authConfig.session.userKey, JSON.stringify(safeUserData))
    }

    const expiryTime = new Date(Date.now() + data.expires_in * 1000)
    localStorage.setItem(authConfig.session.expiryKey, expiryTime.toISOString())
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
