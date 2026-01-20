/**
 * Centralized audit logging client for the Onasis Core security framework
 * 
 * This module provides a standardized interface for logging security-critical
 * events across all projects in the monorepo to the core.logs table.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AuditLogEntry {
  project: string;
  userId?: string;
  action: string;
  target?: string;
  status: 'allowed' | 'denied' | 'error';
  meta?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  projectScope?: string;
}

export interface AuditLoggerConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  projectName: string;
}

export class AuditLogger {
  private supabase: SupabaseClient;
  private projectName: string;

  constructor(config: AuditLoggerConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    this.projectName = config.projectName;
  }

  /**
   * Log a security event to core.logs
   */
  async log(entry: Omit<AuditLogEntry, 'project'>): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('core.log_event', {
        p_project: this.projectName,
        p_user_id: entry.userId || null,
        p_action: entry.action,
        p_target: entry.target || null,
        p_status: entry.status,
        p_meta: entry.meta || {},
        p_ip_address: entry.ipAddress || null,
        p_user_agent: entry.userAgent || null,
        p_project_scope: entry.projectScope || null
      });

      if (error) {
        console.error('Failed to log audit event:', error);
        // Don't throw - audit logging failures shouldn't break application flow
      }
    } catch (err) {
      console.error('Audit logging error:', err);
    }
  }

  /**
   * Log successful authentication
   */
  async logAuth(userId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.log({
      userId,
      action: 'auth_success',
      status: 'allowed',
      meta
    });
  }

  /**
   * Log failed authentication attempt
   */
  async logAuthFailure(reason: string, meta?: Record<string, unknown>): Promise<void> {
    await this.log({
      action: 'auth_failure',
      status: 'denied',
      meta: { reason, ...meta }
    });
  }

  /**
   * Log Edge Function call
   */
  async logFunctionCall(
    functionName: string, 
    userId?: string, 
    status: 'allowed' | 'denied' = 'allowed',
    meta?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      userId,
      action: 'function_call',
      target: functionName,
      status,
      meta
    });
  }

  /**
   * Log database access
   */
  async logDatabaseAccess(
    table: string,
    operation: string,
    userId?: string,
    status: 'allowed' | 'denied' = 'allowed',
    meta?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      userId,
      action: 'db_access',
      target: `${table}.${operation}`,
      status,
      meta
    });
  }

  /**
   * Log project scope violation
   */
  async logProjectScopeViolation(
    requestedProject: string,
    actualScope: string,
    userId?: string,
    meta?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      userId,
      action: 'project_scope_violation',
      target: requestedProject,
      status: 'denied',
      meta: {
        requestedProject,
        actualScope,
        ...meta
      }
    });
  }
}

/**
 * Create an audit logger instance for a specific project
 */
export function createAuditLogger(config: AuditLoggerConfig): AuditLogger {
  return new AuditLogger(config);
}