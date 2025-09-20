/**
 * Main App Component
 * Handles routing and authentication flow
 */

import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { Login } from '@/pages/Login'
import { Signup } from '@/pages/Signup'
import { Dashboard } from '@/pages/Dashboard'
import { LandingPage } from '@/pages/LandingPage'
import { OAuthCallback } from '@/pages/OAuthCallback'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { authConfig } from '@/config/auth.config'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  
  useEffect(() => {
    // Check if we're on the OAuth callback route
    if (location.pathname === authConfig.routes.callback) {
      // OAuth callback will be handled by the OAuthCallback component
      return
    }
  }, [location])
  
  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<OAuthCallback />} />
        
        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        
        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App