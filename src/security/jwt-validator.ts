/**
 * JWT validation and project scope enforcement for Edge Functions
 * 
 * This module provides middleware to validate JWT tokens and enforce
 * project_scope claims to prevent cross-project access.
 */

import { createClient } from '@supabase/supabase-js';
import { AuditLogger } from './audit-logger.js';

export interface JWTValidationResult {
  isValid: boolean;
  userId?: string;
  projectScope?: string;
  error?: string;
}

export interface ProjectScopeConfig {
  allowedProjects: string[];
  requireProjectScope: boolean;
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
      // Verify JWT with Supabase
      const { data: { user }, error } = await this.supabase.auth.getUser(token);

      if (error || !user) {
        await this.auditLogger.log({
          action: 'jwt_validation',
          status: 'denied',
          meta: { reason: 'invalid_token', error: error?.message },
          ipAddress,
          userAgent
        });

        return {
          isValid: false,
          error: 'Invalid JWT token'
        };
      }

      // Parse JWT manually to get project_scope claim
      const jwtPayload = this.parseJWTPayload(token);
      const projectScope = jwtPayload?.project_scope;

      // Validate project scope if required
      if (this.projectConfig.requireProjectScope) {
        if (!projectScope) {
          await this.auditLogger.logProjectScopeViolation(
            this.projectConfig.allowedProjects[0],
            'none',
            user.id,
            { reason: 'missing_project_scope', ipAddress, userAgent }
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
            user.id,
            { reason: 'unauthorized_project_scope', ipAddress, userAgent }
          );

          return {
            isValid: false,
            error: `Unauthorized project scope: ${projectScope}`
          };
        }
      }

      // Log successful validation
      await this.auditLogger.log({
        userId: user.id,
        action: 'jwt_validation',
        status: 'allowed',
        meta: { projectScope },
        ipAddress,
        userAgent,
        projectScope
      });

      return {
        isValid: true,
        userId: user.id,
        projectScope
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
   * Parse JWT payload without verification (for extracting claims)
   * Note: This is only used after Supabase has already verified the token
   */
  private parseJWTPayload(token: string): any {
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