-- ============================================================================
-- Central MCP audit verification surfaces
-- Date: 2026-03-08
-- Purpose:
--   1. Make MCP traffic clearly queryable in central Supabase analytics.
--   2. Provide dedicated verification surfaces for MCP-specific auth events.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW analytics.central_mcp_audit_events AS
SELECT
  id,
  created_at,
  action,
  resource_type,
  resource_id,
  user_id,
  organization_id,
  request_id,
  api_key_id,
  auth_source,
  actor_id,
  actor_type,
  project_scope,
  route_source,
  result,
  failure_reason,
  metadata
FROM analytics.audit_log
WHERE route_source = 'auth_gateway_mcp'
   OR auth_source = 'mcp_password'
   OR action LIKE 'mcp_%';

COMMENT ON VIEW analytics.central_mcp_audit_events IS
  'Central analytics view for MCP-originated auth and audit activity.';

CREATE OR REPLACE VIEW analytics.central_mcp_audit_health AS
SELECT
  date_trunc('hour', created_at) AS bucket_hour,
  COALESCE(action, 'unknown') AS action,
  COALESCE(result, 'unknown') AS result,
  COUNT(*)::bigint AS total_events,
  COUNT(*) FILTER (WHERE request_id IS NULL)::bigint AS missing_request_id,
  COUNT(*) FILTER (WHERE organization_id IS NULL)::bigint AS missing_organization_id,
  COUNT(*) FILTER (WHERE actor_id IS NULL)::bigint AS missing_actor_id
FROM analytics.central_mcp_audit_events
GROUP BY 1, 2, 3;

COMMENT ON VIEW analytics.central_mcp_audit_health IS
  'Hourly MCP audit completeness and outcome breakdown from the central analytics sink.';

CREATE OR REPLACE FUNCTION public.get_central_mcp_audit_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, analytics
AS $$
  SELECT jsonb_build_object(
    'total_mcp_events', (SELECT COUNT(*) FROM analytics.central_mcp_audit_events),
    'success_events', (
      SELECT COUNT(*)
      FROM analytics.central_mcp_audit_events
      WHERE result = 'success'
    ),
    'denied_or_failed_events', (
      SELECT COUNT(*)
      FROM analytics.central_mcp_audit_events
      WHERE result IN ('denied', 'failure', 'error', 'warning')
    ),
    'missing_request_id', (
      SELECT COUNT(*)
      FROM analytics.central_mcp_audit_events
      WHERE request_id IS NULL
    ),
    'missing_organization_id', (
      SELECT COUNT(*)
      FROM analytics.central_mcp_audit_events
      WHERE organization_id IS NULL
    ),
    'missing_actor_id', (
      SELECT COUNT(*)
      FROM analytics.central_mcp_audit_events
      WHERE actor_id IS NULL
    ),
    'latest_event_at', (
      SELECT MAX(created_at)
      FROM analytics.central_mcp_audit_events
    )
  );
$$;

COMMENT ON FUNCTION public.get_central_mcp_audit_stats() IS
  'Returns summary verification metrics for MCP-originated central audit events.';

COMMIT;
