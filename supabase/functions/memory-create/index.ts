/**
 * Memory Create Edge Function
 * POST /functions/v1/memory-create
 *
 * Creates a new memory entry with automatic embedding generation
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, createSupabaseClient } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

type MemoryType = 'context' | 'project' | 'knowledge' | 'reference' | 'personal' | 'workflow';

interface CreateMemoryRequest {
  title: string;
  content: string;
  memory_type: MemoryType;
  tags?: string[];
  metadata?: Record<string, unknown>;
  topic_id?: string;
}

const VALID_MEMORY_TYPES: MemoryType[] = [
  'context',
  'project',
  'knowledge',
  'reference',
  'personal',
  'workflow',
];

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate
    const auth = await authenticate(req);
    if (!auth) {
      const response = createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required. Provide a valid API key or Bearer token.',
        401
      );
      return new Response(response.body, {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Only allow POST
    if (req.method !== 'POST') {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Method not allowed. Use POST.',
        405
      );
      return new Response(response.body, {
        status: 405,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body: CreateMemoryRequest = await req.json();

    // Validate required fields
    const errors: string[] = [];
    if (!body.title || body.title.trim().length === 0) {
      errors.push('title is required');
    }
    if (!body.content || body.content.trim().length === 0) {
      errors.push('content is required');
    }
    if (!body.memory_type) {
      errors.push('memory_type is required');
    } else if (!VALID_MEMORY_TYPES.includes(body.memory_type)) {
      errors.push(
        `memory_type must be one of: ${VALID_MEMORY_TYPES.join(', ')}`
      );
    }

    if (errors.length > 0) {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        400,
        errors
      );
      return new Response(response.body, {
        status: 400,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Generate embedding via OpenAI
    let embedding: number[] | null = null;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    if (openaiKey) {
      try {
        const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-ada-002',
            input: `${body.title}\n\n${body.content}`,
          }),
        });

        if (embeddingRes.ok) {
          const embeddingData = await embeddingRes.json();
          embedding = embeddingData.data[0].embedding;
        } else {
          console.warn('Failed to generate embedding, continuing without it');
        }
      } catch (embeddingError) {
        console.warn('Embedding generation error:', embeddingError);
        // Continue without embedding
      }
    } else {
      console.warn('OPENAI_API_KEY not set, creating memory without embedding');
    }

    // Insert memory
    const supabase = createSupabaseClient();

    const insertData: Record<string, unknown> = {
      user_id: auth.user_id,
      organization_id: auth.organization_id,
      title: body.title.trim(),
      content: body.content.trim(),
      memory_type: body.memory_type,
      type: body.memory_type, // Also set legacy 'type' field
      tags: body.tags || [],
      metadata: body.metadata || {},
    };

    if (body.topic_id) {
      insertData.topic_id = body.topic_id;
    }

    if (embedding) {
      insertData.embedding = embedding;
    }

    const { data: memory, error } = await supabase
      .from('memory_entries')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      const response = createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        'Failed to create memory',
        500,
        error.message
      );
      return new Response(response.body, {
        status: 500,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Create audit log entry (fire and forget)
    supabase
      .from('audit_log')
      .insert({
        user_id: auth.user_id,
        organization_id: auth.organization_id,
        action: 'memory.created',
        resource_type: 'memory',
        resource_id: memory.id,
        metadata: {
          title: body.title,
          memory_type: body.memory_type,
          has_embedding: !!embedding,
        },
      })
      .then(() => {});

    // Return success response (exclude embedding from response for cleaner output)
    const { embedding: _embedding, ...memoryWithoutEmbedding } = memory;
    const responseBody = {
      data: memoryWithoutEmbedding,
      message: 'Memory created successfully',
      has_embedding: !!embedding,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 201,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in memory-create:', error);
    const response = createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
    return new Response(response.body, {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
