-- ============================================================================
-- Phase 0.5 completion: centralize auth-gateway/MCP/OAuth audit projection
-- Date: 2026-03-08
-- Purpose:
--   1. Extend apply_auth_event() so auth events projected from auth-gateway
--      also materialize into analytics.audit_log.
--   2. Backfill existing AuthEventLogged rows already present in public.auth_events.
--   3. Add verification views/functions so we can measure projection gaps and
--      missing attribution fields from one central place.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.try_uuid(p_value TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;

  RETURN p_value::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_inet(p_value TEXT)
RETURNS inet
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;

  RETURN p_value::inet;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_auth_event_to_audit_log(
  p_event_id UUID,
  p_aggregate_type TEXT,
  p_aggregate_id TEXT,
  p_event_type TEXT,
  p_payload JSONB,
  p_metadata JSONB,
  p_occurred_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, analytics
AS $$
DECLARE
  v_payload JSONB := COALESCE(p_payload, '{}'::jsonb);
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_action TEXT := COALESCE(v_payload->>'event_type', p_event_type);
  v_success BOOLEAN := COALESCE((v_payload->>'success')::boolean, true);
  v_user_id UUID := public.try_uuid(
    COALESCE(
      v_metadata->>'user_id',
      CASE WHEN p_aggregate_type = 'user' THEN p_aggregate_id ELSE NULL END
    )
  );
  v_actor_id UUID := public.try_uuid(
    COALESCE(
      v_metadata->>'actor_id',
      v_metadata->>'user_id',
      CASE WHEN p_aggregate_type = 'user' THEN p_aggregate_id ELSE NULL END
    )
  );
  v_actor_type TEXT := COALESCE(
    v_metadata->>'actor_type',
    CASE
      WHEN v_actor_id IS NOT NULL THEN 'user'
      WHEN p_aggregate_type = 'client' THEN 'service'
      ELSE NULL
    END
  );
  v_result TEXT := COALESCE(
    CASE
      WHEN v_metadata->>'result' = 'failure' THEN 'error'
      ELSE v_metadata->>'result'
    END,
    CASE WHEN v_success THEN 'success' ELSE 'error' END
  );
  v_projected BOOLEAN := false;
BEGIN
  IF p_event_type NOT IN ('AuthEventLogged', 'OAuthAuditLogged') THEN
    RETURN false;
  END IF;

  INSERT INTO analytics.audit_log (
    user_id,
    organization_id,
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent,
    created_at,
    request_id,
    api_key_id,
    auth_source,
    actor_id,
    actor_type,
    team_id,
    channel_id,
    agent_id,
    project_scope,
    result,
    failure_reason,
    route_source
  )
  SELECT
    v_user_id,
    public.try_uuid(v_metadata->>'organization_id'),
    COALESCE(NULLIF(v_action, ''), p_event_type),
    'auth_event',
    p_event_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'aggregate_type', p_aggregate_type,
        'aggregate_id', p_aggregate_id,
        'platform', v_payload->>'platform',
        'client_id', COALESCE(v_payload->>'client_id', v_metadata->>'client_id'),
        'grant_type', v_payload->>'grant_type',
        'scope', COALESCE(v_payload->'scope', v_metadata->'scope'),
        'success', v_success,
        'source_event_type', p_event_type,
        'raw_payload', v_payload,
        'raw_metadata', v_metadata
      )
    ),
    public.try_inet(v_metadata->>'ip_address'),
    NULLIF(v_metadata->>'user_agent', ''),
    COALESCE(p_occurred_at, NOW()),
    public.try_uuid(v_metadata->>'request_id'),
    public.try_uuid(v_metadata->>'api_key_id'),
    COALESCE(
      v_metadata->>'auth_source',
      CASE
        WHEN p_event_type = 'OAuthAuditLogged' THEN 'oauth'
        ELSE 'auth_gateway'
      END
    ),
    v_actor_id,
    v_actor_type,
    public.try_uuid(v_metadata->>'team_id'),
    public.try_uuid(v_metadata->>'channel_id'),
    public.try_uuid(v_metadata->>'agent_id'),
    v_metadata->>'project_scope',
    v_result,
    COALESCE(
      v_metadata->>'failure_reason',
      v_payload->>'error_message',
      v_payload->>'error_description'
    ),
    COALESCE(
      v_metadata->>'route_source',
      CASE
        WHEN p_event_type = 'OAuthAuditLogged' THEN 'auth_gateway_oauth'
        ELSE 'auth_gateway'
      END
    )
  WHERE NOT EXISTS (
    SELECT 1
    FROM analytics.audit_log a
    WHERE a.resource_type = 'auth_event'
      AND a.resource_id = p_event_id
  )
  RETURNING true INTO v_projected;

  RETURN COALESCE(v_projected, false);
END;
$$;

COMMENT ON FUNCTION public.project_auth_event_to_audit_log(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ) IS
  'Projects auth-gateway event-store rows into the central analytics.audit_log surface when the event is audit-relevant.';

