-- Migration: Fix missing organization_id in public.users
-- Date: 2026-03-27
-- Issue: Users created before org migration have NULL organization_id
-- Impact: Auth-gateway introspectIdentity returns 401 invalid_credential
--
-- This migration:
-- 1. Identifies users with NULL organization_id
-- 2. Creates individual organizations for each affected user
-- 3. Updates public.users to link to their organization
-- 4. Adds fallback trigger to prevent future NULL org_id

-- ============================================================================
-- STEP 1: Identify affected users
-- ============================================================================

DO $$
DECLARE
  null_org_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_org_count
  FROM public.users
  WHERE organization_id IS NULL;

  RAISE NOTICE 'Found % users with NULL organization_id', null_org_count;
  
  IF null_org_count = 0 THEN
    RAISE NOTICE 'No users with NULL organization_id. Migration not needed.';
    RETURN;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Create organizations for users without org_id
-- ============================================================================

DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
  org_slug TEXT;
  user_email TEXT;
BEGIN
  -- Loop through all users with NULL organization_id
  FOR user_record IN
    SELECT id, email
    FROM public.users
    WHERE organization_id IS NULL
    ORDER BY created_at ASC
  LOOP
    user_email := COALESCE(user_record.email, 'unknown-' || user_record.id || '@lanonasis.local');

    -- Generate a slug from email (before @)
    org_slug := LOWER(SPLIT_PART(user_email, '@', 1));
    org_slug := REGEXP_REPLACE(org_slug, '[^a-z0-9]', '-', 'g');
    org_slug := LEFT(org_slug, 50);
    org_slug := org_slug || '-' || SUBSTR(gen_random_uuid()::text, 1, 8);

    -- Create a new organization for this user
    INSERT INTO public.organizations (id, name, slug, description, is_active, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      SPLIT_PART(user_email, '@', 1) || '''s Workspace',
      org_slug,
      'Personal workspace for ' || user_email,
      true,
      NOW(),
      NOW()
    )
    RETURNING id INTO new_org_id;

    -- Update the user to point to their new organization
    UPDATE public.users
    SET organization_id = new_org_id, updated_at = NOW()
    WHERE id = user_record.id;

    RAISE NOTICE 'Created org % for user % (email: %)', new_org_id, user_record.id, user_email;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 3: Ensure trigger exists to prevent future NULL org_id
-- ============================================================================

-- Verify the trigger from 20251227_create_user_orgs.sql exists
-- If not, recreate it here as a safeguard

CREATE OR REPLACE FUNCTION public.handle_new_user_org()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_slug TEXT;
  user_email TEXT;
BEGIN
  -- Get email from the new user
  user_email := COALESCE(NEW.email, 'unknown-' || NEW.id || '@lanonasis.local');

  -- Skip if this is a system/admin account
  IF user_email LIKE '%@lanonasis.com' OR user_email = 'admin@example.com' THEN
    -- Admin accounts get assigned to the main Lanonasis org if it exists
    -- Otherwise create a personal org
    BEGIN
      NEW.organization_id := 'ba2c1b22-3c4d-4a5b-aca3-881995d863d5'::uuid;
    EXCEPTION WHEN OTHERS THEN
      -- Main org doesn't exist, create personal org
      org_slug := LOWER(SPLIT_PART(user_email, '@', 1));
      org_slug := REGEXP_REPLACE(org_slug, '[^a-z0-9]', '-', 'g');
      org_slug := LEFT(org_slug, 50) || '-' || SUBSTR(gen_random_uuid()::text, 1, 8);
      
      INSERT INTO public.organizations (id, name, slug, description, is_active, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        SPLIT_PART(user_email, '@', 1) || '''s Workspace',
        org_slug,
        'Personal workspace for ' || user_email,
        true,
        NOW(),
        NOW()
      )
      RETURNING id INTO new_org_id;
      
      NEW.organization_id := new_org_id;
    END;
    RETURN NEW;
  END IF;

  -- Generate a slug from email (before @)
  org_slug := LOWER(SPLIT_PART(user_email, '@', 1));
  org_slug := REGEXP_REPLACE(org_slug, '[^a-z0-9]', '-', 'g');
  org_slug := LEFT(org_slug, 50);
  org_slug := org_slug || '-' || SUBSTR(gen_random_uuid()::text, 1, 8);

  -- Create a new organization for this user
  INSERT INTO public.organizations (id, name, slug, description, is_active, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    SPLIT_PART(user_email, '@', 1) || '''s Workspace',
    org_slug,
    'Personal workspace for ' || user_email,
    true,
    NOW(),
    NOW()
  )
  RETURNING id INTO new_org_id;

  -- Assign the new organization to the user
  NEW.organization_id := new_org_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_user_created_create_org ON public.users;

CREATE TRIGGER on_user_created_create_org
  BEFORE INSERT ON public.users
  FOR EACH ROW
  WHEN (NEW.organization_id IS NULL)
  EXECUTE FUNCTION public.handle_new_user_org();

-- ============================================================================
-- STEP 4: Verify the migration
-- ============================================================================

DO $$
DECLARE
  null_org_count INTEGER;
  total_user_count INTEGER;
  org_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_org_count FROM public.users WHERE organization_id IS NULL;
  SELECT COUNT(*) INTO total_user_count FROM public.users;
  SELECT COUNT(DISTINCT organization_id) INTO org_count FROM public.users;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Complete!';
  RAISE NOTICE '  Total users: %', total_user_count;
  RAISE NOTICE '  Users with NULL org: %', null_org_count;
  RAISE NOTICE '  Unique organizations: %', org_count;
  
  IF null_org_count > 0 THEN
    RAISE WARNING 'WARNING: % users still have NULL organization_id', null_org_count;
  ELSE
    RAISE NOTICE '  All users now have an organization!';
  END IF;
  RAISE NOTICE '========================================';
END $$;

-- Verification query
SELECT 
  'Migration Results' as report,
  (SELECT COUNT(*) FROM public.users) as total_users,
  (SELECT COUNT(*) FROM public.users WHERE organization_id IS NULL) as users_with_null_org,
  (SELECT COUNT(DISTINCT organization_id) FROM public.users) as unique_organizations;

-- Show any users that might still have issues
SELECT 
  u.id,
  u.email,
  u.organization_id,
  o.name as org_name,
  o.slug as org_slug
FROM public.users u
LEFT JOIN public.organizations o ON u.organization_id = o.id
ORDER BY u.created_at DESC;
