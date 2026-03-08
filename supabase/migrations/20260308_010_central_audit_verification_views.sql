-- ============================================================================
-- Central audit verification surfaces
-- Date: 2026-03-08
-- Purpose:
--   1. Add reusable verification and incident-response views over
--      analytics.audit_log.
--   2. Make missing-attribution, denied/failure monitoring, route health,
--      and request-level tracing queryable without ad hoc SQL.
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_audit_log_request_id_created_at
  ON analytics.audit_log (request_id, created_at)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_org_result_created_at
  ON analytics.audit_log (organization_id, result, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_problem_events_created_at
  ON analytics.audit_log (created_at DESC, route_source, action)
  WHERE result IN ('denied', 'failure', 'error', 'warning');

CREATE OR REPLACE VIEW analytics.central_audit_missing_attribution AS
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
  metadata,
  (request_id IS NOT NULL) AS has_request_id,
  (organization_id IS NOT NULL) AS has_organization_id,
  (auth_source IS NOT NULL AND auth_source <> '') AS has_auth_source,
  (actor_id IS NOT NULL) AS has_actor_id,
  (route_source IS NOT NULL AND route_source <> '') AS has_route_source,
  (result IS NOT NULL AND result <> '') AS has_result
FROM analytics.audit_log
WHERE request_id IS NULL
   OR organization_id IS NULL
   OR auth_source IS NULL
   OR auth_source = ''
   OR actor_id IS NULL
   OR route_source IS NULL
   OR route_source = ''
   OR result IS NULL
   OR result = '';

COMMENT ON VIEW analytics.central_audit_missing_attribution IS
  'Audit rows missing one or more key attribution fields required for forensics and verification.';

CREATE OR REPLACE VIEW analytics.central_audit_route_health AS
SELECT
  date_trunc('hour', created_at) AS bucket_hour,
  COALESCE(route_source, 'unknown') AS route_source,
  COALESCE(auth_source, 'unknown') AS auth_source,
  COALESCE(action, 'unknown') AS action,
  COUNT(*)::bigint AS total_events,
  COUNT(*) FILTER (WHERE result = 'success')::bigint AS success_events,
  COUNT(*) FILTER (WHERE result = 'denied')::bigint AS denied_events,
  COUNT(*) FILTER (WHERE result IN ('failure', 'error'))::bigint AS failure_events,
  COUNT(*) FILTER (WHERE result = 'warning')::bigint AS warning_events
FROM analytics.audit_log
GROUP BY 1, 2, 3, 4;

COMMENT ON VIEW analytics.central_audit_route_health IS
  'Hourly operational health rollup by route, auth source, action, and result.';

CREATE OR REPLACE VIEW analytics.central_audit_denied_breakdown AS
SELECT
  date_trunc('hour', created_at) AS bucket_hour,
  COALESCE(route_source, 'unknown') AS route_source,
  COALESCE(auth_source, 'unknown') AS auth_source,
  COALESCE(action, 'unknown') AS action,
  organization_id,
  COALESCE(NULLIF(failure_reason, ''), 'unspecified') AS failure_reason,
  COUNT(*)::bigint AS total_events
FROM analytics.audit_log
WHERE result IN ('denied', 'failure', 'error', 'warning')
GROUP BY 1, 2, 3, 4, 5, 6;

COMMENT ON VIEW analytics.central_audit_denied_breakdown IS
  'Denied/failure/warning events grouped for security regression tracking.';

CREATE OR REPLACE VIEW analytics.central_audit_request_timeline AS
SELECT
  request_id,
  created_at,
  action,
  resource_type,
  resource_id,
  result,
  route_source,
  auth_source,
  actor_id,
  actor_type,
  organization_id,
  failure_reason,
  metadata
FROM analytics.audit_log
WHERE request_id IS NOT NULL
ORDER BY request_id, created_at;

COMMENT ON VIEW analytics.central_audit_request_timeline IS
  'Ordered event timeline for all auditable actions that share a request correlation ID.';

CREATE OR REPLACE FUNCTION public.get_central_audit_request(p_request_id UUID)
RETURNS TABLE (
  created_at TIMESTAMPTZ,
  action TEXT,
  resource_type TEXT,
  resource_id UUID,
  result TEXT,
  route_source TEXT,
  auth_source TEXT,
  actor_id UUID,
  actor_type TEXT,
  organization_id UUID,
  failure_reason TEXT,
  metadata JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, analytics
AS $$
  SELECT
    a.created_at,
    a.action,
    a.resource_type,
    a.resource_id,
    a.result,
    a.route_source,
    a.auth_source,
    a.actor_id,
    a.actor_type,
    a.organization_id,
    a.failure_reason,
    a.metadata
  FROM analytics.audit_log a
  WHERE a.request_id = p_request_id
  ORDER BY a.created_at ASC, a.id ASC;
$$;

COMMENT ON FUNCTION public.get_central_audit_request(UUID) IS
  'Returns the full ordered audit trail for a single request correlation ID.';

COMMIT;
