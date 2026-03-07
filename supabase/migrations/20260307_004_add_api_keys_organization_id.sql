-- Migration: add organization_id to public.api_keys and backfill from users
-- Date: 2026-03-07
-- Purpose:
--   1. Give runtime API keys an explicit tenant binding
--   2. Backfill existing keys from public.users.organization_id
--   3. Prevent new user-scoped keys from being created without tenant context

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id ON public.api_keys(organization_id);

UPDATE public.api_keys AS api_keys
SET
  organization_id = users.organization_id,
  updated_at = NOW()
FROM public.users AS users
WHERE api_keys.user_id = users.id
  AND api_keys.organization_id IS NULL
  AND users.organization_id IS NOT NULL;

DROP POLICY IF EXISTS "Users can manage own API keys" ON public.api_keys;
CREATE POLICY "Users can manage own API keys" ON public.api_keys
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT organization_id
        FROM public.users
        WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id
      FROM public.users
      WHERE id = auth.uid()
    )
  );

COMMENT ON COLUMN public.api_keys.organization_id IS
  'Explicit tenant binding for runtime API keys. Backfilled from public.users.organization_id on 2026-03-07.';

DO $$
DECLARE
  unresolved_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO unresolved_count
  FROM public.api_keys
  WHERE organization_id IS NULL;

  IF unresolved_count > 0 THEN
    RAISE WARNING 'api_keys rows still missing organization_id after backfill: %', unresolved_count;
  ELSE
    RAISE NOTICE 'api_keys organization_id backfill completed with no unresolved rows';
  END IF;
END $$;
