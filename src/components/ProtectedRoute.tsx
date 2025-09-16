/**
 * Protected Route Component
 * Ensures user is authenticated before accessing protected pages
 */

import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { authConfig } from '@/config/auth.config'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }
  
  if (!isAuthenticated) {
    // Redirect to login page but save the attempted location
    return <Navigate to={authConfig.routes.login} state={{ from: location }} replace />
  }
  
  return <>{children}</>
}