-- Fix RLS policies (PostgreSQL doesn't support IF NOT EXISTS for policies)

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own sessions" ON auth_gateway.sessions;
DROP POLICY IF EXISTS "Service role can manage all sessions" ON auth_gateway.sessions;
DROP POLICY IF EXISTS "Users can view their API clients" ON auth_gateway.api_clients;
DROP POLICY IF EXISTS "Service role can manage API clients" ON auth_gateway.api_clients;

-- Create policies
CREATE POLICY "Users can view their own sessions" ON auth_gateway.sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all sessions" ON auth_gateway.sessions
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view their API clients" ON auth_gateway.api_clients
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Service role can manage API clients" ON auth_gateway.api_clients
  USING (auth.role() = 'service_role');

-- Verify policies
SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'auth_gateway';
