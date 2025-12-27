-- Migration: Default Subscription Tiers and Initial Data
-- Configures tier-based access for intelligence features aligned with PRODUCT-ROADMAP-2025-2026
-- Source: mcp-core-submodule/migrations/005_intelligence_default_tiers.sql
-- Date: 2025-12-26

-- ============================================================================
-- DEFAULT SUBSCRIPTION TIERS
-- Pricing aligned with roadmap: Free, Pro ($9.99), Business ($49.99), Enterprise
-- ============================================================================

INSERT INTO subscription_tiers (
  name,
  display_name,
  price_monthly_usd,
  price_yearly_usd,
  intelligence_quota_monthly,
  intelligence_features,
  features
) VALUES

-- FREE TIER: Acquisition funnel, limited features
(
  'free',
  'Free',
  0.00,
  0.00,
  10, -- 10 intelligence calls/month for taste
  '{
    "analyze_patterns": false,
    "suggest_tags": true,
    "find_related": false,
    "detect_duplicates": false,
    "extract_insights": false,
    "health_check": true
  }'::jsonb,
  '{
    "max_memories": 100,
    "max_storage_mb": 50,
    "vector_search": true,
    "semantic_search": true,
    "api_access": true,
    "export_formats": ["json"],
    "mcp_tools": 19,
    "smart_recall": false,
    "voice_capture": false,
    "screenshot_processing": false,
    "offline_sync": false,
    "team_features": false,
    "priority_support": false,
    "roadmap_phase": 0
  }'::jsonb
),

-- PRO TIER: Power users, most intelligence features
(
  'pro',
  'Pro',
  9.99,
  99.99,  -- 2 months free with annual
  100, -- 100 intelligence calls/month
  '{
    "analyze_patterns": true,
    "suggest_tags": true,
    "find_related": true,
    "detect_duplicates": true,
    "extract_insights": false,
    "health_check": true
  }'::jsonb,
  '{
    "max_memories": 5000,
    "max_storage_mb": 1000,
    "vector_search": true,
    "semantic_search": true,
    "api_access": true,
    "export_formats": ["json", "csv", "markdown"],
    "mcp_tools": 19,
    "smart_recall": true,
    "voice_capture": true,
    "screenshot_processing": true,
    "offline_sync": true,
    "team_features": false,
    "priority_support": false,
    "autonomous_agent": false,
    "roadmap_phase": 1
  }'::jsonb
),

-- BUSINESS TIER: Teams and full intelligence suite
(
  'business',
  'Business',
  49.99,
  499.99,  -- 2 months free with annual
  500, -- 500 intelligence calls/month
  '{
    "analyze_patterns": true,
    "suggest_tags": true,
    "find_related": true,
    "detect_duplicates": true,
    "extract_insights": true,
    "health_check": true
  }'::jsonb,
  '{
    "max_memories": 50000,
    "max_storage_mb": 10000,
    "vector_search": true,
    "semantic_search": true,
    "api_access": true,
    "export_formats": ["json", "csv", "markdown", "pdf"],
    "mcp_tools": 19,
    "smart_recall": true,
    "voice_capture": true,
    "screenshot_processing": true,
    "offline_sync": true,
    "team_features": true,
    "team_members_max": 25,
    "priority_support": true,
    "autonomous_agent": true,
    "predictive_memory": true,
    "knowledge_gaps": true,
    "roadmap_phase": 2
  }'::jsonb
),

-- ENTERPRISE TIER: Unlimited, self-hosted option, marketplace access
(
  'enterprise',
  'Enterprise',
  499.99,  -- Starting price, custom available
  4999.99,
  -1, -- Unlimited (-1 = no quota)
  '{
    "analyze_patterns": true,
    "suggest_tags": true,
    "find_related": true,
    "detect_duplicates": true,
    "extract_insights": true,
    "health_check": true
  }'::jsonb,
  '{
    "max_memories": -1,
    "max_storage_mb": -1,
    "vector_search": true,
    "semantic_search": true,
    "api_access": true,
    "export_formats": ["json", "csv", "markdown", "pdf", "custom"],
    "mcp_tools": 19,
    "smart_recall": true,
    "voice_capture": true,
    "screenshot_processing": true,
    "offline_sync": true,
    "team_features": true,
    "team_members_max": -1,
    "priority_support": true,
    "dedicated_support": true,
    "autonomous_agent": true,
    "predictive_memory": true,
    "knowledge_gaps": true,
    "expert_marketplace_access": true,
    "api_marketplace_access": true,
    "self_hosted_option": true,
    "custom_integrations": true,
    "sla_guarantee": true,
    "roadmap_phase": 3
  }'::jsonb
)

ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  price_monthly_usd = EXCLUDED.price_monthly_usd,
  price_yearly_usd = EXCLUDED.price_yearly_usd,
  intelligence_quota_monthly = EXCLUDED.intelligence_quota_monthly,
  intelligence_features = EXCLUDED.intelligence_features,
  features = EXCLUDED.features,
  updated_at = NOW();

