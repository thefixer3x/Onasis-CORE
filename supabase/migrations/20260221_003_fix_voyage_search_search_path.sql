-- ============================================================================
-- Fix search_path for voyage vector search RPC
-- Date: 2026-02-21
-- Context:
--   search_memories_voyage was created with search_path='' in some environments,
--   which caused runtime failures:
--     operator does not exist: extensions.vector <=> extensions.vector
-- ============================================================================

DO $$
BEGIN
  -- Keep voyage and default search functions aligned with extension/table resolution.
  IF to_regprocedure('public.search_memories_voyage(extensions.vector,double precision,integer,uuid,uuid,text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.search_memories_voyage(extensions.vector,double precision,integer,uuid,uuid,text) SET search_path TO public, security_service, extensions';
  END IF;

  IF to_regprocedure('public.search_memories(extensions.vector,double precision,integer,uuid,uuid,text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.search_memories(extensions.vector,double precision,integer,uuid,uuid,text) SET search_path TO public, security_service, extensions';
  END IF;
END $$;
