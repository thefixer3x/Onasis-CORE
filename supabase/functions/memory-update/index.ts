/**
 * Memory Update Edge Function
 * Updates an existing memory, regenerating embeddings if content changes
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

interface UpdateMemoryRequest {
  id: string;
  title?: string;
  content?: string;
  memory_type?: 'context' | 'project' | 'knowledge' | 'reference' | 'personal' | 'workflow';
  tags?: string[];
  metadata?: Record<string, unknown>;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use POST, PUT, or PATCH.', 405);
  }

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required. Provide a valid API key or Bearer token.',
        401
      );
    }

    const body: UpdateMemoryRequest = await req.json();

    if (!body.id) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Memory ID is required', 400);
    }

    // Validate at least one field to update
    if (!body.title && !body.content && !body.memory_type && !body.tags && !body.metadata) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'At least one field to update is required (title, content, memory_type, tags, or metadata)',
        400
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    // First, fetch the existing memory to check ownership and get current content
    const existingQuery = supabase
      .from('memory_entries')
      .select('id, title, content, user_id, organization_id')
      .eq('id', body.id);

    if (!auth.is_master) {
      existingQuery.eq('organization_id', auth.organization_id);
    }

    const { data: existing, error: fetchError } = await existingQuery.single();

    if (fetchError || !existing) {
      return createErrorResponse(ErrorCode.NOT_FOUND, `Memory with ID ${body.id} not found.`, 404);
    }

    // Check if user owns the memory (unless master key)
    if (!auth.is_master && existing.user_id !== auth.user_id) {
      return createErrorResponse(ErrorCode.AUTHORIZATION_ERROR, 'You can only update your own memories', 403);
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (body.title) updateData.title = body.title;
    if (body.memory_type) updateData.memory_type = body.memory_type;
    if (body.tags) updateData.tags = body.tags;
    if (body.metadata) updateData.metadata = body.metadata;

    // If content changed, regenerate embedding
    let embeddingGenerated = false;
    if (body.content && body.content !== existing.content) {
      updateData.content = body.content;

      // Generate new embedding
      const textToEmbed = `${body.title || existing.title}\n\n${body.content}`;
      const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: textToEmbed
        })
      });

      if (embeddingRes.ok) {
        const embeddingData = await embeddingRes.json();
        updateData.embedding = embeddingData.data[0].embedding;
        embeddingGenerated = true;
      } else {
        console.warn('Failed to regenerate embedding, updating without it');
      }
    }

    // Perform update
    const { data: updated, error: updateError } = await supabase
      .from('memory_entries')
      .update(updateData)
      .eq('id', body.id)
      .select('id, title, content, memory_type, tags, metadata, user_id, organization_id, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to update memory', 500);
    }

    // Audit log (fire and forget)
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'memory.updated',
      resource_type: 'memory',
      resource_id: body.id,
      metadata: { fields_updated: Object.keys(updateData), embedding_regenerated: embeddingGenerated }
    }).then(() => {});

    return new Response(JSON.stringify({
      data: updated,
      message: 'Memory updated successfully',
      embedding_regenerated: embeddingGenerated
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
