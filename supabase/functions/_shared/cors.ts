/**
 * CORS handling for Supabase Edge Functions
 */

const ALLOWED_ORIGINS = [
  'https://dashboard.lanonasis.com',
  'https://mcp.lanonasis.com',
  'https://api.lanonasis.com',
  'https://auth.lanonasis.com',
  'https://docs.lanonasis.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

/**
 * Generate CORS headers for a request
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');

  // Allow specific origins or fall back to wildcard for API access
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-API-Key, X-Requested-With, X-Client-Version',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Handle CORS preflight requests
 * Returns a Response for OPTIONS requests, null otherwise
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }
  return null;
}

/**
 * Wrap a response with CORS headers
 */
export function withCors(response: Response, req: Request): Response {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(req)).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
