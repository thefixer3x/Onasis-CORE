/**
 * Netlify Function for MCP Message Handling
 * Companion endpoint to SSE for processing MCP commands
 * Deployed at: https://mcp.lanonasis.com/message
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function createEmbedding(input) {
  // Avoid a hard dependency on the `openai` npm package in Netlify Functions.
  // Netlify will fail to load the function if the package is missing.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input
    })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI embeddings failed: HTTP ${resp.status} ${txt}`);
  }

  const json = await resp.json();
  const embedding = json?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('OpenAI embeddings response missing embedding vector');
  }
  return embedding;
}

/**
 * Handle MCP tool calls
 */
async function handleToolCall(tool, params, context) {
  switch (tool) {
    case 'memory_create':
      return await createMemory(params, context);
    
    case 'memory_search':
      return await searchMemory(params, context);
    
    case 'memory_list':
      return await listMemory(params, context);
    
    case 'api_key_create':
      return await createApiKey(params, context);
    
    case 'list_tools':
      return listTools();
    
    case 'get_status':
      return getStatus(context);
    
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

/**
 * Create memory with vector embedding
 * Backward compatible: accepts both 'type' and 'memory_type', normalizes to memory_type
 */
async function createMemory(params, context) {
  const { title, content, tags = [] } = params;
  // Backward compatibility: accept both 'type' and 'memory_type', prefer memory_type
  const memory_type = params.memory_type || params.type || 'context';

  // Generate embedding
  const embedding = await createEmbedding(`${title} ${content}`);

  // Insert into public.memory_entries (fixed: was maas.memory_entries - empty table)
  const { data, error } = await supabase
    .from('memory_entries')
    .insert({
      organization_id: context.organizationId,
      user_id: context.userId || null,
      title,
      content,
      memory_type,  // Use normalized field
      type: memory_type,  // Also set legacy field for compatibility
      tags,
      embedding
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    title: data.title,
    content: data.content,
    memory_type: data.memory_type,  // Return canonical field
    type: data.memory_type,  // Also return legacy field for backward compatibility
    tags: data.tags,
    created_at: data.created_at
  };
}

/**
 * Search memories using vector similarity
 * Backward compatible: accepts both 'type' and 'memory_type'
 */
async function searchMemory(params, context) {
  const { query, limit = 10, threshold = 0.7, tags } = params;
  // Backward compatibility: accept both 'type' and 'memory_type'
  const memory_type = params.memory_type || params.type;
  
  // Generate query embedding
  const queryEmbedding = await createEmbedding(query);
  
  // Search using match_memories function
  const { data, error } = await supabase.rpc('match_memories', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    p_organization_id: context.organizationId
  });
  
  if (error) throw error;
  
  return {
    results: data || [],
    total: data?.length || 0,
    query
  };
}

/**
 * List memories with pagination
 * Backward compatible: accepts both 'type' and 'memory_type'
 */
async function listMemory(params, context) {
  const { limit = 20, offset = 0, tags } = params;
  // Backward compatibility: accept both 'type' and 'memory_type'
  const memory_type = params.memory_type || params.type;

  let query = supabase
    .from('memory_entries')
    .select('*', { count: 'exact' })
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (memory_type) {
    query = query.eq('memory_type', memory_type);
  }
  
  if (tags && tags.length > 0) {
    query = query.contains('tags', tags);
  }
  
  const { data, error, count } = await query;
  
  if (error) throw error;
  
  return {
    memories: data || [],
    total: count || 0,
    limit,
    offset
  };
}

/**
 * Create API key
 */
async function createApiKey(params, context) {
  const { name, type = 'live', environment = 'production' } = params;
  
  // Generate API key using vendor function
  const { data, error } = await supabase.rpc('generate_vendor_api_key', {
    p_vendor_org_id: context.vendorOrgId,
    p_key_name: name,
    p_key_type: type,
    p_environment: environment
  });
  
  if (error) throw error;
  
  return {
    key_id: data[0].key_id,
    key_secret: data[0].key_secret,
    name,
    type,
    environment,
    created_at: new Date().toISOString()
  };
}

/**
 * List available tools
 */
function listTools() {
  return [
    {
      name: 'memory_create',
      description: 'Create a new memory entry with vector embedding',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['context', 'project', 'knowledge', 'reference', 'personal', 'workflow']
          },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'content']
      }
    },
    {
      name: 'memory_search',
      description: 'Search memories using semantic vector search',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 },
          threshold: { type: 'number', default: 0.7 },
          type: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['query']
      }
    },
    {
      name: 'memory_list',
      description: 'List memories with pagination and filters',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
          offset: { type: 'number', default: 0 },
          type: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'api_key_create',
      description: 'Create a new API key',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['test', 'live', 'restricted', 'admin'] },
          environment: { type: 'string', enum: ['development', 'staging', 'production'] }
        },
        required: ['name']
      }
    },
    {
      name: 'list_tools',
      description: 'List all available MCP tools',
      inputSchema: {}
    },
    {
      name: 'get_status',
      description: 'Get MCP server status',
      inputSchema: {}
    }
  ];
}

/**
 * Get server status
 */
function getStatus(context) {
  return {
    status: 'online',
    endpoint: 'mcp.lanonasis.com',
    organizationId: context.organizationId,
    vendorCode: context.vendorCode,
    timestamp: new Date().toISOString(),
    capabilities: [
      'memory_create',
      'memory_search', 
      'memory_list',
      'api_key_create',
      'list_tools',
      'get_status'
    ]
  };
}

/**
 * Main handler
 */
export default async function handler(event) {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Connection-Id',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only handle POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { connectionId, message } = body;

    if (!connectionId || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing connectionId or message' })
      };
    }

    // Extract context from connection (in production, validate from store)
    const context = {
      connectionId,
      organizationId: 'ADMIN_ORG', // TODO: Get from connection store
      vendorOrgId: 'uuid-here',    // TODO: Get from connection store
      vendorCode: 'ADMIN_ORG',     // TODO: Get from connection store
      userId: null                 // TODO: Get from auth
    };

    // Handle message based on type
    if (message.type === 'request' && message.method) {
      const result = await handleToolCall(message.method, message.params || {}, context);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          id: message.id,
          type: 'response',
          result,
          timestamp: new Date().toISOString()
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('MCP message error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: {
          code: -32603,
          message: error.message
        }
      })
    };
  }
}
