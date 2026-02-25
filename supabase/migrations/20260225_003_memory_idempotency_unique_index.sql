-- Enforce idempotent create semantics at the database layer.
-- IMPORTANT: Index the BASE TABLE, not facade views.
-- On reorganized projects, public.memory_entries is a view that points to
-- security_service.memory_entries.

DO $$
DECLARE
  target_schema text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'security_service'
      AND c.relname = 'memory_entries'
      AND c.relkind = 'r'
  ) THEN
    target_schema := 'security_service';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'memory_entries'
      AND c.relkind = 'r'
  ) THEN
    -- Backward compatibility for projects where memory_entries is a table in public.
    target_schema := 'public';
  ELSE
    RAISE EXCEPTION
      'No base table found for memory_entries in security_service/public.';
  END IF;

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I
     ON %I.memory_entries
     USING btree (
       organization_id,
       user_id,
       (metadata->>''idempotency_key'')
     )
     WHERE
       metadata ? ''idempotency_key''
       AND NULLIF(metadata->>''idempotency_key'', '''') IS NOT NULL
       AND COALESCE(metadata->>''write_intent'', ''auto'') <> ''new'';',
    'memory_entries_idempotency_key_unique_idx',
    target_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I
     ON %I.memory_entries
     USING btree (
       organization_id,
       user_id,
       (metadata->>''continuity_key''),
       updated_at DESC
     )
     WHERE
       metadata ? ''continuity_key''
       AND NULLIF(metadata->>''continuity_key'', '''') IS NOT NULL;',
    'memory_entries_continuity_key_lookup_idx',
    target_schema
  );
END $$;
