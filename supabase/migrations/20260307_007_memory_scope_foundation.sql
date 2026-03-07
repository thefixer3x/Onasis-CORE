-- ============================================================================
-- Phase 1: Memory scope foundation (compatibility mode)
-- Date: 2026-03-07
-- Purpose:
--   1. Add explicit scope and ownership columns to the backing memory table.
--   2. Preserve today's effective organization-scoped behavior for existing
--      clients until handlers are updated to write richer scope metadata.
--   3. Refresh the public facade view so edge functions can read the new
--      columns without changing table targets.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'memory_scope'
  ) THEN
    CREATE TYPE public.memory_scope AS ENUM (
      'personal',
      'team',
      'channel',
      'organization',
      'agent',
      'project'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'memory_owner_type'
  ) THEN
    CREATE TYPE public.memory_owner_type AS ENUM (
      'user',
      'team',
      'channel',
      'organization',
      'agent',
      'project'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'memory_access_mode'
  ) THEN
    CREATE TYPE public.memory_access_mode AS ENUM ('private', 'shared');
  END IF;
END $$;

ALTER TABLE security_service.memory_entries
  ADD COLUMN IF NOT EXISTS scope public.memory_scope,
  ADD COLUMN IF NOT EXISTS owner_type public.memory_owner_type,
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS channel_id UUID,
  ADD COLUMN IF NOT EXISTS agent_id UUID,
  ADD COLUMN IF NOT EXISTS access_mode public.memory_access_mode,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION security_service.apply_memory_scope_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, NEW.user_id);
  NEW.scope := COALESCE(NEW.scope, 'organization'::public.memory_scope);

  IF NEW.owner_type IS NULL THEN
    NEW.owner_type := CASE
      WHEN NEW.scope = 'personal' AND NEW.user_id IS NOT NULL
        THEN 'user'::public.memory_owner_type
      WHEN NEW.scope = 'team'
        THEN 'team'::public.memory_owner_type
      WHEN NEW.scope = 'channel'
        THEN 'channel'::public.memory_owner_type
      WHEN NEW.scope = 'agent'
        THEN 'agent'::public.memory_owner_type
      WHEN NEW.scope = 'project'
        THEN 'project'::public.memory_owner_type
      ELSE 'organization'::public.memory_owner_type
    END;
  END IF;

  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := CASE
      WHEN NEW.scope = 'personal' AND NEW.user_id IS NOT NULL THEN NEW.user_id
      WHEN NEW.scope = 'team' THEN NEW.team_id
      WHEN NEW.scope = 'channel' THEN NEW.channel_id
      WHEN NEW.scope = 'agent' THEN NEW.agent_id
      ELSE NEW.organization_id
    END;
  END IF;

  IF NEW.access_mode IS NULL THEN
    NEW.access_mode := CASE
      WHEN NEW.scope = 'personal' THEN 'private'::public.memory_access_mode
      ELSE 'shared'::public.memory_access_mode
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_memory_scope_defaults ON security_service.memory_entries;
CREATE TRIGGER apply_memory_scope_defaults
  BEFORE INSERT OR UPDATE ON security_service.memory_entries
  FOR EACH ROW
  EXECUTE FUNCTION security_service.apply_memory_scope_defaults();

UPDATE security_service.memory_entries
SET
  created_by = COALESCE(created_by, user_id),
  scope = COALESCE(scope, 'organization'::public.memory_scope),
  owner_type = COALESCE(owner_type, 'organization'::public.memory_owner_type),
  owner_id = COALESCE(owner_id, organization_id),
  access_mode = COALESCE(
    access_mode,
    CASE
      WHEN COALESCE(scope, 'organization'::public.memory_scope) = 'personal'
        THEN 'private'::public.memory_access_mode
      ELSE 'shared'::public.memory_access_mode
    END
  );

ALTER TABLE security_service.memory_entries
  ALTER COLUMN scope SET DEFAULT 'organization'::public.memory_scope,
  ALTER COLUMN owner_type SET DEFAULT 'organization'::public.memory_owner_type,
  ALTER COLUMN access_mode SET DEFAULT 'shared'::public.memory_access_mode;

CREATE INDEX IF NOT EXISTS idx_memory_entries_scope
  ON security_service.memory_entries(scope);

CREATE INDEX IF NOT EXISTS idx_memory_entries_owner
  ON security_service.memory_entries(owner_type, owner_id);

CREATE INDEX IF NOT EXISTS idx_memory_entries_created_by
  ON security_service.memory_entries(created_by);

CREATE INDEX IF NOT EXISTS idx_memory_entries_team_id
  ON security_service.memory_entries(team_id)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_channel_id
  ON security_service.memory_entries(channel_id)
  WHERE channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_agent_id
  ON security_service.memory_entries(agent_id)
  WHERE agent_id IS NOT NULL;

COMMENT ON COLUMN security_service.memory_entries.scope IS
  'Compatibility default is organization until handlers begin writing explicit scopes.';

COMMENT ON COLUMN security_service.memory_entries.owner_type IS
  'Explicit owner kind for future ACL and grant checks.';

COMMENT ON COLUMN security_service.memory_entries.owner_id IS
  'Explicit owner id. Compatibility default is organization_id.';

COMMENT ON COLUMN security_service.memory_entries.created_by IS
  'Original creator of the memory. Backfilled from user_id.';

COMMENT ON COLUMN security_service.memory_entries.access_mode IS
  'Compatibility default is shared for non-personal scopes.';

CREATE OR REPLACE VIEW public.memory_entries AS
SELECT
  id,
  title,
  content,
  memory_type,
  tags,
  topic_id,
  user_id,
  organization_id,
  embedding,
  voyage_embedding,
  embedding_provider,
  embedding_model,
  metadata,
  created_at,
  updated_at,
  last_accessed,
  access_count,
  type,
  scope,
  owner_type,
  owner_id,
  created_by,
  team_id,
  channel_id,
  agent_id,
  access_mode,
  archived_at
FROM security_service.memory_entries;

COMMIT;