-- ============================================================================
-- ASSIGN EXISTING USERS TO FREE TIER
-- Creates subscriptions for all auth.users who don't have one
-- ============================================================================

INSERT INTO user_subscriptions (
  user_id,
  tier_id,
  status,
  intelligence_usage_current,
  quota_resets_at
)
SELECT
  au.id,
  (SELECT id FROM subscription_tiers WHERE name = 'free'),
  'active',
  0,
  NOW() + INTERVAL '1 month'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM user_subscriptions us WHERE us.user_id = au.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- UPGRADE LANONASIS ADMIN TO BUSINESS TIER (for testing)
-- ============================================================================

UPDATE user_subscriptions
SET
  tier_id = (SELECT id FROM subscription_tiers WHERE name = 'business'),
  status = 'active',
  updated_at = NOW()
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN ('admin@lanonasis.com', 'info@lanonasis.com')
);

-- ============================================================================
-- INTELLIGENCE FEATURE COST TRACKING
-- OpenAI cost reference (as of Dec 2024)
-- ============================================================================

CREATE TABLE IF NOT EXISTS intelligence_cost_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL,
  model_used TEXT NOT NULL,

  -- Cost per 1K tokens
  input_cost_per_1k DECIMAL(10, 6),
  output_cost_per_1k DECIMAL(10, 6),

  -- Embedding costs
  embedding_cost_per_1k DECIMAL(10, 6),

  -- Average usage per call
  avg_input_tokens INTEGER,
  avg_output_tokens INTEGER,
  avg_embeddings INTEGER,

  -- Estimated cost per call
  estimated_cost_per_call DECIMAL(10, 6),

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO intelligence_cost_reference (
  tool_name,
  model_used,
  input_cost_per_1k,
  output_cost_per_1k,
  embedding_cost_per_1k,
  avg_input_tokens,
  avg_output_tokens,
  avg_embeddings,
  estimated_cost_per_call
) VALUES
-- GPT-4o-mini pricing (Dec 2024)
('analyze_patterns', 'gpt-4o-mini', 0.000150, 0.000600, NULL, 2000, 500, 0, 0.00060),
('suggest_tags', 'gpt-4o-mini', 0.000150, 0.000600, NULL, 500, 100, 0, 0.00014),
('extract_insights', 'gpt-4o-mini', 0.000150, 0.000600, NULL, 3000, 800, 0, 0.00093),
('health_check', 'gpt-4o-mini', 0.000150, 0.000600, NULL, 1500, 400, 0, 0.00047),

-- Embedding-based tools (text-embedding-3-small)
('find_related', 'text-embedding-3-small', NULL, NULL, 0.000020, 0, 0, 100, 0.00200),
('detect_duplicates', 'text-embedding-3-small', NULL, NULL, 0.000020, 0, 0, 200, 0.00400)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- MIGRATION FROM LEGACY MAAS SCHEMA
-- Maps legacy organization plans to new subscription tiers
-- ============================================================================

-- Map legacy maas.organizations.plan to new tier structure
-- (Only runs if maas schema exists and has data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'maas' AND table_name = 'organizations'
  ) THEN
    -- Create mapping view for reference (doesn't modify data)
    CREATE OR REPLACE VIEW legacy_plan_mapping AS
    SELECT
      o.id as legacy_org_id,
      o.name as org_name,
      o.plan as legacy_plan,
      CASE
        WHEN o.plan = 'enterprise' THEN 'enterprise'
        WHEN o.plan = 'pro' THEN 'pro'
        ELSE 'free'
      END as new_tier_name
    FROM maas.organizations o;

    RAISE NOTICE 'Created legacy_plan_mapping view for maas.organizations';
  ELSE
    RAISE NOTICE 'maas.organizations not found, skipping legacy mapping';
  END IF;
END $$;

-- ============================================================================
-- QUOTA RESET SCHEDULED FUNCTION
-- Call this daily via pg_cron or Supabase scheduled function
-- ============================================================================

CREATE OR REPLACE FUNCTION scheduled_intelligence_maintenance()
RETURNS void AS $$
BEGIN
  -- Reset quotas for users whose period has ended
  UPDATE user_subscriptions
  SET
    intelligence_usage_current = 0,
    quota_resets_at = NOW() + INTERVAL '1 month',
    updated_at = NOW()
  WHERE quota_resets_at <= NOW()
  AND status = 'active';

  -- Clean expired cache entries
  DELETE FROM intelligence_cache
  WHERE expires_at <= NOW();

  -- Log maintenance run
  INSERT INTO intelligence_usage_logs (
    user_id,
    tool_name,
    request_params,
    success,
    created_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'health_check',
    '{"type": "scheduled_maintenance"}'::jsonb,
    true,
    NOW()
  );

  RAISE NOTICE 'Intelligence maintenance completed at %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ANALYTICS VIEWS
-- For dashboard and monitoring
-- ============================================================================

-- Intelligence usage summary by tool
CREATE OR REPLACE VIEW intelligence_usage_summary AS
SELECT
  tool_name,
  COUNT(*) as total_calls,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(openai_tokens_used) as total_tokens,
  SUM(openai_cost_usd) as total_cost,
  AVG(response_time_ms) as avg_response_time,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hits,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*)::float as success_rate,
  DATE_TRUNC('day', created_at) as day
