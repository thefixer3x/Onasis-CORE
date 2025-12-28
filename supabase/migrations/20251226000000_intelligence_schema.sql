-- Migration: Intelligence API Schema
-- Creates tables for premium intelligence features, tier management, and usage tracking
-- Part of Memory Intelligence REST API implementation
-- Source: mcp-core-submodule/migrations/004_intelligence_schema.sql
-- Date: 2025-12-26

-- ============================================================================
-- SUBSCRIPTION & TIER MANAGEMENT
-- ============================================================================

-- Subscription tiers (Free, Pro, Business, Enterprise)
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (name IN ('free', 'pro', 'business', 'enterprise')),
  display_name TEXT NOT NULL,
  price_monthly_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
  price_yearly_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- Intelligence feature quotas
  intelligence_quota_monthly INTEGER DEFAULT 0,
  intelligence_features JSONB DEFAULT '{
    "analyze_patterns": false,
    "suggest_tags": false,
    "find_related": false,
    "detect_duplicates": false,
    "extract_insights": false,
    "health_check": false
  }'::jsonb,

  -- General feature flags
  features JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User subscriptions (links users to tiers)
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tier_id UUID REFERENCES subscription_tiers(id) NOT NULL,

  -- Subscription status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'expired')),
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),

  -- Intelligence usage tracking (resets monthly)
  intelligence_usage_current INTEGER DEFAULT 0,
  quota_resets_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),

  -- Payment integration
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One active subscription per user
  UNIQUE(user_id)
);

-- ============================================================================
-- INTELLIGENCE USAGE TRACKING
-- ============================================================================

-- Usage logs for all intelligence tool calls
CREATE TABLE IF NOT EXISTS intelligence_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Tool information
  tool_name TEXT NOT NULL CHECK (tool_name IN (
    'analyze_patterns',
    'suggest_tags',
    'find_related',
    'detect_duplicates',
    'extract_insights',
    'health_check'
  )),

  -- Request details
  request_params JSONB DEFAULT '{}'::jsonb,
  response_data JSONB,

  -- OpenAI usage tracking
  openai_model TEXT,
  openai_tokens_used INTEGER DEFAULT 0,
  openai_cost_usd DECIMAL(10, 6) DEFAULT 0,

  -- Performance metrics
  response_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT false,
  success BOOLEAN DEFAULT true,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache for intelligence results (reduces OpenAI costs)
CREATE TABLE IF NOT EXISTS intelligence_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  tool_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cached result
  result JSONB NOT NULL,
  tokens_saved INTEGER DEFAULT 0,

  -- Expiration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  hit_count INTEGER DEFAULT 0
);

-- ============================================================================
-- PHASE 1: VOICE, SMART RECALL, SCREENSHOT, OFFLINE
-- ============================================================================

-- Voice memories (voice capture with transcription)
CREATE TABLE IF NOT EXISTS voice_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  memory_id UUID REFERENCES memory_entries(id) ON DELETE CASCADE,

  -- Audio data
  audio_url TEXT,
  audio_duration_seconds INTEGER,
  audio_format TEXT DEFAULT 'webm',

  -- Transcription (Deepgram)
  transcript TEXT NOT NULL,
  transcript_confidence DECIMAL(5, 4),
  transcript_language TEXT DEFAULT 'en',

  -- Processing
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Smart recall schedule (spaced repetition emails)
CREATE TABLE IF NOT EXISTS smart_recall_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Email settings
  email TEXT NOT NULL,
  frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  preferred_time TIME DEFAULT '09:00:00',
  timezone TEXT DEFAULT 'UTC',

  -- Email preferences
  max_memories_per_email INTEGER DEFAULT 5,
  include_insights BOOLEAN DEFAULT true,

  -- Status
  enabled BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,

  -- Analytics
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Smart recall history (individual email sends)
CREATE TABLE IF NOT EXISTS smart_recall_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Email details
  memory_ids UUID[] NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,

  -- Engagement
  memories_clicked UUID[] DEFAULT ARRAY[]::UUID[],

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Screenshot memories (OCR + Vision AI)
CREATE TABLE IF NOT EXISTS screenshot_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memory_entries(id) ON DELETE CASCADE NOT NULL,

  -- Image data
  image_url TEXT NOT NULL,
  image_size_bytes INTEGER,
  image_format TEXT,

  -- OCR extraction
  extracted_text TEXT,
  ocr_confidence DECIMAL(5, 4),

  -- Vision AI analysis (Claude Vision)
  vision_model TEXT DEFAULT 'claude-3-sonnet',
  vision_analysis JSONB,
  detected_objects TEXT[],
  detected_text_regions JSONB,

  -- Processing
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Offline sync queue (conflict resolution)
CREATE TABLE IF NOT EXISTS offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id TEXT NOT NULL,

  -- Offline data
  memory_data JSONB NOT NULL,
  local_timestamp TIMESTAMPTZ NOT NULL,

  -- Sync status
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'completed', 'conflict', 'failed')),
  sync_error TEXT,

  -- Conflict resolution
  conflict_resolution TEXT CHECK (conflict_resolution IN ('server_wins', 'client_wins', 'merged', 'manual_review')),
  conflict_details JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- ============================================================================
