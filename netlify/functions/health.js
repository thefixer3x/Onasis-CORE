// Health check function for Onasis-CORE
exports.handler = async (event, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'X-Powered-By': 'Onasis-CORE'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // Health check response
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      status: 'ok',
      service: 'Onasis-CORE API Gateway',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: 'production',
      privacy_level: 'high',
      capabilities: [
        'vendor_masking',
        'client_anonymization',
        'request_sanitization',
        'audit_logging',
        'rate_limiting'
      ],
      endpoints: {
        auth: '/v1/auth',
        api: '/api/v1',
        health: '/health',
        info: '/info'
      }
    })
  };
};