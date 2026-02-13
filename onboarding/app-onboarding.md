# Application Onboarding Guide

**Version:** 1.0  
**Last Updated:** November 1, 2025  
**Database:** Neon PostgreSQL 17.5 (super-night-54410645)

---

## Overview

This guide walks you through provisioning a new application schema in The Fixer Initiative's multi-tenant database architecture. Each app gets isolated schema with standardized tables for users, profiles, and settings.

---

## Prerequisites

- [ ] Database admin access (can create schemas)
- [ ] Unique `app_id` chosen (format: `app_your_name`)
- [ ] Application registered in Control Room
- [ ] Understanding of Row-Level Security (RLS) requirements

---

## Quick Start

### Option 1: Automated Provisioning (Recommended)

\`\`\`sql
-- Run the automated app provisioning script
DO $$
DECLARE
    v_app_id TEXT := 'app_your_service';  -- Change this
    v_app_name TEXT := 'Your Service';    -- Change this
    v_schema_name TEXT := 'app_your_service';
BEGIN
    -- Create schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);
    
    -- Users table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            app_id TEXT NOT NULL REFERENCES control_room.apps(app_id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            full_name TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            metadata JSONB DEFAULT ''{}''::jsonb,
            UNIQUE(app_id, email)
        )', v_schema_name);
    
    -- Profiles table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.profiles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
            bio TEXT,
            avatar_url TEXT,
            preferences JSONB DEFAULT ''{}''::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )', v_schema_name, v_schema_name);
    
    -- Settings table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, key)
        )', v_schema_name, v_schema_name);
    
    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_users_app_id ON %I.users(app_id)', 
        v_schema_name, v_schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_users_email ON %I.users(email)', 
        v_schema_name, v_schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_profiles_user_id ON %I.profiles(user_id)', 
        v_schema_name, v_schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_settings_user_id ON %I.settings(user_id)', 
        v_schema_name, v_schema_name);
    
    -- Register in Control Room
    INSERT INTO control_room.apps (app_id, app_name, target_schema, status)
    VALUES (v_app_id, v_app_name, v_schema_name, 'active')
    ON CONFLICT (app_id) DO NOTHING;
    
    RAISE NOTICE 'App % provisioned successfully!', v_app_id;
END $$;
\`\`\`

### Option 2: Manual Step-by-Step

See detailed steps below.

---

## Step 1: Register in Control Room

\`\`\`sql
-- Register your app
INSERT INTO control_room.apps (
    app_id,
    app_name,
    target_schema,
    description,
    status,
    metadata
) VALUES (
    'app_your_service',           -- Unique ID (lowercase, underscores)
    'Your Service Name',          -- Display name
    'app_your_service',           -- Schema name (must match app_id)
    'Brief description of your service',
    'active',                     -- active | inactive | deprecated
    jsonb_build_object(
        'version', '1.0.0',
        'repository', 'https://github.com/yourorg/yourapp',
        'tech_stack', ARRAY['Node.js', 'React', 'PostgreSQL'],
        'requires_auth', true,
        'public_access', false
    )
) RETURNING id, app_id, target_schema;
\`\`\`

---

## Step 2: Create App Schema

\`\`\`sql
-- Create dedicated schema
CREATE SCHEMA IF NOT EXISTS app_your_service;

-- Grant usage
GRANT USAGE ON SCHEMA app_your_service TO authenticated;
GRANT USAGE ON SCHEMA app_your_service TO service_role;
\`\`\`

---

## Step 3: Create Standard Tables

### Users Table
\`\`\`sql
CREATE TABLE IF NOT EXISTS app_your_service.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id TEXT NOT NULL REFERENCES control_room.apps(app_id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    phone_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT unique_app_user UNIQUE(app_id, email)
);

CREATE INDEX idx_app_your_service_users_app_id ON app_your_service.users(app_id);
CREATE INDEX idx_app_your_service_users_email ON app_your_service.users(email);
CREATE INDEX idx_app_your_service_users_created_at ON app_your_service.users(created_at);
\`\`\`

### Profiles Table
\`\`\`sql
CREATE TABLE IF NOT EXISTS app_your_service.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_your_service.users(id) ON DELETE CASCADE,
    bio TEXT,
    avatar_url TEXT,
    website_url TEXT,
    social_links JSONB DEFAULT '{}'::jsonb,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT one_profile_per_user UNIQUE(user_id)
);

CREATE INDEX idx_app_your_service_profiles_user_id ON app_your_service.profiles(user_id);
\`\`\`

### Settings Table
\`\`\`sql
CREATE TABLE IF NOT EXISTS app_your_service.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_your_service.users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB,
    value_type TEXT CHECK (value_type IN ('string', 'number', 'boolean', 'object', 'array')),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_setting UNIQUE(user_id, key)
);

CREATE INDEX idx_app_your_service_settings_user_id ON app_your_service.settings(user_id);
CREATE INDEX idx_app_your_service_settings_key ON app_your_service.settings(key);
\`\`\`

---

## Step 4: Add Application-Specific Tables

Example additional tables for different app types:

### E-Commerce App
\`\`\`sql
-- Products
CREATE TABLE app_your_service.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    stock_quantity INTEGER DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders
CREATE TABLE app_your_service.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_your_service.users(id),
    status TEXT DEFAULT 'pending',
    total_amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

### SaaS App
\`\`\`sql
-- Subscriptions
CREATE TABLE app_your_service.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_your_service.users(id),
    plan_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage Metrics
CREATE TABLE app_your_service.usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_your_service.users(id),
    metric_name TEXT NOT NULL,
    metric_value BIGINT DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

---

## Step 5: Configure Row-Level Security (RLS)

### Enable RLS
\`\`\`sql
ALTER TABLE app_your_service.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_your_service.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_your_service.settings ENABLE ROW LEVEL SECURITY;
\`\`\`

### Create Policies

#### Users Can Read Own Data
\`\`\`sql
CREATE POLICY users_select_own 
ON app_your_service.users 
FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY profiles_select_own 
ON app_your_service.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY settings_select_own 
ON app_your_service.settings 
FOR SELECT 
USING (auth.uid() = user_id);
\`\`\`

#### Users Can Update Own Data
\`\`\`sql
CREATE POLICY users_update_own 
ON app_your_service.users 
FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY profiles_update_own 
ON app_your_service.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY settings_update_own 
ON app_your_service.settings 
FOR UPDATE 
USING (auth.uid() = user_id);
\`\`\`

#### Service Role Has Full Access
\`\`\`sql
CREATE POLICY service_role_all 
ON app_your_service.users 
FOR ALL 
USING (auth.role() = 'service_role');

CREATE POLICY service_role_profiles 
ON app_your_service.profiles 
FOR ALL 
USING (auth.role() = 'service_role');

CREATE POLICY service_role_settings 
ON app_your_service.settings 
FOR ALL 
USING (auth.role() = 'service_role');
\`\`\`

---

## Step 6: Create Helper Functions

### Get or Create User
\`\`\`sql
CREATE OR REPLACE FUNCTION app_your_service.get_or_create_user(
    p_app_id TEXT,
    p_email TEXT,
    p_full_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Try to find existing user
    SELECT id INTO v_user_id
    FROM app_your_service.users
    WHERE app_id = p_app_id AND email = p_email;
    
    -- Create if doesn't exist
    IF v_user_id IS NULL THEN
        INSERT INTO app_your_service.users (app_id, email, full_name)
        VALUES (p_app_id, p_email, p_full_name)
        RETURNING id INTO v_user_id;
        
        -- Create default profile
        INSERT INTO app_your_service.profiles (user_id)
        VALUES (v_user_id);
    END IF;
    
    -- Update last login
    UPDATE app_your_service.users
    SET last_login_at = NOW()
    WHERE id = v_user_id;
    
    RETURN v_user_id;
END;
$$;
\`\`\`

### Get User Setting
\`\`\`sql
CREATE OR REPLACE FUNCTION app_your_service.get_setting(
    p_user_id UUID,
    p_key TEXT,
    p_default JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_value JSONB;
BEGIN
    SELECT value INTO v_value
    FROM app_your_service.settings
    WHERE user_id = p_user_id AND key = p_key;
    
    RETURN COALESCE(v_value, p_default);
END;
$$;
\`\`\`

### Update User Setting
\`\`\`sql
CREATE OR REPLACE FUNCTION app_your_service.set_setting(
    p_user_id UUID,
    p_key TEXT,
    p_value JSONB,
    p_value_type TEXT DEFAULT 'object'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO app_your_service.settings (user_id, key, value, value_type)
    VALUES (p_user_id, p_key, p_value, p_value_type)
    ON CONFLICT (user_id, key) 
    DO UPDATE SET 
        value = EXCLUDED.value,
        value_type = EXCLUDED.value_type,
        updated_at = NOW();
END;
$$;
\`\`\`

---

## Step 7: Grant User Access

### Bulk User Import
\`\`\`sql
-- Grant access to multiple users
INSERT INTO control_room.user_app_access (user_id, app_id, granted_by)
SELECT 
    u.id as user_id,
    'app_your_service' as app_id,
    'admin-uuid' as granted_by
FROM auth.users u
WHERE u.email IN (
    'user1@example.com',
    'user2@example.com',
    'user3@example.com'
)
ON CONFLICT (user_id, app_id) DO NOTHING;
\`\`\`

### Grant by Organization
\`\`\`sql
-- Grant access to all users in an organization
INSERT INTO control_room.user_app_access (user_id, app_id, granted_by)
SELECT 
    u.id,
    'app_your_service',
    'admin-uuid'
FROM auth.users u
JOIN client_services.accounts ca ON u.id = ca.user_id
WHERE ca.organization_id = 'org-uuid'
ON CONFLICT (user_id, app_id) DO NOTHING;
\`\`\`

---

## Step 8: Test Your App Schema

### Connectivity Test
\`\`\`javascript
// test-app-schema.js
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });

const sql = neon(process.env.DATABASE_URL

async function testAppSchema() {
    const appId = 'app_your_service';
    
    // Test app registration
    const app = await sql`
        SELECT app_id, app_name, target_schema, status
        FROM control_room.apps
        WHERE app_id = ${appId}
    `;
    console.log('App:', app[0]);
    
    // Test schema tables
    const tables = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ${appId}
        ORDER BY table_name
    `;
    console.log('Tables:', tables.map(t => t.table_name));
    
    // Test user creation
    const testUser = await sql`
        INSERT INTO ${sql(appId)}.users (app_id, email, full_name)
        VALUES (${appId}, 'test@example.com', 'Test User')
        ON CONFLICT (app_id, email) DO UPDATE SET updated_at = NOW()
        RETURNING id, email, created_at
    `;
    console.log('Test user:', testUser[0]);
    
    console.log('✅ All tests passed!');
}