-- PHASE 2: PREDICTIVE, KNOWLEDGE GAPS, TEAMS, PRIVACY
-- ============================================================================

-- Predictive memory system (ML-based predictions)
CREATE TABLE IF NOT EXISTS predictive_memory_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Prediction
  suggested_memory JSONB NOT NULL,
  prediction_confidence DECIMAL(5, 4),
  prediction_reason TEXT,

  -- Context
  context_memories UUID[],
  based_on_patterns JSONB,

  -- User feedback
  accepted BOOLEAN,
  feedback_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge gap detection
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Gap details
  topic TEXT NOT NULL,
  gap_description TEXT,
  confidence_score DECIMAL(5, 4),

  -- Learning path
  suggested_resources JSONB,
  related_memories UUID[],

  -- Progress tracking
  status TEXT DEFAULT 'identified' CHECK (status IN ('identified', 'learning', 'filled', 'dismissed')),
  filled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team knowledge graph (collaboration)
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Settings
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'public')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Role
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),

  -- Permissions
  can_create BOOLEAN DEFAULT true,
  can_edit BOOLEAN DEFAULT true,
  can_delete BOOLEAN DEFAULT false,

  joined_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_shared_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  memory_id UUID REFERENCES memory_entries(id) ON DELETE CASCADE NOT NULL,
  shared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, memory_id)
);

-- Privacy-first local processing logs
CREATE TABLE IF NOT EXISTS privacy_processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Processing details
  processing_type TEXT NOT NULL CHECK (processing_type IN ('local', 'cloud', 'hybrid')),
  data_type TEXT NOT NULL,

  -- Privacy compliance
  pii_detected BOOLEAN DEFAULT false,
  pii_redacted BOOLEAN DEFAULT false,

  -- GDPR compliance
  consent_given BOOLEAN DEFAULT false,
  retention_days INTEGER DEFAULT 365,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PHASE 3: AUTONOMOUS AGENT, EXPERT MARKETPLACE, API MARKETPLACE
-- ============================================================================

-- Autonomous organization agent (weekly AI cleanup)
CREATE TABLE IF NOT EXISTS autonomous_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Run details
  run_type TEXT DEFAULT 'weekly_cleanup' CHECK (run_type IN ('weekly_cleanup', 'on_demand', 'scheduled')),

  -- Actions taken
  memories_tagged INTEGER DEFAULT 0,
  memories_categorized INTEGER DEFAULT 0,
  duplicates_merged INTEGER DEFAULT 0,
  suggestions_created INTEGER DEFAULT 0,

  -- Results
  actions_log JSONB,
  success BOOLEAN DEFAULT true,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Expert marketplace (25-30% commission)