FROM intelligence_usage_logs
GROUP BY tool_name, DATE_TRUNC('day', created_at)
ORDER BY day DESC, total_calls DESC;

-- Tier distribution
CREATE OR REPLACE VIEW tier_distribution AS
SELECT
  st.name as tier_name,
  st.display_name,
  st.price_monthly_usd,
  COUNT(us.id) as subscriber_count,
  SUM(us.intelligence_usage_current) as total_usage,
  AVG(us.intelligence_usage_current) as avg_usage
FROM subscription_tiers st
LEFT JOIN user_subscriptions us ON us.tier_id = st.id AND us.status = 'active'
GROUP BY st.id, st.name, st.display_name, st.price_monthly_usd
ORDER BY st.price_monthly_usd;

-- Revenue projection (MRR)
CREATE OR REPLACE VIEW mrr_projection AS
SELECT
  st.name as tier_name,
  COUNT(us.id) as subscribers,
  st.price_monthly_usd,
  COUNT(us.id) * st.price_monthly_usd as tier_mrr
FROM subscription_tiers st
LEFT JOIN user_subscriptions us ON us.tier_id = st.id AND us.status = 'active'
GROUP BY st.id, st.name, st.price_monthly_usd
ORDER BY tier_mrr DESC;

-- User quota status
CREATE OR REPLACE VIEW user_quota_status AS
SELECT
  us.user_id,
  au.email,
  st.name as tier_name,
  st.intelligence_quota_monthly as quota_limit,
  us.intelligence_usage_current as usage,
  CASE
    WHEN st.intelligence_quota_monthly = -1 THEN 'unlimited'
    WHEN us.intelligence_usage_current >= st.intelligence_quota_monthly THEN 'exhausted'
    WHEN us.intelligence_usage_current >= st.intelligence_quota_monthly * 0.8 THEN 'warning'
    ELSE 'ok'
  END as status,
  us.quota_resets_at
FROM user_subscriptions us
JOIN subscription_tiers st ON st.id = us.tier_id
JOIN auth.users au ON au.id = us.user_id
WHERE us.status = 'active';

-- ============================================================================
-- HELPER FUNCTIONS FOR REST API
-- ============================================================================

-- Get user's current tier and features
CREATE OR REPLACE FUNCTION get_user_tier_info(p_user_id UUID)
RETURNS TABLE(
  tier_name TEXT,
  display_name TEXT,
  intelligence_quota INTEGER,
  intelligence_usage INTEGER,
  intelligence_remaining INTEGER,
  features JSONB,
  intelligence_features JSONB,
  quota_resets_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.name,
    st.display_name,
    st.intelligence_quota_monthly,
    us.intelligence_usage_current,
    CASE
      WHEN st.intelligence_quota_monthly = -1 THEN -1
      ELSE st.intelligence_quota_monthly - us.intelligence_usage_current
    END,
    st.features,
    st.intelligence_features,
    us.quota_resets_at
  FROM user_subscriptions us
  JOIN subscription_tiers st ON st.id = us.tier_id
  WHERE us.user_id = p_user_id
  AND us.status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log intelligence usage and increment counter
CREATE OR REPLACE FUNCTION log_intelligence_usage(
  p_user_id UUID,
  p_tool_name TEXT,
  p_tokens_used INTEGER DEFAULT 0,
  p_cost_usd DECIMAL DEFAULT 0,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_cache_hit BOOLEAN DEFAULT false,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Log the usage
  INSERT INTO intelligence_usage_logs (
    user_id,
    tool_name,
    openai_tokens_used,
    openai_cost_usd,
    response_time_ms,
    cache_hit,
    success,
    error_message
  ) VALUES (
    p_user_id,
    p_tool_name,
    p_tokens_used,
    p_cost_usd,
    p_response_time_ms,
    p_cache_hit,
    p_success,
    p_error_message
  );

  -- Increment usage counter (only for non-cache hits)
  IF NOT p_cache_hit AND p_success THEN
    UPDATE user_subscriptions
    SET
      intelligence_usage_current = intelligence_usage_current + 1,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE subscription_tiers IS 'Phase 2 Intelligence API: Default tier configuration for MaaS premium features';
