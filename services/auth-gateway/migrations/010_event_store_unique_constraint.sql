-- =====================================================
-- CRITICAL FIX: Add Unique Constraint on Event Version
-- =====================================================
-- Migration: 010_event_store_unique_constraint.sql
-- Purpose: Prevent duplicate event versions per aggregate
-- 
-- This is a defensive measure that ensures data integrity
-- even if the advisory lock fails for any reason.
-- =====================================================

-- Add unique constraint to prevent duplicate versions
-- This will fail if duplicates already exist - check first!
DO $$
BEGIN
  -- Check for existing duplicates before adding constraint
  IF EXISTS (
    SELECT aggregate_type, aggregate_id, version, COUNT(*)
    FROM auth_gateway.events
    GROUP BY aggregate_type, aggregate_id, version
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate event versions exist! Clean up duplicates before adding constraint.';
  END IF;

  -- Add the unique constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_events_aggregate_version'
  ) THEN
    ALTER TABLE auth_gateway.events
    ADD CONSTRAINT uq_events_aggregate_version 
    UNIQUE (aggregate_type, aggregate_id, version);
    
    RAISE NOTICE 'Added unique constraint uq_events_aggregate_version';
  ELSE
    RAISE NOTICE 'Constraint uq_events_aggregate_version already exists';
  END IF;
END
$$;

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT uq_events_aggregate_version ON auth_gateway.events IS 
  'Ensures each aggregate can only have one event per version number. Works alongside advisory locks for optimistic concurrency.';
