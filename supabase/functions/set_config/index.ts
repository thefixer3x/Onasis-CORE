/**
 * Compatibility alias for config-set
 * Supports legacy clients calling /functions/v1/set_config
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use POST or PUT.', 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'SUPABASE_URL is not configured', 500);
    }

    const targetUrl = `${supabaseUrl}/functions/v1/config-set`;
    const headers: HeadersInit = {
      'Content-Type': req.headers.get('Content-Type') || 'application/json',
    };

    const authHeader = req.headers.get('Authorization');
    if (authHeader) headers['Authorization'] = authHeader;

    const apiKeyHeader = req.headers.get('X-API-Key');
    if (apiKeyHeader) headers['X-API-Key'] = apiKeyHeader;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: await req.text(),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: { ...corsHeaders(req), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  } catch (error) {
    console.error('set_config alias error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
