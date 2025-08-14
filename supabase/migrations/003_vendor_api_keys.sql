-- Migration: Foreign API Key Manager
-- Create table for securely storing vendor API keys

-- Create vendor_api_keys table
CREATE TABLE IF NOT EXISTS vendor_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name VARCHAR(100) NOT NULL,
    key_name VARCHAR(200) NOT NULL,
    encrypted_key TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    
    -- Ensure unique vendor/key combinations
    UNIQUE(vendor_name, key_name)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vendor_keys_vendor_name ON vendor_api_keys(vendor_name);
CREATE INDEX IF NOT EXISTS idx_vendor_keys_active ON vendor_api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_vendor_keys_created ON vendor_api_keys(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE vendor_api_keys ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Only service role and authenticated admins can access vendor keys
CREATE POLICY "Service role full access" ON vendor_api_keys
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Admin users can read vendor keys
CREATE POLICY "Admin read access" ON vendor_api_keys
    FOR SELECT
    TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'admin' OR
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- Admin users can manage vendor keys
CREATE POLICY "Admin write access" ON vendor_api_keys
    FOR ALL
    TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'admin' OR
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    )
    WITH CHECK (
        auth.jwt() ->> 'role' = 'admin' OR
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_vendor_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER vendor_keys_updated_at
    BEFORE UPDATE ON vendor_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_keys_updated_at();

-- Create function for schema initialization (used by the key manager)
CREATE OR REPLACE FUNCTION create_vendor_keys_table()
RETURNS void AS $$
BEGIN
    -- This function ensures the table exists
    -- Already created above, but this allows the service to call it safely
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON vendor_api_keys TO authenticated;
GRANT EXECUTE ON FUNCTION create_vendor_keys_table() TO authenticated;

-- Insert some example vendor configurations (without real keys)
INSERT INTO vendor_api_keys (vendor_name, key_name, encrypted_key, description) VALUES
    ('openai', 'primary', '{"encrypted":"example","iv":"example","authTag":"example"}', 'Primary OpenAI API key for chat completions'),
    ('anthropic', 'primary', '{"encrypted":"example","iv":"example","authTag":"example"}', 'Primary Anthropic API key for Claude'),
    ('perplexity', 'primary', '{"encrypted":"example","iv":"example","authTag":"example"}', 'Primary Perplexity API key for search')
ON CONFLICT (vendor_name, key_name) DO NOTHING;

-- Create audit log for key access
CREATE TABLE IF NOT EXISTS vendor_key_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID REFERENCES vendor_api_keys(id),
    action VARCHAR(50) NOT NULL, -- 'accessed', 'created', 'updated', 'rotated', 'deleted'
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_audit_key_id ON vendor_key_audit_log(key_id);
CREATE INDEX IF NOT EXISTS idx_key_audit_timestamp ON vendor_key_audit_log(timestamp);

-- Enable RLS on audit log
ALTER TABLE vendor_key_audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log policies
CREATE POLICY "Service role audit access" ON vendor_key_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Admin audit read" ON vendor_key_audit_log
    FOR SELECT
    TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'admin' OR
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

GRANT ALL ON vendor_key_audit_log TO authenticated;