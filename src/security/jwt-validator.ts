/**
 * JWT validation and project scope enforcement for Edge Functions
 *
 * This module provides middleware to validate JWT tokens and enforce
 * project_scope claims to prevent cross-project access.
 *
 * Supports dual validation:
 * 1. Auth-gateway JWTs (via /oauth/introspect)
 * 2. Supabase JWTs (via supabase.auth.getUser)
 */

import { createClient } from '@supabase/supabase-js';
import { AuditLogger } from './audit-logger.js';

export interface JWTValidationResult {
  isValid: boolean;
  userId?: string;
  projectScope?: string;
  error?: string;
  /**
   * Indicates which authentication backend validated the token.
   * - 'auth_gateway': Validated via auth-gateway's /oauth/introspect (RFC 7662)
   * - 'supabase': Validated via Supabase's auth.getUser() as fallback
   */
  authSource?: 'auth_gateway' | 'supabase';
}

export interface ProjectScopeConfig {
  allowedProjects: string[];
  requireProjectScope: boolean;
  authGatewayUrl?: string;  // Optional - defaults to https://auth.lanonasis.com
}

export class JWTValidator {
  private supabase;
  private auditLogger: AuditLogger;
  private projectConfig: ProjectScopeConfig;

  constructor(
    supabaseUrl: string,
    supabaseServiceKey: string,
    auditLogger: AuditLogger,
    projectConfig: ProjectScopeConfig
  ) {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    this.auditLogger = auditLogger;
    this.projectConfig = projectConfig;
  }

  /**
   * Validate JWT token and check project scope
   * Supports: auth-gateway JWTs (via introspection) and Supabase JWTs
   */
  async validateRequest(request: Request): Promise<JWTValidationResult> {
    const authHeader = request.headers.get('Authorization');
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await this.auditLogger.log({
        action: 'jwt_validation',
        status: 'denied',
        meta: { reason: 'missing_auth_header' },
        ipAddress,
        userAgent
      });

      return {
        isValid: false,
        error: 'Missing or invalid Authorization header'
      };
    }

    const token = authHeader.substring(7);

    try {
      // Try auth-gateway introspection first (prevents bad_jwt errors)
      const authGatewayResult = await this.validateViaAuthGateway(token);
      if (authGatewayResult) {
        return this.finalizeValidation(authGatewayResult, ipAddress, userAgent);
      }

      // Fall back to Supabase JWT validation
      const supabaseResult = await this.validateViaSupabase(token);
      if (supabaseResult) {
        return this.finalizeValidation(supabaseResult, ipAddress, userAgent);
      }

      // Both validations failed
      await this.auditLogger.log({
        action: 'jwt_validation',
        status: 'denied',
        meta: { reason: 'invalid_token' },
        ipAddress,
        userAgent
      });

      return {
        isValid: false,
        error: 'Invalid JWT token'
      };

    } catch (error) {
      await this.auditLogger.log({
        action: 'jwt_validation',
        status: 'error',
        meta: {
          reason: 'validation_error',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        ipAddress,
        userAgent
      });

      return {
        isValid: false,
        error: 'JWT validation error'
      };
    }
  }

  /**
   * Validate token via auth-gateway's /oauth/introspect endpoint
   */
  private async validateViaAuthGateway(token: string): Promise<{ userId: string; projectScope?: string; authSource: 'auth_gateway' } | null> {
    const authGatewayUrl = this.projectConfig.authGatewayUrl || 'https://auth.lanonasis.com';

    try {
      const response = await fetch(`${authGatewayUrl}/oauth/introspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(token)}`,
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (!data.active) return null;

      const userId = data.sub || data.user_id;
      if (!userId) return null;

      // Extract project scope from introspection response
      const projectScope = data.scope?.split(' ')[0] || data.project_scope;

      return { userId, projectScope, authSource: 'auth_gateway' };
    } catch {
      // Auth-gateway unavailable - fall back to Supabase
      return null;
    }
  }

  /**
   * Validate token via Supabase's auth.getUser()
   */
  private async validateViaSupabase(token: string): Promise<{ userId: string; projectScope?: string; authSource: 'supabase' } | null> {
    try {
      const { data: { user }, error: supabaseError } = await this.supabase.auth.getUser(token);

      if (supabaseError || !user) return null;

      // Parse JWT to get project_scope claim
      const jwtPayload = this.parseJWTPayload(token);
      const projectScope = typeof jwtPayload?.project_scope === 'string'
        ? jwtPayload.project_scope
        : undefined;

      return { userId: user.id, projectScope, authSource: 'supabase' };
    } catch {
      return null;
    }
  }

  /**
   * Finalize validation: check project scope and log result
   */
  private async finalizeValidation(
    result: { userId: string; projectScope?: string; authSource: 'auth_gateway' | 'supabase' },
    ipAddress: string,
    userAgent: string
  ): Promise<JWTValidationResult> {
    const { userId, projectScope, authSource } = result;

    // Validate project scope if required
    if (this.projectConfig.requireProjectScope) {
      if (!projectScope) {
        await this.auditLogger.logProjectScopeViolation(
          this.projectConfig.allowedProjects[0],
          'none',
          userId,
          { reason: 'missing_project_scope', ipAddress, userAgent, authSource }
        );

        return {
          isValid: false,
          error: 'Missing project_scope in JWT'
        };
      }

      if (!this.projectConfig.allowedProjects.includes(projectScope)) {
        await this.auditLogger.logProjectScopeViolation(
          projectScope,
          this.projectConfig.allowedProjects.join(','),
          userId,
          { reason: 'unauthorized_project_scope', ipAddress, userAgent, authSource }
        );

        return {
          isValid: false,
          error: `Unauthorized project scope: ${projectScope}`
        };
      }
    }

    // Log successful validation
    await this.auditLogger.log({
      userId,
      action: 'jwt_validation',
      status: 'allowed',
      meta: { projectScope, authSource },
      ipAddress,
      userAgent,
      projectScope
    });

    return {
      isValid: true,
      userId,
      projectScope,
      authSource
    };
  }

  /**
   * Parse JWT payload without verification (for extracting claims)
   * Note: This is only used after Supabase has already verified the token
   */
  private parseJWTPayload(token: string): Record<string, unknown> | null {
    try {
      const base64Payload = token.split('.')[1];
      const payload = atob(base64Payload);
      return JSON.parse(payload);
    } catch (error) {
      console.error('Failed to parse JWT payload:', error);
      return null;
    }
  }
}

/**
 * Create middleware function for Edge Functions
 */
export function createJWTMiddleware(
  supabaseUrl: string,
  supabaseServiceKey: string,
  auditLogger: AuditLogger,
  projectConfig: ProjectScopeConfig
) {
  const validator = new JWTValidator(supabaseUrl, supabaseServiceKey, auditLogger, projectConfig);

  return async (request: Request): Promise<{ 
    isValid: boolean; 
    userId?: string; 
    projectScope?: string; 
    error?: string 
  }> => {
    return validator.validateRequest(request);
  };
}

/**
 * Helper to create standardized error responses
 */
export function createErrorResponse(message: string, status = 401): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    }
  );
}