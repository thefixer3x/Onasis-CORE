SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'auth_events' 
ORDER BY indexname;
