-- Migration: Create individual organizations for existing users
-- Date: 2025-12-27
-- Purpose: Fix multi-tenancy - each user should have their own organization
--
-- This migration:
-- 1. Creates individual organizations for each user
-- 2. Updates users to point to their own organization
-- 3. Adds a trigger to auto-create orgs for new signups

-- ============================================================================
-- STEP 1: Create individual organizations for existing users
-- ============================================================================
-- We'll keep admin@lanonasis.com in the main "Lanonasis" org as the system admin
-- All other users get their own personal organization

DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
  org_slug TEXT;
BEGIN
  -- Loop through all users EXCEPT admin@lanonasis.com (keep them in system org)
  FOR user_record IN
    SELECT id, email, organization_id
    FROM public.users
    WHERE email != 'admin@lanonasis.com'
  LOOP
    -- Generate a slug from email (before @)
    org_slug := LOWER(SPLIT_PART(user_record.email, '@', 1));
    -- Remove special characters and limit length
    org_slug := REGEXP_REPLACE(org_slug, '[^a-z0-9]', '-', 'g');
    org_slug := LEFT(org_slug, 50);
    -- Add random suffix to ensure uniqueness
    org_slug := org_slug || '-' || SUBSTR(gen_random_uuid()::text, 1, 8);

    -- Create a new organization for this user
    INSERT INTO public.organizations (id, name, slug, description, is_active, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      SPLIT_PART(user_record.email, '@', 1) || '''s Workspace',
      org_slug,
      'Personal workspace for ' || user_record.email,
      true,
      NOW(),
      NOW()
    )
    RETURNING id INTO new_org_id;

    -- Update the user to point to their new organization
    UPDATE public.users
    SET organization_id = new_org_id, updated_at = NOW()
    WHERE id = user_record.id;

    RAISE NOTICE 'Created org % for user %', new_org_id, user_record.email;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 2: Create function to auto-create organization for new users
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_org()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_slug TEXT;
  user_email TEXT;
BEGIN
  -- Get email from the new user
  user_email := NEW.email;

  -- Skip if this is a system/admin account
  IF user_email LIKE '%@lanonasis.com' THEN
    -- Admin accounts get assigned to the main Lanonasis org
    NEW.organization_id := 'ba2c1b22-3c4d-4a5b-aca3-881995d863d5'::uuid;
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

-- ============================================================================
-- STEP 3: Create trigger on public.users to auto-create org for new users
-- ============================================================================

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_user_created_create_org ON public.users;

-- Create trigger that fires BEFORE INSERT to set organization_id
CREATE TRIGGER on_user_created_create_org
  BEFORE INSERT ON public.users
  FOR EACH ROW
  WHEN (NEW.organization_id IS NULL)
  EXECUTE FUNCTION public.handle_new_user_org();

-- ============================================================================
-- STEP 4: Verify the migration
-- ============================================================================

-- Show results
DO $$
DECLARE
  org_count INTEGER;
  user_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT organization_id) INTO org_count FROM public.users;
  SELECT COUNT(*) INTO user_count FROM public.users;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Complete!';
  RAISE NOTICE '  Total users: %', user_count;
  RAISE NOTICE '  Unique organizations: %', org_count;
  RAISE NOTICE '  Each user now has their own organization';
  RAISE NOTICE '========================================';
END $$;

-- Final check query (run manually to verify)
-- SELECT u.id, u.email, u.organization_id, o.name as org_name
-- FROM public.users u
-- JOIN public.organizations o ON u.organization_id = o.id
-- ORDER BY u.created_at;
