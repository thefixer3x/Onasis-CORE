/**
 * MCP SSE Proxy to Onasis-Core
 * Deployed at: https://mcp.lanonasis.com/sse
 * Routes SSE requests to onasis-core for centralized handling
 */

const ONASIS_CORE_URL = process.env.ONASIS_CORE_URL || 'https://api.lanonasis.com';

/**
 * Main handler for SSE endpoint - proxies to onasis-core
 */
export default async function handler(event, context) {
  try {
    const url = `${ONASIS_CORE_URL}/sse`;
    
    // Forward the request to onasis-core
    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        ...event.headers,
        'X-Forwarded-For': event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'],
        'X-Real-IP': event.headers['x-real-ip'] || event.headers['X-Real-IP']
      }
    });

    // For SSE, we need to stream the response
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Client-Id, X-MCP-Capabilities'
        },
        body: response.body,
        isBase64Encoded: false
      };
    }

    // For non-SSE responses (like errors), return as JSON
    const data = await response.text();
    
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: data
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'SSE proxy error to onasis-core',
        message: error.message
      })
    };
  }
}

/**
 * Handle OPTIONS requests for CORS
 */
export async function options() {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Client-Id, X-MCP-Capabilities',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: ''
  };
}