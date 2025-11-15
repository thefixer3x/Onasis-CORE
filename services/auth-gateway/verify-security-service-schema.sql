-- Verify all tables exist in security_service schema
SET search_path TO security_service, public;

-- List all API key management tables
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'security_service' 
  AND tablename IN ('api_key_projects', 'stored_api_keys', 'key_rotation_policies', 'mcp_key_tools', 'mcp_key_sessions')
ORDER BY tablename;

-- Check indexes
SELECT 
    schemaname,
    indexname,
    tablename
FROM pg_indexes
WHERE schemaname = 'security_service'
  AND tablename IN ('api_key_projects', 'stored_api_keys')
ORDER BY tablename, indexname;

-- Verify foreign keys
SELECT
    tc.table_schema, 
    tc.table_name, 
    kcu.column_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'security_service'
  AND tc.table_name IN ('api_key_projects', 'stored_api_keys');
