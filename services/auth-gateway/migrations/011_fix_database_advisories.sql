-- ============================================================
-- Migration: Fix Database Advisories
-- Date: 2026-01-02
-- Description: Resolves security and performance advisories:
--   1. Enable RLS on 10 auth_gateway tables
--   2. Add missing indexes for foreign keys (19 FKs)
--   3. Remove duplicate indexes (23 pairs)
-- ============================================================

-- ============================================================
-- PART 1: Enable RLS on auth_gateway tables without it
-- ============================================================

-- 1. admin_access_log - tracks admin login attempts
ALTER TABLE auth_gateway.admin_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages admin access log" ON auth_gateway.admin_access_log;
CREATE POLICY "Service role manages admin access log" ON auth_gateway.admin_access_log
  USING (auth.role() = 'service_role');

-- 2. admin_override - admin override settings
ALTER TABLE auth_gateway.admin_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages admin override" ON auth_gateway.admin_override;
CREATE POLICY "Service role manages admin override" ON auth_gateway.admin_override
  USING (auth.role() = 'service_role');

-- 3. admin_sessions - admin session tracking
ALTER TABLE auth_gateway.admin_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages admin sessions" ON auth_gateway.admin_sessions;
CREATE POLICY "Service role manages admin sessions" ON auth_gateway.admin_sessions
  USING (auth.role() = 'service_role');

-- 4. events - event sourcing table
ALTER TABLE auth_gateway.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages events" ON auth_gateway.events;
CREATE POLICY "Service role manages events" ON auth_gateway.events
  USING (auth.role() = 'service_role');

-- 5. oauth_audit_log - OAuth activity audit
ALTER TABLE auth_gateway.oauth_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages oauth audit log" ON auth_gateway.oauth_audit_log;
CREATE POLICY "Service role manages oauth audit log" ON auth_gateway.oauth_audit_log
  USING (auth.role() = 'service_role');

-- 6. oauth_authorization_codes - OAuth auth codes
ALTER TABLE auth_gateway.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages oauth auth codes" ON auth_gateway.oauth_authorization_codes;
CREATE POLICY "Service role manages oauth auth codes" ON auth_gateway.oauth_authorization_codes
  USING (auth.role() = 'service_role');

-- 7. oauth_clients - OAuth client applications
ALTER TABLE auth_gateway.oauth_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages oauth clients" ON auth_gateway.oauth_clients;
CREATE POLICY "Service role manages oauth clients" ON auth_gateway.oauth_clients
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Active oauth clients are viewable" ON auth_gateway.oauth_clients;
CREATE POLICY "Active oauth clients are viewable" ON auth_gateway.oauth_clients
  FOR SELECT USING (status = 'active');

-- 8. oauth_tokens - OAuth access/refresh tokens
ALTER TABLE auth_gateway.oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages oauth tokens" ON auth_gateway.oauth_tokens;
CREATE POLICY "Service role manages oauth tokens" ON auth_gateway.oauth_tokens
  USING (auth.role() = 'service_role');

-- 9. outbox - transactional outbox pattern
ALTER TABLE auth_gateway.outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages outbox" ON auth_gateway.outbox;
CREATE POLICY "Service role manages outbox" ON auth_gateway.outbox
  USING (auth.role() = 'service_role');

-- 10. user_accounts - user account data
ALTER TABLE auth_gateway.user_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages user accounts" ON auth_gateway.user_accounts;
CREATE POLICY "Service role manages user accounts" ON auth_gateway.user_accounts
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own account" ON auth_gateway.user_accounts;
CREATE POLICY "Users can view own account" ON auth_gateway.user_accounts
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- PART 2: Enable RLS on other schemas with missing RLS
-- ============================================================

-- core.user_organizations
ALTER TABLE core.user_organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages user organizations" ON core.user_organizations;
CREATE POLICY "Service role manages user organizations" ON core.user_organizations
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view their organizations" ON core.user_organizations;
CREATE POLICY "Users can view their organizations" ON core.user_organizations
  FOR SELECT USING (user_id = auth.uid());

-- maas.memory_chunks
ALTER TABLE maas.memory_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages memory chunks" ON maas.memory_chunks;
CREATE POLICY "Service role manages memory chunks" ON maas.memory_chunks
  USING (auth.role() = 'service_role');

-- maas.memory_contexts
ALTER TABLE maas.memory_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages memory contexts" ON maas.memory_contexts;
CREATE POLICY "Service role manages memory contexts" ON maas.memory_contexts
  USING (auth.role() = 'service_role');

-- ============================================================
-- PART 3: Add missing indexes for foreign keys
-- ============================================================