CREATE TABLE IF NOT EXISTS expert_marketplace_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Profile
  display_name TEXT NOT NULL,
  bio TEXT,
  expertise_areas TEXT[],
  hourly_rate_usd DECIMAL(10, 2),

  -- Status
  verified BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,

  -- Stats
  total_sessions INTEGER DEFAULT 0,
  total_revenue_usd DECIMAL(10, 2) DEFAULT 0,
  average_rating DECIMAL(3, 2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expert_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id UUID REFERENCES expert_marketplace_profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Session details
  duration_minutes INTEGER,
  rate_usd DECIMAL(10, 2),
  total_amount_usd DECIMAL(10, 2),

  -- Commission (25-30%)
  platform_commission_percent DECIMAL(5, 2) DEFAULT 27.50,
  platform_commission_usd DECIMAL(10, 2),
  expert_payout_usd DECIMAL(10, 2),

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'canceled')),

  -- Feedback
  client_rating INTEGER CHECK (client_rating BETWEEN 1 AND 5),
  client_review TEXT,

  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API marketplace (70/30 revenue split)
CREATE TABLE IF NOT EXISTS api_marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Product details
  name TEXT NOT NULL,
  description TEXT,
  api_endpoint TEXT NOT NULL,
  documentation_url TEXT,

  -- Pricing
  pricing_model TEXT DEFAULT 'per_call' CHECK (pricing_model IN ('per_call', 'subscription', 'tiered')),
  price_per_call_usd DECIMAL(10, 6),
  monthly_subscription_usd DECIMAL(10, 2),

  -- Revenue split (70/30)
  developer_revenue_percent DECIMAL(5, 2) DEFAULT 70.00,
  platform_revenue_percent DECIMAL(5, 2) DEFAULT 30.00,

  -- Stats
  total_calls INTEGER DEFAULT 0,
  total_revenue_usd DECIMAL(10, 2) DEFAULT 0,
  average_rating DECIMAL(3, 2),

  -- Status
  status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'suspended')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_marketplace_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES api_marketplace_products(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Usage
  calls_count INTEGER DEFAULT 1,
  total_cost_usd DECIMAL(10, 6),

  -- Revenue split
  developer_revenue_usd DECIMAL(10, 6),
  platform_revenue_usd DECIMAL(10, 6),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Subscription indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier_id ON user_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);

-- Intelligence usage indexes
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_logs_user_id ON intelligence_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_logs_tool_name ON intelligence_usage_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_logs_created_at ON intelligence_usage_logs(created_at DESC);

-- Cache indexes
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_expires_at ON intelligence_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_user_id ON intelligence_cache(user_id);

-- Voice memory indexes
CREATE INDEX IF NOT EXISTS idx_voice_memories_user_id ON voice_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_memories_memory_id ON voice_memories(memory_id);

-- Smart recall indexes
CREATE INDEX IF NOT EXISTS idx_smart_recall_schedule_next_send_at ON smart_recall_schedule(next_send_at) WHERE enabled = true;

-- Screenshot indexes
CREATE INDEX IF NOT EXISTS idx_screenshot_memories_memory_id ON screenshot_memories(memory_id);

-- Offline sync indexes
CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_user_id ON offline_sync_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_status ON offline_sync_queue(sync_status);

-- Team indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_shared_memories_team_id ON team_shared_memories(team_id);

-- Expert marketplace indexes
CREATE INDEX IF NOT EXISTS idx_expert_sessions_expert_id ON expert_sessions(expert_id);
CREATE INDEX IF NOT EXISTS idx_expert_sessions_client_id ON expert_sessions(client_id);

