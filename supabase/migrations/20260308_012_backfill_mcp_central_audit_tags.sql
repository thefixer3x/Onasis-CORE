-- ============================================================================
-- MCP central audit tagging backfill
-- Date: 2026-03-08
-- Purpose:
--   1. Update the auth-event projector so MCP events get explicit MCP route
--      and auth tags in analytics.audit_log.
--   2. Backfill already-projected MCP auth rows so MCP verification views are
--      useful immediately.
-- ============================================================================

BEGIN;

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
  v_is_mcp BOOLEAN := COALESCE(v_payload->>'platform', '') = 'mcp'
    OR COALESCE(v_payload->>'event_type', '') LIKE 'mcp_%'
    OR p_event_type = 'McpAuditLogged';
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
        WHEN v_is_mcp THEN 'mcp_password'
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
        WHEN v_is_mcp THEN 'auth_gateway_mcp'
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

UPDATE analytics.audit_log
SET
  route_source = 'auth_gateway_mcp',
  auth_source = CASE
    WHEN auth_source IS NULL OR auth_source = '' OR auth_source = 'auth_gateway'
      THEN 'mcp_password'
    ELSE auth_source
  END
WHERE resource_type = 'auth_event'
  AND (
    action LIKE 'mcp_%'
    OR metadata->>'platform' = 'mcp'
    OR metadata->'raw_payload'->>'platform' = 'mcp'
    OR metadata->'raw_payload'->>'event_type' LIKE 'mcp_%'
  );

COMMIT;