-- auth_gateway foreign keys
CREATE INDEX IF NOT EXISTS idx_auth_codes_client_id
  ON auth_gateway.auth_codes(client_id);

CREATE INDEX IF NOT EXISTS idx_auth_codes_user_id
  ON auth_gateway.auth_codes(user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_parent
  ON auth_gateway.oauth_tokens(parent_token_id);

-- public schema foreign keys
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_product
  ON public.ai_recommendations(product_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user
  ON public.ai_usage_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_bulk_payments_modified_by
  ON public.bulk_payments(modified_by);

CREATE INDEX IF NOT EXISTS idx_business_insights_consent
  ON public.business_financial_insights(consent_id);

CREATE INDEX IF NOT EXISTS idx_edoc_consents_business
  ON public.edoc_consents(business_profile_id);

CREATE INDEX IF NOT EXISTS idx_edoc_analysis_consent
  ON public.edoc_financial_analysis(consent_id);

CREATE INDEX IF NOT EXISTS idx_edoc_usage_consent
  ON public.edoc_usage_logs(consent_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_buyer
  ON public.marketplace_transactions(buyer_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_seller
  ON public.marketplace_transactions(seller_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_order
  ON public.marketplace_transactions(order_id);

CREATE INDEX IF NOT EXISTS idx_notification_settings_user
  ON public.notification_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_public_oauth_tokens_parent
  ON public.oauth_tokens(parent_token_id);

CREATE INDEX IF NOT EXISTS idx_payment_audit_changed_by
  ON public.payment_audit(changed_by);

CREATE INDEX IF NOT EXISTS idx_payment_items_beneficiary
  ON public.payment_items(beneficiary_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user
  ON public.subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON public.user_sessions(user_id);

-- ============================================================
-- PART 4: Remove duplicate indexes
-- Keep the named indexes, drop the auto-generated unique constraint indexes
-- ============================================================

-- auth_gateway duplicates
DROP INDEX IF EXISTS auth_gateway.idx_admin_override_email;
DROP INDEX IF EXISTS auth_gateway.idx_oauth_tokens_token_hash;
DROP INDEX IF EXISTS auth_gateway.idx_oauth_codes_code_hash;
DROP INDEX IF EXISTS auth_gateway.idx_oauth_clients_client_id;
DROP INDEX IF EXISTS auth_gateway.idx_api_clients_client_id;
DROP INDEX IF EXISTS auth_gateway.idx_api_clients_app_id;
-- Note: uq_events_aggregate_version is a unique constraint, so drop the redundant idx instead
DROP INDEX IF EXISTS auth_gateway.idx_events_aggregate;

-- public schema duplicates
DROP INDEX IF EXISTS public.idx_oauth_clients_client_id;
DROP INDEX IF EXISTS public.idx_oauth_tokens_token_hash;
DROP INDEX IF EXISTS public.idx_oauth_codes_code_hash;
DROP INDEX IF EXISTS public.idx_business_profiles_user;
DROP INDEX IF EXISTS public.idx_mcp_sessions_session_id;
DROP INDEX IF EXISTS public.idx_mcp_proxy_tokens_proxy;
DROP INDEX IF EXISTS public.idx_api_keys_key_hash;
DROP INDEX IF EXISTS public.idx_vendor_organizations_vendor_code;

-- maas schema duplicates
DROP INDEX IF EXISTS maas.idx_maas_organizations_slug;

-- vsecure schema duplicates
DROP INDEX IF EXISTS vsecure.idx_key_usage_org;
DROP INDEX IF EXISTS vsecure.idx_lanonasis_api_projects_org;
DROP INDEX IF EXISTS vsecure.idx_key_security_org;
DROP INDEX IF EXISTS vsecure.idx_lanonasis_api_keys_org;
DROP INDEX IF EXISTS vsecure.idx_mcp_sessions_session_id;
DROP INDEX IF EXISTS vsecure.idx_mcp_proxy_tokens_proxy;

-- storage schema duplicate (if accessible)
-- Note: storage schema is managed by Supabase, skip this
-- DROP INDEX IF EXISTS storage.idx_objects_bucket_id_name;

-- ============================================================
-- Verify changes
-- ============================================================
DO $$
DECLARE
  tables_without_rls INTEGER;
BEGIN
  SELECT COUNT(*) INTO tables_without_rls
  FROM pg_tables
  WHERE schemaname = 'auth_gateway'
    AND rowsecurity = false;

  IF tables_without_rls > 0 THEN
    RAISE NOTICE 'Warning: % tables in auth_gateway still without RLS', tables_without_rls;
  ELSE
    RAISE NOTICE 'Success: All auth_gateway tables have RLS enabled';
  END IF;
END $$;
