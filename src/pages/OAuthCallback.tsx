/**
 * OAuth Callback Page
 * Handles OAuth redirect and token exchange
 */

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authService } from "@/services/auth.service";
import { authConfig } from "@/config/auth.config";
import { Loader2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

export const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleCallback = useCallback(async () => {
    try {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        throw new Error(errorDescription || error);
      }

      if (!code || !state) {
        throw new Error("Missing authorization code or state");
      }

      // Exchange code for token
      const response = await authService.handleOAuthCallback(code, state);

      // Ensure user data is stored
      if (response && response.user) {
        localStorage.setItem(
          authConfig.session.userKey,
          JSON.stringify(response.user),
        );
      }

      toast.success("Login successful!");

      // Small delay to ensure state is updated
      setTimeout(() => {
        navigate(authConfig.routes.dashboard);
      }, 100);
    } catch (error) {
      console.error("OAuth callback error:", error);
      setError(
        error instanceof Error ? error.message : "Authentication failed",
      );

      // Redirect to login after showing error
      setTimeout(() => {
        navigate(authConfig.routes.login);
      }, 3000);
    }
  }, [navigate, searchParams]);

  useEffect(() => {
    handleCallback();
  }, [handleCallback]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          <div className="flex flex-col items-center">
            <div className="p-3 bg-red-100 dark:bg-red-900 rounded-full mb-4">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Authentication Failed
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
              {error}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Redirecting to login...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Completing Authentication
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please wait while we log you in...
          </p>
        </div>
      </div>
    </div>
  );
};
