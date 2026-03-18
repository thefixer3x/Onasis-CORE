/**
 * Auth Status Edge Function
 * Returns authentication status and user info for the current session
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

type IdentityEnvelope = {
  actor_id: string;
  actor_type: 'user';
  user_id: string;
  organization_id: string;
  project_scope: string | null;
  api_key_id: string | null;
  auth_source: 'api_key' | 'vendor_key' | 'supabase_jwt' | 'oauth_token' | 'supabase';
  request_id: string;
};

function getRequestId(req: Request): string {
  return req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
}

function normalizeAuthSource(auth: NonNullable<Awaited<ReturnType<typeof authenticate>>>): IdentityEnvelope['auth_source'] {
  if (auth.auth_source === 'api_key') {
    return 'api_key';
  }

  if (auth.auth_source === 'auth_gateway') {
    return 'oauth_token';
  }

  if (auth.auth_source === 'supabase') {
    return 'supabase_jwt';
  }

  return 'supabase';
}

function buildIdentityEnvelope(
  auth: NonNullable<Awaited<ReturnType<typeof authenticate>>>,
  requestId: string,
): IdentityEnvelope {
  return {
    actor_id: auth.user_id,
    actor_type: 'user',
    user_id: auth.user_id,
    organization_id: auth.organization_id,
    project_scope: auth.project_scope ?? null,
    api_key_id: auth.api_key_id ?? null,
    auth_source: normalizeAuthSource(auth),
    request_id: requestId,
  };
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use GET or POST.', 405);
  }

  try {
    const requestId = getRequestId(req);
    const auth = await authenticate(req);

    if (!auth) {
      return new Response(JSON.stringify({
        authenticated: false,
        message: 'No valid authentication provided',
        identity: null,
        request_id: requestId,
        timestamp: new Date().toISOString(),
      }), {
        status: 200, // Return 200 even for unauthenticated - this is a status check
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'X-Request-ID': requestId }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, display_name, organization_id, created_at, updated_at')
      .eq('id', auth.user_id)
      .single();

    // Get organization name if exists
    let organizationName: string | undefined;
    if (auth.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', auth.organization_id)
        .single();
      organizationName = org?.name;
    }

    // Count active API keys
    const { count: apiKeyCount } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', auth.user_id)
      .eq('is_active', true);

    // Get current API key details if authenticated via API key
    let currentKeyInfo: any = undefined;
    if (auth.api_key_id) {
      const { data: keyInfo } = await supabase
        .from('api_keys')
        .select('id, name, access_level, permissions, expires_at, last_used_at')
        .eq('id', auth.api_key_id)
        .single();

      if (keyInfo) {
        currentKeyInfo = {
          id: keyInfo.id,
          name: keyInfo.name,
          access_level: keyInfo.access_level,
          permissions: keyInfo.permissions || [],
          expires_at: keyInfo.expires_at,
          is_expiring_soon: keyInfo.expires_at
            ? new Date(keyInfo.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
            : false,
        };
      }
    }

    const identity = buildIdentityEnvelope(auth, requestId);

    return new Response(JSON.stringify({
      authenticated: true,
      identity,
      request_id: requestId,
      user: {
        id: auth.user_id,
        email: auth.email || user?.email,
        display_name: user?.display_name,
        created_at: user?.created_at,
      },
      organization: {
        id: auth.organization_id,
        name: organizationName,
      },
      access: {
        level: auth.access_level,
        is_master: auth.is_master,
        api_keys_count: apiKeyCount || 0,
      },
      current_auth: {
        method: auth.api_key_id ? 'api_key' : 'bearer_token',
        api_key: currentKeyInfo,
      },
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'X-Request-ID': requestId }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
