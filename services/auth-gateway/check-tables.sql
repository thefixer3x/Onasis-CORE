-- Check all schemas
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
ORDER BY schema_name;

-- Check tables in public schema
SELECT 'PUBLIC SCHEMA' as location, table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%api_key%'
ORDER BY table_name;

-- Check tables in security_service schema
SELECT 'SECURITY_SERVICE SCHEMA' as location, table_name 
FROM information_schema.tables 
WHERE table_schema = 'security_service' 
  AND table_name LIKE '%api_key%'
ORDER BY table_name;

-- Count rows in public tables
SELECT 'public.api_key_projects' as table_name, COUNT(*) as row_count 
FROM public.api_key_projects
UNION ALL
SELECT 'public.stored_api_keys', COUNT(*) 
FROM public.stored_api_keys;

-- Check if security_service tables exist
SELECT 'security_service.api_key_projects' as table_name, COUNT(*) as row_count 
FROM security_service.api_key_projects
UNION ALL
SELECT 'security_service.stored_api_keys', COUNT(*) 
FROM security_service.stored_api_keys;