-- API marketplace indexes
CREATE INDEX IF NOT EXISTS idx_api_marketplace_usage_product_id ON api_marketplace_usage(product_id);
CREATE INDEX IF NOT EXISTS idx_api_marketplace_usage_user_id ON api_marketplace_usage(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_recall_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_recall_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshot_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictive_memory_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_shared_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE expert_marketplace_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE expert_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_marketplace_usage ENABLE ROW LEVEL SECURITY;

-- Subscription tiers: public read access
DROP POLICY IF EXISTS "Subscription tiers are publicly readable" ON subscription_tiers;
CREATE POLICY "Subscription tiers are publicly readable"
  ON subscription_tiers FOR SELECT
  USING (true);

-- User subscriptions: users can only see their own
DROP POLICY IF EXISTS "Users can view their own subscription" ON user_subscriptions;
CREATE POLICY "Users can view their own subscription"
  ON user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own subscription" ON user_subscriptions;
CREATE POLICY "Users can update their own subscription"
  ON user_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Intelligence usage logs: users can only see their own
DROP POLICY IF EXISTS "Users can view their own intelligence usage" ON intelligence_usage_logs;
CREATE POLICY "Users can view their own intelligence usage"
  ON intelligence_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Intelligence cache: users can only see their own
DROP POLICY IF EXISTS "Users can view their own cache" ON intelligence_cache;
CREATE POLICY "Users can view their own cache"
  ON intelligence_cache FOR SELECT
  USING (auth.uid() = user_id);

-- Voice memories: users can only see their own
DROP POLICY IF EXISTS "Users can manage their own voice memories" ON voice_memories;
CREATE POLICY "Users can manage their own voice memories"
  ON voice_memories FOR ALL
  USING (auth.uid() = user_id);

-- Smart recall: users can only see their own
DROP POLICY IF EXISTS "Users can manage their own recall schedule" ON smart_recall_schedule;
CREATE POLICY "Users can manage their own recall schedule"
  ON smart_recall_schedule FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own recall history" ON smart_recall_history;
CREATE POLICY "Users can view their own recall history"
  ON smart_recall_history FOR SELECT
  USING (auth.uid() = user_id);

-- Screenshot memories: access via memory_entries RLS
DROP POLICY IF EXISTS "Users can manage screenshot memories for their memories" ON screenshot_memories;
CREATE POLICY "Users can manage screenshot memories for their memories"
  ON screenshot_memories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memory_entries
      WHERE memory_entries.id = screenshot_memories.memory_id
      AND memory_entries.user_id = auth.uid()
    )
  );

-- Offline sync: users can only see their own
DROP POLICY IF EXISTS "Users can manage their own offline sync" ON offline_sync_queue;
CREATE POLICY "Users can manage their own offline sync"
  ON offline_sync_queue FOR ALL
  USING (auth.uid() = user_id);

-- Predictive suggestions: users can only see their own
DROP POLICY IF EXISTS "Users can view their own predictions" ON predictive_memory_suggestions;
CREATE POLICY "Users can view their own predictions"
  ON predictive_memory_suggestions FOR SELECT
  USING (auth.uid() = user_id);

-- Knowledge gaps: users can only see their own
DROP POLICY IF EXISTS "Users can manage their own knowledge gaps" ON knowledge_gaps;
CREATE POLICY "Users can manage their own knowledge gaps"
  ON knowledge_gaps FOR ALL
  USING (auth.uid() = user_id);

-- Teams: public read, owner can manage
DROP POLICY IF EXISTS "Teams are readable by members" ON teams;
CREATE POLICY "Teams are readable by members"
  ON teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = teams.id
      AND team_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team owners can update teams" ON teams;
CREATE POLICY "Team owners can update teams"
  ON teams FOR UPDATE
  USING (auth.uid() = owner_id);

-- Team members: readable by team members
DROP POLICY IF EXISTS "Team members can view their team" ON team_members;
CREATE POLICY "Team members can view their team"
  ON team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
    )
  );

-- Team shared memories: readable by team members
DROP POLICY IF EXISTS "Team members can view shared memories" ON team_shared_memories;
CREATE POLICY "Team members can view shared memories"
  ON team_shared_memories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = team_shared_memories.team_id
      AND team_members.user_id = auth.uid()
    )
  );

-- Privacy logs: users can only see their own
DROP POLICY IF EXISTS "Users can view their own privacy logs" ON privacy_processing_logs;
CREATE POLICY "Users can view their own privacy logs"
  ON privacy_processing_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Autonomous agent runs: users can only see their own
DROP POLICY IF EXISTS "Users can view their own agent runs" ON autonomous_agent_runs;
CREATE POLICY "Users can view their own agent runs"
  ON autonomous_agent_runs FOR SELECT
  USING (auth.uid() = user_id);

