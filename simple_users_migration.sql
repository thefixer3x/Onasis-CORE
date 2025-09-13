-- Simple Users Table for Basic Authentication
-- Works with any PostgreSQL database (no Supabase-specific features)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Simple users table
CREATE TABLE IF NOT EXISTS simple_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    project_scope VARCHAR(100) DEFAULT 'lanonasis-maas',
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_simple_users_email ON simple_users(email);
CREATE INDEX IF NOT EXISTS idx_simple_users_project_scope ON simple_users(project_scope);
CREATE INDEX IF NOT EXISTS idx_simple_users_active ON simple_users(is_active);
CREATE INDEX IF NOT EXISTS idx_simple_users_created ON simple_users(created_at DESC);

-- Function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updated_at
CREATE TRIGGER update_simple_users_updated_at 
    BEFORE UPDATE ON simple_users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert demo admin user (password: admin123)
INSERT INTO simple_users (email, password_hash, full_name, role) VALUES 
('admin@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYi3ZRjqGHSKvEy', 'Admin User', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Grant permissions to public role (since no RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON simple_users TO public;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO public;

COMMENT ON TABLE simple_users IS 'Simple users table for basic authentication without Supabase RLS';