testAppSchema().catch(console.error);
\`\`\`

---

## CICD Integration

### GitHub Actions Example
\`\`\`yaml
# .github/workflows/provision-app.yml
name: Provision App Schema

on:
  push:
    branches: [main]
    paths:
      - 'migrations/provision-app.sql'

jobs:
  provision:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install PostgreSQL client
        run: sudo apt-get install -y postgresql-client
      
      - name: Run provisioning script
        env:
postgresql://<user>:<password>@<host>:<port>/<db>
        run: |
          psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
      
      - name: Verify schema
        env:
postgresql://<user>:<password>@<host>:<port>/<db>
        run: |
          psql $DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
            SELECT COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema = 'app_your_service'
          "
\`\`\`

---

## Monitoring & Maintenance

### Check Schema Health
\`\`\`sql
-- Table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'app_your_service'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'app_your_service'
ORDER BY idx_scan DESC;

-- User activity
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE is_active) as active_users,
    COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as recent_logins
FROM app_your_service.users;
\`\`\`

---

## Common Patterns

### 18-App Schema Template
We use this pattern for all apps:
- `users` (app-specific user records)
- `profiles` (extended user info)
- `settings` (key-value user preferences)
- Additional tables as needed

Current apps using this pattern:
- app_sub_pro
- app_task_manager
- app_the_fixer_initiative
- app_seftec_shop
- app_seftechub
- ... and 13 more

---

## Support

- **Example Script:** `/scripts/merge_all_app_schemas.sql`
- **Control Room Mapping:** `/db-setup-kit/control_room_apps_mapping.md`
- **Test Scripts:** `test-db-connection.js`

✅ **Your app is ready to deploy!**