-- Expert marketplace: profiles are publicly readable
DROP POLICY IF EXISTS "Expert profiles are publicly readable" ON expert_marketplace_profiles;
CREATE POLICY "Expert profiles are publicly readable"
  ON expert_marketplace_profiles FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS "Experts can manage their own profile" ON expert_marketplace_profiles;
CREATE POLICY "Experts can manage their own profile"
  ON expert_marketplace_profiles FOR ALL
  USING (auth.uid() = user_id);

-- Expert sessions: participants can view
DROP POLICY IF EXISTS "Session participants can view sessions" ON expert_sessions;
CREATE POLICY "Session participants can view sessions"
  ON expert_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expert_marketplace_profiles
      WHERE expert_marketplace_profiles.id = expert_sessions.expert_id
      AND expert_marketplace_profiles.user_id = auth.uid()
    )
    OR auth.uid() = client_id
  );

-- API marketplace: products are publicly readable
DROP POLICY IF EXISTS "API products are publicly readable" ON api_marketplace_products;
CREATE POLICY "API products are publicly readable"
  ON api_marketplace_products FOR SELECT
  USING (status = 'approved');

DROP POLICY IF EXISTS "Developers can manage their own products" ON api_marketplace_products;
CREATE POLICY "Developers can manage their own products"
  ON api_marketplace_products FOR ALL
  USING (auth.uid() = developer_id);

-- API usage: users can view their own usage
DROP POLICY IF EXISTS "Users can view their own API usage" ON api_marketplace_usage;
CREATE POLICY "Users can view their own API usage"
  ON api_marketplace_usage FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to reset monthly quotas
CREATE OR REPLACE FUNCTION reset_intelligence_quota()
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET
    intelligence_usage_current = 0,
    quota_resets_at = NOW() + INTERVAL '1 month'
  WHERE quota_resets_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment usage counter
CREATE OR REPLACE FUNCTION increment_intelligence_usage(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET intelligence_usage_current = intelligence_usage_current + 1
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has access to tool
CREATE OR REPLACE FUNCTION check_intelligence_access(
  p_user_id UUID,
  p_tool_name TEXT
)
RETURNS TABLE(
  allowed BOOLEAN,
  reason TEXT,
  usage_remaining INTEGER
) AS $$
DECLARE
  v_tier_features JSONB;
  v_quota INTEGER;
  v_usage INTEGER;
BEGIN
  -- Get user's subscription details
  SELECT
    st.intelligence_features,
    st.intelligence_quota_monthly,
    us.intelligence_usage_current
  INTO v_tier_features, v_quota, v_usage
  FROM user_subscriptions us
  JOIN subscription_tiers st ON st.id = us.tier_id
  WHERE us.user_id = p_user_id
  AND us.status = 'active';

  -- Check if subscription exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No active subscription found', 0;
    RETURN;
  END IF;

  -- Check if feature is available in tier
  IF NOT (v_tier_features->p_tool_name)::boolean THEN
    RETURN QUERY SELECT false, 'Feature not available in your tier', 0;
    RETURN;
  END IF;

  -- Check quota
  IF v_usage >= v_quota THEN
    RETURN QUERY SELECT false, 'Monthly quota exceeded', 0;
    RETURN;
  END IF;

  -- Access granted
  RETURN QUERY SELECT true, 'Access granted', (v_quota - v_usage);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean expired cache
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM intelligence_cache
  WHERE expires_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_subscription_tiers_updated_at ON subscription_tiers;
CREATE TRIGGER update_subscription_tiers_updated_at
  BEFORE UPDATE ON subscription_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_expert_profiles_updated_at ON expert_marketplace_profiles;
CREATE TRIGGER update_expert_profiles_updated_at
  BEFORE UPDATE ON expert_marketplace_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_products_updated_at ON api_marketplace_products;
CREATE TRIGGER update_api_products_updated_at
  BEFORE UPDATE ON api_marketplace_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE subscription_tiers IS 'Phase 2 Intelligence API: Tier management and premium features';
