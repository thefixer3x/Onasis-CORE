-- Event store and outbox for auth-gateway (Neon command side)

CREATE TABLE IF NOT EXISTS auth_gateway.events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  version BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  event_type_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_aggregate ON auth_gateway.events (aggregate_type, aggregate_id, version);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON auth_gateway.events (occurred_at DESC);

CREATE TABLE IF NOT EXISTS auth_gateway.outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES auth_gateway.events(event_id) ON DELETE CASCADE,
  destination TEXT NOT NULL DEFAULT 'supabase',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_next_attempt ON auth_gateway.outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_event_id ON auth_gateway.outbox (event_id);

-- Helper to keep updated_at fresh
CREATE OR REPLACE FUNCTION auth_gateway.touch_outbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_outbox_set_updated_at ON auth_gateway.outbox;
CREATE TRIGGER trg_outbox_set_updated_at
BEFORE UPDATE ON auth_gateway.outbox
FOR EACH ROW EXECUTE FUNCTION auth_gateway.touch_outbox_updated_at();
