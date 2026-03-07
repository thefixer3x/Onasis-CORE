/**
 * Shared audit helper for Supabase Edge Functions.
 *
 * Writes to public.audit_log which is a facade view over analytics.audit_log.
 * The Phase 0.5 migration (20260307_005_phase_0_5_audit_log_hardening.sql) has
 * already extended the backing table with the attribution columns used here.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuditPayload {
  // Core fields (existing)
  user_id?: string;
  organization_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;

  // Phase 0.5 attribution fields
  request_id?: string;
  api_key_id?: string;
  auth_source?: string;
  actor_id?: string;
  actor_type?: string;
  project_scope?: string;
  result?: 'success' | 'denied' | 'failure' | 'warning';
  failure_reason?: string;
  route_source?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract request-level audit context from edge function Request headers.
 *
 * Reads X-Request-ID (propagated from auth-gateway), falls back to a fresh
 * UUID.  Also extracts client IP and user-agent for attribution.
 */
export function extractRequestContext(req: Request): {
  request_id: string;
  ip_address: string;
  user_agent: string;
} {
  const incoming = req.headers.get('x-request-id');
  const request_id =
    incoming && UUID_RE.test(incoming.trim())
      ? incoming.trim()
      : crypto.randomUUID();

  const ip_address =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    '';

  const user_agent = req.headers.get('user-agent') || '';

  return { request_id, ip_address, user_agent };
}

/**
 * Fire-and-forget audit write to public.audit_log.
 *
 * Never throws — audit failures must not interrupt the main request path.
 * Errors are logged to console.error for observability.
 */
export function writeAudit(supabase: SupabaseClient, payload: AuditPayload): void {
  supabase
    .from('audit_log')
    .insert(payload)
    .then(({ error }) => {
      if (error) {
        console.error('[audit] write failed:', error.message, '| action:', payload.action);
      }
    });
}
