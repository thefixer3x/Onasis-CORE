const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Project-Scope, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

function getHeader(headers, name) {
  return headers?.[name] ?? headers?.[name.toLowerCase()] ?? headers?.[name.toUpperCase()] ?? '';
}

function getProxyPath(event) {
  return (event.path || '').replace('/.netlify/functions/memory-proxy', '') || '/';
}

function getRawQuery(event) {
  if (typeof event.rawQuery === 'string' && event.rawQuery.length > 0) {
    return event.rawQuery;
  }

  const params = new URLSearchParams();
  const query = event.queryStringParameters || {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      params.set(key, value);
    }
  }

  return params.toString();
}

function safeJsonParse(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function buildRouteConfig(proxyPath, method, rawQuery) {
  const itemMatch = proxyPath.match(/^\/get\/([^/]+)$/);
  if (itemMatch) {
    const memoryId = decodeURIComponent(itemMatch[1]);
    if (method === 'GET' || method === 'HEAD') {
      return { targetPath: `memory-get/${encodeURIComponent(memoryId)}`, query: rawQuery, body: undefined };
    }
    if (method === 'DELETE') {
      return { targetPath: `memory-delete/${encodeURIComponent(memoryId)}`, query: rawQuery, body: undefined };
    }
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
      return { targetPath: 'memory-update', query: '', injectId: memoryId };
    }
  }

  switch (proxyPath) {
    case '/':
    case '/collection':
      return method === 'GET'
        ? { targetPath: 'memory-list', query: rawQuery, body: undefined }
        : { targetPath: 'memory-create', query: '', body: undefined };
    case '/create':
      return { targetPath: 'memory-create', query: '', body: undefined };
    case '/search':
      return { targetPath: 'memory-search', query: rawQuery, body: undefined };
    case '/stats':
      return { targetPath: 'memory-stats', query: rawQuery, body: undefined };
    case '/list':
      return { targetPath: 'memory-list', query: rawQuery, body: undefined };
    case '/health':
      return { targetPath: 'system-health', query: rawQuery, body: undefined };
    case '/bulk-delete':
    case '/bulk/delete':
      return { targetPath: 'memory-bulk-delete', query: rawQuery, body: undefined };
    case '/update':
      return { targetPath: 'memory-update', query: '', body: undefined };
    case '/delete':
      return { targetPath: 'memory-delete', query: rawQuery, body: undefined };
    case '/legacy-get':
      return { targetPath: 'memory-get', query: rawQuery, body: undefined };
    default:
      return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://lanonasis.supabase.co';

  if (!anonKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Missing SUPABASE_ANON_KEY for memory proxy',
        code: 'PROXY_CONFIG_ERROR',
      }),
    };
  }

  const proxyPath = getProxyPath(event);
  const method = event.httpMethod || 'GET';
  const rawQuery = getRawQuery(event);
  const route = buildRouteConfig(proxyPath, method, rawQuery);

  if (!route) {
    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Memory proxy route not found',
        code: 'NOT_FOUND',
        path: proxyPath,
      }),
    };
  }

  const incomingHeaders = event.headers || {};
  const incomingAuthorization = getHeader(incomingHeaders, 'authorization');
  const incomingApiKey = getHeader(incomingHeaders, 'x-api-key');
  const incomingProjectScope = getHeader(incomingHeaders, 'x-project-scope');
  const incomingClientInfo = getHeader(incomingHeaders, 'x-client-info');
  const contentType = getHeader(incomingHeaders, 'content-type') || 'application/json';

  let body = event.body;
  if (route.injectId) {
    const parsed = safeJsonParse(event.body) || {};
    body = JSON.stringify({
      ...parsed,
      id: route.injectId,
    });
  }

  const targetUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${route.targetPath}`);
  if (route.query) {
    targetUrl.search = route.query;
  }

  const forwardHeaders = {
    'Content-Type': contentType,
    apikey: anonKey,
    Authorization: incomingAuthorization || `Bearer ${anonKey}`,
  };

  if (incomingApiKey) {
    forwardHeaders['X-API-Key'] = incomingApiKey;
  }
  if (incomingProjectScope) {
    forwardHeaders['x-project-scope'] = incomingProjectScope;
  }
  if (incomingClientInfo) {
    forwardHeaders['x-client-info'] = incomingClientInfo;
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });

    const responseText = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        ...CORS_HEADERS,
      },
      body: responseText,
    };
  } catch (error) {
    console.error('[memory-proxy] upstream error', error);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to reach memory edge functions',
        code: 'UPSTREAM_UNAVAILABLE',
      }),
    };
  }
};
