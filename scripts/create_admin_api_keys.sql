-- Create Admin Organization and API Keys for onasis-core
-- This script creates a proper admin organization and generates 2 working API keys
-- that are properly mapped through the onasis-core authentication system

-- Step 1: Create Admin Organization
INSERT INTO vendor_organizations (
    vendor_code,
    organization_name,
    organization_type,
    contact_email,
    contact_name,
    platform_access,
    service_permissions,
    billing_tier,
    billing_model,
    monthly_limit,
    rate_limit_per_minute,
    status
) VALUES (
    'ADMIN_ORG',
    'Onasis Admin Organization',
    'enterprise',
    'admin@lanonasis.com',
    'System Administrator',
    '["api.lanonasis.com", "dashboard.lanonasis.com", "mcp.lanonasis.com"]'::jsonb,
    '{"memory-service": true, "ai-chat": true, "embeddings": true, "mcp-server": true, "api-keys": true}'::jsonb,
    'enterprise',
    'usage_based',
    100000,  -- 100k API calls per month
    1000,    -- 1000 requests per minute
    'active'
) ON CONFLICT (vendor_code) DO UPDATE SET
    updated_at = NOW(),
    platform_access = EXCLUDED.platform_access,
    service_permissions = EXCLUDED.service_permissions;

-- Step 2: Get the organization ID for API key generation
DO $$
DECLARE
    org_id UUID;
    api_key_1 RECORD;
    api_key_2 RECORD;
BEGIN
    -- Get the organization ID
    SELECT id INTO org_id FROM vendor_organizations WHERE vendor_code = 'ADMIN_ORG';
    
    IF org_id IS NULL THEN
        RAISE EXCEPTION 'Admin organization not found';
    END IF;
    
    -- Generate first API key (Live/Admin)
    SELECT * INTO api_key_1 FROM generate_vendor_api_key(
        org_id,
        'Admin Live Key',
        'live',
        'production'
    );
    
    -- Generate second API key (Test/Development)
    SELECT * INTO api_key_2 FROM generate_vendor_api_key(
        org_id,
        'Admin Test Key', 
        'test',
        'development'
    );
    
    -- Display the generated keys
    RAISE NOTICE 'API Key 1 (Live): Public Key: %, Secret Key: %', api_key_1.key_id, api_key_1.key_secret;
    RAISE NOTICE 'API Key 2 (Test): Public Key: %, Secret Key: %', api_key_2.key_id, api_key_2.key_secret;
    
    -- Also insert into a temporary results table for easy retrieval
    DROP TABLE IF EXISTS temp_api_keys;
    CREATE TEMP TABLE temp_api_keys (
        key_type VARCHAR(10),
        key_id VARCHAR(50),
        key_secret VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
    );
    
    INSERT INTO temp_api_keys (key_type, key_id, key_secret) VALUES
        ('live', api_key_1.key_id, api_key_1.key_secret),
        ('test', api_key_2.key_id, api_key_2.key_secret);
        
END $$;

-- Step 3: Display the generated keys (if temp table exists)
SELECT 
    key_type as "Key Type",
    key_id as "Public Key ID", 
    key_secret as "Secret Key",
    created_at as "Created At"
FROM temp_api_keys 
ORDER BY key_type DESC;

-- Step 4: Verify the organization was created successfully
SELECT 
    vendor_code as "Vendor Code",
    organization_name as "Organization Name",
    billing_tier as "Billing Tier",
    platform_access as "Platform Access",
    service_permissions as "Service Permissions",
    status as "Status",
    created_at as "Created At"
FROM vendor_organizations 
WHERE vendor_code = 'ADMIN_ORG';

-- Step 5: Verify the API keys were created successfully
SELECT 
    ak.key_id as "Key ID",
    ak.key_name as "Key Name", 
    ak.key_type as "Key Type",
    ak.environment as "Environment",
    ak.is_active as "Active",
    vo.vendor_code as "Organization",
    ak.created_at as "Created At"
FROM vendor_api_keys ak
JOIN vendor_organizations vo ON ak.vendor_org_id = vo.id
WHERE vo.vendor_code = 'ADMIN_ORG'
ORDER BY ak.created_at DESC;

-- Step 6: Test API key validation (optional)
-- This will validate that the keys work properly with the onasis-core system
-- Uncomment and replace with actual generated keys to test:
--
-- SELECT * FROM validate_vendor_api_key(
--     'pk_live_admin_org_xxxxxxxx',  -- Replace with actual key_id
--     'sk_live_xxxxxxxxxxxxxxxx'     -- Replace with actual key_secret  
-- );

COMMENT ON TABLE vendor_organizations IS 'Organizations created: ADMIN_ORG with enterprise permissions';
COMMENT ON TABLE vendor_api_keys IS 'API keys generated for ADMIN_ORG: 1 live key + 1 test key';