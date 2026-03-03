const fetch = require('node-fetch');
const { SERVICE_ROUTES } = require('./config/routes.config');

// Minimal sanitizers (port of legacy logic)
const sanitizeRequestBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  const sanitized = JSON.parse(JSON.stringify(body));
  const piiFields = [
    'user_id', 'email', 'ip_address', 'session_id', 'phone', 'address',
    'name', 'firstname', 'lastname', 'ssn', 'credit_card', 'passport'
  ];

  const removePII = (obj) => {
    if (typeof obj === 'object' && obj !== null) {
      for (const field of piiFields) {
        delete obj[field];
      }
      for (const key in obj) {
        if (typeof obj[key] === 'object') removePII(obj[key]);
      }
    }
  };

  removePII(sanitized);
  return sanitized;
};

const sanitizeResponse = (data) => {
  if (!data || typeof data !== 'object') return data;
  const sanitized = JSON.parse(JSON.stringify(data));
  if (sanitized.provider) sanitized.provider = 'onasis-core';
  if (sanitized.model) {
    sanitized.model = sanitized.model
      .replace(/gpt-|claude-|palm-|llama-/, 'onasis-')
      .replace(/openai|anthropic|google|meta/, 'onasis');
  }
  sanitized.onasis_metadata = {
    ...(sanitized.onasis_metadata || {}),
    privacy_level: 'high',
    vendor_masked: true,
    pii_removed: true
  };
  return sanitized;
};

const routeToSupabase = async (req, serviceName, supabasePath, logger) => {
  const SUPABASE_URL=https://<project-ref>.supabase.co
  const SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
  if (!SUPABASE_URL=https://<project-ref>.supabase.co
    throw new Error('Missing SUPABASE_URL=https://<project-ref>.supabase.co
  }

  const url = `${SUPABASE_URL=https://<project-ref>.supabase.co
  const sanitizedBody = sanitizeRequestBody(req.body);
  const requestStartTime = Date.now();

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    'apikey': SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
    'User-Agent': 'Onasis-CORE/1.0',
    ...(req.headers['x-service'] && { 'X-Service': req.headers['x-service'] }),
    ...(req.headers['x-vendor'] && { 'X-Vendor': req.headers['x-vendor'] })
  };

  logger.info('Routing to Supabase', {
    requestId: req.anonymousId,
    service: serviceName,
    url: url,
    method: req.method,
    bodySize: JSON.stringify(sanitizedBody).length
  });

  const response = await fetch(url, {
    method: req.method,
    headers,
    body: req.method !== 'GET' ? JSON.stringify(sanitizedBody) : undefined,
    timeout: 60000
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Supabase function error', {
      requestId: req.anonymousId,
      service: serviceName,
      status: response.status,
      error: errorText
    });
    throw new Error(`Supabase function error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const sanitizedResponse = sanitizeResponse(data);
  sanitizedResponse.onasis_metadata = {
    ...(sanitizedResponse.onasis_metadata || {}),
    service: serviceName,
    response_time: Date.now() - requestStartTime,
    request_id: req.anonymousId,
    routed_via: 'supabase'
  };

  logger.info('Supabase request completed', {
    requestId: req.anonymousId,
    service: serviceName,
    responseTime: Date.now() - requestStartTime,
    status: 'success'
  });

  return sanitizedResponse;
};

module.exports = { sanitizeRequestBody, sanitizeResponse, routeToSupabase };

