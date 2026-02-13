/**
 * Compatibility alias for config-get
 * Supports legacy clients calling /functions/v1/get_config
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'SUPABASE_URL is not configured', 500);
    }

    const targetUrl = new URL(`${supabaseUrl}/functions/v1/config-get`);
    const reqUrl = new URL(req.url);
    targetUrl.search = reqUrl.search;

    const headers: HeadersInit = {
      'Content-Type': req.headers.get('Content-Type') || 'application/json',
    };

    const authHeader = req.headers.get('Authorization');
    if (authHeader) headers['Authorization'] = authHeader;

    const apiKeyHeader = req.headers.get('X-API-Key');
    if (apiKeyHeader) headers['X-API-Key'] = apiKeyHeader;

    const body = req.method === 'GET' ? undefined : await req.text();
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: { ...corsHeaders(req), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  } catch (error) {
    console.error('get_config alias error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
