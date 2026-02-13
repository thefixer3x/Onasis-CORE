-- Migration: Create Behavior Patterns Table
-- Creates the behavior_patterns table for intelligence behavior recording, recall, and suggestions
-- Date: 2025-02-13

-- ============================================================================
-- BEHAVIOR PATTERNS TABLE (for intelligence endpoints)
-- ============================================================================

-- Behavior patterns for ML model training and user behavior analysis
CREATE TABLE IF NOT EXISTS behavior_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Pattern identification
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('usage', 'interaction', 'learning', 'memory_access', 'preference')),
  pattern_name TEXT NOT NULL,
  pattern_description TEXT,

  -- Pattern data
  pattern_data JSONB NOT NULL,
  pattern_confidence DECIMAL(5, 4),

  -- Context and metadata
  context JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Statistics
  occurrence_count INTEGER DEFAULT 1,
  last_occurrence_at TIMESTAMPTZ DEFAULT NOW(),
  frequency_per_week DECIMAL(10, 2),

  -- Status and lifecycle
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deprecated')),
  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Behavior pattern recall (storing recalled behaviors for training)
CREATE TABLE IF NOT EXISTS behavior_pattern_recalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pattern_id UUID REFERENCES behavior_patterns(id) ON DELETE CASCADE,

  -- Recall details
  recalled_data JSONB NOT NULL,
  recall_context JSONB,
  recall_accuracy DECIMAL(5, 4),

  -- AI model information
  model_used TEXT,
  model_version TEXT,

  -- User feedback on recall
  user_feedback TEXT CHECK (user_feedback IN ('accurate', 'partial', 'inaccurate', 'unknown')),
  feedback_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Behavior pattern suggestions (AI suggestions based on patterns)
CREATE TABLE IF NOT EXISTS behavior_pattern_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pattern_id UUID REFERENCES behavior_patterns(id) ON DELETE CASCADE,

  -- Suggestion details
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('action', 'optimization', 'learning', 'reminder')),
  suggestion_text TEXT NOT NULL,
  suggestion_data JSONB,
  confidence_score DECIMAL(5, 4),

  -- AI model information
  model_used TEXT,
  reason_text TEXT,

  -- User response
  user_response TEXT CHECK (user_response IN ('accepted', 'rejected', 'dismissed', 'later')),
  response_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Behavior patterns indexes
CREATE INDEX IF NOT EXISTS idx_behavior_patterns_user_id ON behavior_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_behavior_patterns_pattern_type ON behavior_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_behavior_patterns_status ON behavior_patterns(status);
CREATE INDEX IF NOT EXISTS idx_behavior_patterns_created_at ON behavior_patterns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_patterns_last_occurrence ON behavior_patterns(last_occurrence_at DESC);

-- Behavior recalls indexes
CREATE INDEX IF NOT EXISTS idx_behavior_recalls_user_id ON behavior_pattern_recalls(user_id);
CREATE INDEX IF NOT EXISTS idx_behavior_recalls_pattern_id ON behavior_pattern_recalls(pattern_id);
CREATE INDEX IF NOT EXISTS idx_behavior_recalls_created_at ON behavior_pattern_recalls(created_at DESC);

-- Behavior suggestions indexes
CREATE INDEX IF NOT EXISTS idx_behavior_suggestions_user_id ON behavior_pattern_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_behavior_suggestions_pattern_id ON behavior_pattern_suggestions(pattern_id);
CREATE INDEX IF NOT EXISTS idx_behavior_suggestions_type ON behavior_pattern_suggestions(suggestion_type);
CREATE INDEX IF NOT EXISTS idx_behavior_suggestions_created_at ON behavior_pattern_suggestions(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE behavior_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_pattern_recalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_pattern_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own behavior patterns
DROP POLICY IF EXISTS "Users can view their own behavior patterns" ON behavior_patterns;
CREATE POLICY "Users can view their own behavior patterns"
  ON behavior_patterns FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own behavior patterns" ON behavior_patterns;
CREATE POLICY "Users can manage their own behavior patterns"
  ON behavior_patterns FOR ALL
  USING (auth.uid() = user_id);

-- Users can only see their own recalls
DROP POLICY IF EXISTS "Users can view their own pattern recalls" ON behavior_pattern_recalls;
CREATE POLICY "Users can view their own pattern recalls"
  ON behavior_pattern_recalls FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own pattern recalls" ON behavior_pattern_recalls;
CREATE POLICY "Users can manage their own pattern recalls"
  ON behavior_pattern_recalls FOR ALL
  USING (auth.uid() = user_id);

-- Users can only see their own suggestions
DROP POLICY IF EXISTS "Users can view their own pattern suggestions" ON behavior_pattern_suggestions;
CREATE POLICY "Users can view their own pattern suggestions"
  ON behavior_pattern_suggestions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own pattern suggestions" ON behavior_pattern_suggestions;
CREATE POLICY "Users can manage their own pattern suggestions"
  ON behavior_pattern_suggestions FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at on behavior patterns
CREATE OR REPLACE FUNCTION update_behavior_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_behavior_patterns_timestamp ON behavior_patterns;
CREATE TRIGGER update_behavior_patterns_timestamp
  BEFORE UPDATE ON behavior_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_behavior_patterns_updated_at();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE behavior_patterns IS 'Intelligence API: Behavior patterns for ML model training and user behavior analysis';
COMMENT ON TABLE behavior_pattern_recalls IS 'Intelligence API: Recalled behaviors for model training and accuracy assessment';
COMMENT ON TABLE behavior_pattern_suggestions IS 'Intelligence API: AI suggestions based on detected user behavior patterns';
