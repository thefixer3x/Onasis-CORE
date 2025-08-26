/**
 * Netlify Function for MCP SSE Endpoint
 * Deployed at: https://mcp.lanonasis.com/sse
 * 
 * This provides SSE streaming for MCP protocol similar to HubSpot's implementation
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL=https://<project-ref>.supabase.co
  process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
);

// Active SSE connections store
const connections = new Map();

/**
 * Validate API key against vendor_api_keys table
 */
async function validateApiKey(apiKey) {
  try {
    // Extract key parts
    const [prefix, type, ...rest] = apiKey.split('_');
    const keyId = `${prefix}_${type}_${rest.slice(0, -1).join('_')}`;
    const keySecret = apiKey;

    // Call validation function
    const { data, error } = await supabase.rpc('validate_vendor_api_key', {
      p_key_id: keyId,
      p_key_secret: keySecret
    });

    if (error || !data || !data[0]?.is_valid) {
      return { isValid: false };
    }

    return {
      isValid: true,
      vendorOrgId: data[0].vendor_org_id,
      vendorCode: data[0].vendor_code,
      rateLimit: data[0].rate_limit,
      allowedPlatforms: data[0].allowed_platforms,
      allowedServices: data[0].allowed_services
    };
  } catch (error) {
    console.error('API key validation error:', error);
    return { isValid: false };
  }
}

/**
 * Main handler for SSE endpoint
 */
export default async function handler(event, context) {
  // Only handle GET requests for SSE
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Extract API key
  const apiKey = event.headers['x-api-key'] || 
                 event.queryStringParameters?.apiKey;

  if (!apiKey) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'API key required' })
    };
  }

  // Validate API key
  const validation = await validateApiKey(apiKey);
  if (!validation.isValid) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid API key' })
    };
  }

  // Generate connection ID
  const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Store connection info
  connections.set(connectionId, {
    id: connectionId,
    vendorOrgId: validation.vendorOrgId,
    vendorCode: validation.vendorCode,
    connectedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  });

  // Create SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const welcomeMessage = {
        id: `msg_${Date.now()}`,
        type: 'notification',
        method: 'connection.established',
        params: {
          connectionId,
          capabilities: [
            'memory_create',
            'memory_search',
            'memory_list',
            'api_key_create',
            'list_tools',
            'get_status'
          ],
          version: '1.0.0',
          endpoint: 'mcp.lanonasis.com/sse',
          organization: validation.vendorCode
        },
        timestamp: new Date().toISOString()
      };

      controller.enqueue(encoder.encode(
        `id: ${welcomeMessage.id}\n` +
        `event: notification\n` +
        `data: ${JSON.stringify(welcomeMessage)}\n\n`
      ));

      // Send periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        const heartbeat = {
          id: `hb_${Date.now()}`,
          type: 'notification',
          method: 'ping',
          timestamp: new Date().toISOString()
        };

        try {
          controller.enqueue(encoder.encode(
            `id: ${heartbeat.id}\n` +
            `event: ping\n` +
            `data: ${JSON.stringify(heartbeat)}\n\n`
          ));
        } catch (error) {
          // Connection closed, cleanup
          clearInterval(heartbeatInterval);
          connections.delete(connectionId);
        }
      }, 30000); // Every 30 seconds

      // Cleanup on close
      context.waitUntil(new Promise((resolve) => {
        setTimeout(() => {
          clearInterval(heartbeatInterval);
          connections.delete(connectionId);
          resolve();
        }, 600000); // 10 minute timeout
      }));
    }
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Client-Id, X-MCP-Capabilities'
    },
    body: stream,
    isBase64Encoded: false
  };
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