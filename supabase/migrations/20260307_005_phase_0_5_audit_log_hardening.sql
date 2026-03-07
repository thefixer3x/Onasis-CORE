-- Phase 0.5 audit hardening for memory and auth attribution
--
-- Live production note:
-- `public.audit_log` is a facade view over `analytics.audit_log`.
-- We harden the backing table and then refresh the public view so the
-- edge-function insert surface remains compatible while gaining the new
-- attribution fields required for forensic tracing.

BEGIN;

ALTER TABLE analytics.audit_log
  ADD COLUMN IF NOT EXISTS request_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS api_key_id UUID,
  ADD COLUMN IF NOT EXISTS auth_source TEXT,
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS actor_type TEXT,
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS channel_id UUID,
  ADD COLUMN IF NOT EXISTS agent_id UUID,
  ADD COLUMN IF NOT EXISTS project_scope TEXT,
  ADD COLUMN IF NOT EXISTS route_source TEXT,
  ADD COLUMN IF NOT EXISTS result TEXT DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

ALTER TABLE analytics.audit_log
  ALTER COLUMN request_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN result SET DEFAULT 'success';

UPDATE analytics.audit_log
SET
  metadata = COALESCE(metadata, '{}'::jsonb),
  result = COALESCE(result, 'success'),
  request_id = COALESCE(request_id, gen_random_uuid());

CREATE INDEX IF NOT EXISTS idx_audit_log_request_id
  ON analytics.audit_log (request_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_api_key_id
  ON analytics.audit_log (api_key_id)
  WHERE api_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id
  ON analytics.audit_log (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created_at
  ON analytics.audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at
  ON analytics.audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_result_created_at
  ON analytics.audit_log (result, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_route_source_created_at
  ON analytics.audit_log (route_source, created_at DESC)
  WHERE route_source IS NOT NULL;

COMMENT ON COLUMN analytics.audit_log.request_id IS
  'Correlation ID propagated across auth-gateway, edge functions, and audit writes.';

COMMENT ON COLUMN analytics.audit_log.api_key_id IS
  'Resolved API key identifier when the request is authenticated by an API key.';

COMMENT ON COLUMN analytics.audit_log.auth_source IS
  'Authentication source, for example api_key, auth_gateway, supabase, or service_role.';

COMMENT ON COLUMN analytics.audit_log.actor_id IS
  'Primary acting principal for the event. This can be a user, agent, or service identity.';

COMMENT ON COLUMN analytics.audit_log.actor_type IS
  'Principal type for actor_id, for example user, agent, service, team, or channel.';

COMMENT ON COLUMN analytics.audit_log.team_id IS
  'Resolved team context at the time of the event when applicable.';

COMMENT ON COLUMN analytics.audit_log.channel_id IS
  'Resolved channel context at the time of the event when applicable.';

COMMENT ON COLUMN analytics.audit_log.agent_id IS
  'Resolved agent identity when the request is executed by or on behalf of an AI agent.';

COMMENT ON COLUMN analytics.audit_log.project_scope IS
  'Application routing scope carried from auth-gateway. This is not the tenant boundary.';

COMMENT ON COLUMN analytics.audit_log.route_source IS
  'Ingress route used to handle the request, for example edge_function or legacy_maas.';

COMMENT ON COLUMN analytics.audit_log.result IS
  'Outcome marker for the audit event, for example success, denied, warning, or failure.';

COMMENT ON COLUMN analytics.audit_log.failure_reason IS
  'Human-readable reason captured for denied or failed audit events.';

CREATE OR REPLACE VIEW public.audit_log AS
SELECT
  id,
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
FROM analytics.audit_log;

COMMENT ON VIEW public.audit_log IS
  'Facade view over analytics.audit_log used by public edge-function audit writes.';

COMMIT;
