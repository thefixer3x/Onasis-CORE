-- ============================================================================
-- Intelligence quota reset on access
-- Date: 2026-05-08
-- Purpose:
--   Keep intelligence access checks from denying users whose monthly reset date
--   has already passed but whose reset job has not run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.check_intelligence_access(
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
  PERFORM public.reset_intelligence_quota();

  SELECT
    st.intelligence_features,
    st.intelligence_quota_monthly,
    us.intelligence_usage_current
  INTO v_tier_features, v_quota, v_usage
  FROM public.user_subscriptions us
  JOIN public.subscription_tiers st ON st.id = us.tier_id
  WHERE us.user_id = p_user_id
    AND us.status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No active subscription found', 0;
    RETURN;
  END IF;

  IF NOT COALESCE((v_tier_features->>p_tool_name)::BOOLEAN, false) THEN
    RETURN QUERY SELECT false, 'Feature not available in your tier', 0;
    RETURN;
  END IF;

  IF p_tool_name = 'health_check' THEN
    RETURN QUERY SELECT true, 'Access granted', CASE
      WHEN v_quota = -1 THEN -1
      ELSE GREATEST(v_quota - v_usage, 0)
    END;
    RETURN;
  END IF;

  IF v_quota = -1 THEN
    RETURN QUERY SELECT true, 'Access granted', -1;
    RETURN;
  END IF;

  IF v_usage >= v_quota THEN
    RETURN QUERY SELECT false, 'Monthly quota exceeded', 0;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'Access granted', (v_quota - v_usage);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_tier_info(p_user_id UUID)
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
  PERFORM public.reset_intelligence_quota();

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
  FROM public.user_subscriptions us
  JOIN public.subscription_tiers st ON st.id = us.tier_id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.log_intelligence_usage(
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
  INSERT INTO public.intelligence_usage_logs (
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

  IF NOT p_cache_hit AND p_success AND p_tool_name <> 'health_check' THEN
    UPDATE public.user_subscriptions
    SET
      intelligence_usage_current = intelligence_usage_current + 1,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
