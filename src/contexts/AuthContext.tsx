/**
 * Authentication Context
 * Provides authentication state and methods throughout the app
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService, User, LoginCredentials, SignupCredentials } from '@/services/auth.service'
import { authConfig, isAuthenticated } from '@/config/auth.config'
import toast from 'react-hot-toast'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  signup: (credentials: SignupCredentials) => Promise<void>
  loginWithOAuth: () => Promise<void>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  
  // Initialize auth state on mount
  useEffect(() => {
    initializeAuth()
  }, [])
  
  // Set up token refresh interval
  useEffect(() => {
    if (!isAuthenticated()) return
    
    const refreshInterval = setInterval(() => {
      refreshAuth()
    }, 30 * 60 * 1000) // Refresh every 30 minutes
    
    return () => clearInterval(refreshInterval)
  }, [user])
  
  const initializeAuth = async () => {
    try {
      // Check if we have a token
      const token = localStorage.getItem(authConfig.session.tokenKey)
      
      if (token && isAuthenticated()) {
        // First try to get user from localStorage
        const currentUser = authService.getCurrentUser()
        
        if (currentUser) {
          setUser(currentUser)
        } else {
          // If no user in storage, try to fetch from API
          try {
            const response = await fetch(`${authConfig.apiBaseUrl}/auth/userinfo`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            })
            
            if (response.ok) {
              const userData = await response.json()
              setUser(userData)
              localStorage.setItem(authConfig.session.userKey, JSON.stringify(userData))
            }
          } catch (fetchError) {
            console.error('Failed to fetch user info:', fetchError)
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true)
      const response = await authService.login(credentials)
      setUser(response.user)
      toast.success('Login successful!')
      navigate(authConfig.routes.dashboard)
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }
  
  const signup = async (credentials: SignupCredentials) => {
    try {
      setIsLoading(true)
      const response = await authService.signup(credentials)
      setUser(response.user)
      toast.success('Account created successfully!')
      navigate(authConfig.routes.dashboard)
    } catch (error) {
      console.error('Signup failed:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }
  
  const loginWithOAuth = async () => {
    try {
      setIsLoading(true)
      await authService.loginWithOAuth()
      // User will be redirected to OAuth provider
    } catch (error) {
      console.error('OAuth login failed:', error)
      setIsLoading(false)
      throw error
    }
  }
  
  const logout = async () => {
    try {
      setIsLoading(true)
      await authService.logout()
      setUser(null)
      toast.success('Logged out successfully')
      navigate(authConfig.routes.home)
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const refreshAuth = async () => {
    try {
      const response = await authService.refreshToken()
      if (response.user) {
        setUser(response.user)
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
      setUser(null)
    }
  }
  
  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    signup,
    loginWithOAuth,
    logout,
    refreshAuth,
  }
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}