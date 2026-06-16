-- Migration: create GIN indexes on binding column concurrently
-- Purpose:
--   CREATE INDEX CONCURRENTLY does not acquire an AccessExclusiveLock, so
--   writes are not blocked during the build. Must be run OUTSIDE a transaction
--   block (cannot be wrapped in BEGIN/COMMIT or a DO $$ block).
--
-- Run this migration with your runner's non-transactional mode, or manually:
--   psql $DATABASE_URL -f 019_create_api_keys_binding_indexes_concurrent.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_security_service_api_keys_binding
  ON security_service.api_keys USING GIN (binding);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_public_api_keys_binding
  ON public.api_keys USING GIN (binding);