CREATE OR REPLACE FUNCTION public.apply_auth_event(
  p_event_id UUID,
  p_aggregate_type TEXT,
  p_aggregate_id TEXT,
  p_version BIGINT,
  p_event_type TEXT,
  p_event_type_version INTEGER,
  p_payload JSONB,
  p_metadata JSONB,
  p_occurred_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_result JSONB;
  v_is_new BOOLEAN;
  v_projected_to_audit BOOLEAN := false;
BEGIN
  INSERT INTO public.auth_events (
    event_id,
    aggregate_type,
    aggregate_id,
    version,
    event_type,
    event_type_version,
    payload,
    metadata,
    occurred_at
  ) VALUES (
    p_event_id,
    p_aggregate_type,
    p_aggregate_id,
    p_version,
    p_event_type,
    p_event_type_version,
    p_payload,
    p_metadata,
    p_occurred_at
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING true INTO v_is_new;

  v_projected_to_audit := public.project_auth_event_to_audit_log(
    p_event_id,
    p_aggregate_type,
    p_aggregate_id,
    p_event_type,
    p_payload,
    p_metadata,
    p_occurred_at
  );

  v_result := jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'is_new', COALESCE(v_is_new, false),
    'projected_to_audit', COALESCE(v_projected_to_audit, false),
    'ingested_at', NOW()
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'event_id', p_event_id,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$$;

DO $$
DECLARE
  event_row RECORD;
BEGIN
  FOR event_row IN
    SELECT
      event_id,
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      metadata,
      occurred_at
    FROM public.auth_events
    WHERE event_type IN ('AuthEventLogged', 'OAuthAuditLogged')
    ORDER BY occurred_at ASC
  LOOP
    PERFORM public.project_auth_event_to_audit_log(
      event_row.event_id,
      event_row.aggregate_type,
      event_row.aggregate_id,
      event_row.event_type,
      event_row.payload,
      event_row.metadata,
      event_row.occurred_at
    );
  END LOOP;
END $$;

CREATE OR REPLACE VIEW analytics.central_audit_projection_gaps AS
SELECT
  e.event_id,
  e.aggregate_type,
  e.aggregate_id,
  e.event_type,
  e.occurred_at,
  e.metadata
FROM public.auth_events e
WHERE e.event_type IN ('AuthEventLogged', 'OAuthAuditLogged')
  AND NOT EXISTS (
    SELECT 1
    FROM analytics.audit_log a
    WHERE a.resource_type = 'auth_event'
      AND a.resource_id = e.event_id
  );

COMMENT ON VIEW analytics.central_audit_projection_gaps IS
  'Auditable auth events that exist in public.auth_events but are missing from analytics.audit_log.';

CREATE OR REPLACE VIEW analytics.central_audit_field_completeness AS
SELECT
  COUNT(*)::bigint AS total_auth_event_audit_rows,
  COUNT(*) FILTER (WHERE request_id IS NULL)::bigint AS missing_request_id,
  COUNT(*) FILTER (WHERE organization_id IS NULL)::bigint AS missing_organization_id,
  COUNT(*) FILTER (WHERE auth_source IS NULL OR auth_source = '')::bigint AS missing_auth_source,
  COUNT(*) FILTER (WHERE actor_id IS NULL)::bigint AS missing_actor_id,
  COUNT(*) FILTER (WHERE route_source IS NULL OR route_source = '')::bigint AS missing_route_source,
  COUNT(*) FILTER (WHERE result IS NULL OR result = '')::bigint AS missing_result,
  MAX(created_at) AS newest_projected_at,
  MIN(created_at) AS oldest_projected_at
FROM analytics.audit_log
WHERE resource_type = 'auth_event';

COMMENT ON VIEW analytics.central_audit_field_completeness IS
  'Field-completeness summary for auth-originated rows projected into analytics.audit_log.';

CREATE OR REPLACE FUNCTION public.get_central_audit_projection_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, analytics
AS $$
  SELECT jsonb_build_object(
    'auth_events_total', (SELECT COUNT(*) FROM public.auth_events),
    'auditable_auth_events_total', (
      SELECT COUNT(*)
      FROM public.auth_events
      WHERE event_type IN ('AuthEventLogged', 'OAuthAuditLogged')
    ),
    'projected_auth_event_audit_rows', (
      SELECT COUNT(*)
      FROM analytics.audit_log
      WHERE resource_type = 'auth_event'
    ),
    'projection_gaps', (
      SELECT COUNT(*)
      FROM analytics.central_audit_projection_gaps
    ),
    'field_completeness', (
      SELECT to_jsonb(c)
      FROM analytics.central_audit_field_completeness c
    ),
    'by_route_source', (
      SELECT COALESCE(jsonb_object_agg(route_source, route_count), '{}'::jsonb)
      FROM (
        SELECT route_source, COUNT(*) AS route_count
        FROM analytics.audit_log
        WHERE resource_type = 'auth_event'
        GROUP BY route_source
      ) grouped
    ),
    'by_auth_source', (
      SELECT COALESCE(jsonb_object_agg(auth_source, source_count), '{}'::jsonb)
      FROM (
        SELECT auth_source, COUNT(*) AS source_count
        FROM analytics.audit_log
        WHERE resource_type = 'auth_event'
        GROUP BY auth_source
      ) grouped
    )
  );
$$;

COMMENT ON FUNCTION public.get_central_audit_projection_stats() IS
  'Returns central-audit projection and completeness metrics for auth/MCP/OAuth event ingestion.';

COMMIT;
