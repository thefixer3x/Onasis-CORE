/**
 * Netlify Function for MCP Message Handling
 * Companion endpoint to SSE for processing MCP commands
 * Deployed at: https://mcp.lanonasis.com/message
 */

import { createClient } from '@supabase/supabase-js';
import { Configuration, OpenAIApi } from 'openai';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize OpenAI for embeddings
const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY
}));

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
 */
async function createMemory(params, context) {
  const { title, content, type = 'context', tags = [] } = params;
  
  // Generate embedding
  const embeddingResponse = await openai.createEmbedding({
    model: 'text-embedding-ada-002',
    input: `${title} ${content}`
  });
  
  const embedding = embeddingResponse.data.data[0].embedding;
  
  // Insert into maas.memory_entries
  const { data, error } = await supabase
    .from('maas.memory_entries')
    .insert({
      organization_id: context.organizationId,
      user_id: context.userId || null,
      title,
      content,
      type,
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
    type: data.type,
    tags: data.tags,
    created_at: data.created_at
  };
}

/**
 * Search memories using vector similarity
 */
async function searchMemory(params, context) {
  const { query, limit = 10, threshold = 0.7, type, tags } = params;
  
  // Generate query embedding
  const embeddingResponse = await openai.createEmbedding({
    model: 'text-embedding-ada-002',
    input: query
  });
  
  const queryEmbedding = embeddingResponse.data.data[0].embedding;
  
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
 */
async function listMemory(params, context) {
  const { limit = 20, offset = 0, type, tags } = params;
  
  let query = supabase
    .from('maas.memory_entries')
    .select('*', { count: 'exact' })
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (type) {
    query = query.eq('type', type);
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