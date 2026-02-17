--                                                                              
-- Seed Auth Tester OAuth client                                                
-- Migration: 014_seed_auth_tester_client                                       
-- Purpose: Add the auth-tester client for the comprehensive auth testing interface
--                                                                              
                                                                                
INSERT INTO auth_gateway.oauth_clients (                                        
    client_id,                                                                  
    client_name,                                                                
    client_type,                                                                
    application_type,                                                           
    require_pkce,                                                               
    allowed_code_challenge_methods,                                             
    allowed_redirect_uris,                                                      
    allowed_scopes,                                                             
    default_scopes,                                                             
    status,                                                                     
    description                                                                 
) VALUES                                                                        
    (                                                                           
        'auth-tester',                                                          
        'Auth Gateway Testing Interface',                                       
        'public',                                                               
        'web',                                                                  
        TRUE,                                                                   
        ARRAY['S256']::VARCHAR[],                                               
        '["http://localhost:4000/auth-tester", "http://127.0.0.1:4000/auth-tester", "http://localhost:4000/", "http://127.0.0.1:4000/"]'::jsonb,                                                              
        ARRAY['openid', 'profile', 'email', 'memories:read', 'memories:write', 'mcp:connect', 'api:access']::TEXT[],                                           
        ARRAY['openid', 'profile', 'email']::TEXT[],                            
        'active',                                                               
        'Auth Gateway Testing Interface OAuth client for testing all 9 auth methods'                                                                           
    )                                                                           
ON CONFLICT (client_id) DO UPDATE SET                                           
    client_name = EXCLUDED.client_name,                                         
    client_type = EXCLUDED.client_type,                                         
    application_type = EXCLUDED.application_type,                               
    require_pkce = EXCLUDED.require_pkce,                                       
    allowed_code_challenge_methods = EXCLUDED.allowed_code_challenge_methods,   
    allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,                     
    allowed_scopes = EXCLUDED.allowed_scopes,                                   
    default_scopes = EXCLUDED.default_scopes,                                   
    status = EXCLUDED.status,                                                   
    description = EXCLUDED.description,                                         
    updated_at = NOW();                                                         
                
DO $$                                                                           
BEGIN                                                                           
    RAISE NOTICE 'Migration 014: Seeded Auth Tester OAuth client';              
END $$;
