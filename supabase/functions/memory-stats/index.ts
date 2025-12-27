/**
 * Memory Stats Edge Function
 * Returns memory statistics for the authenticated user/organization
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication required. Provide a valid API key or Bearer token.',
        401
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL=https://<project-ref>.supabase.co
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
    );

    // Try to use the memory_stats RPC function if available
    const { data: rpcStats, error: rpcError } = await supabase.rpc('memory_stats', {
      org_id: auth.is_master ? null : auth.organization_id
    });

    if (!rpcError && rpcStats) {
      return new Response(JSON.stringify({
        data: rpcStats,
        organization_id: auth.organization_id,
        generated_at: new Date().toISOString()
      }), {
        status: 200,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    // Fallback: calculate stats manually if RPC not available
    console.log('RPC not available, calculating stats manually');

    // Build base query with org scope
    const baseFilter = auth.is_master ? {} : { organization_id: auth.organization_id };

    // Total count
    const { count: totalCount } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .match(baseFilter);

    // Count by type
    const memoryTypes = ['context', 'project', 'knowledge', 'reference', 'personal', 'workflow'];
    const byType: Record<string, number> = {};

    for (const type of memoryTypes) {
      const { count } = await supabase
        .from('memory_entries')
        .select('*', { count: 'exact', head: true })
        .match({ ...baseFilter, memory_type: type });
      byType[type] = count || 0;
    }

    // Recent activity (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();

    const { count: createdToday } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .match(baseFilter)
      .gte('created_at', yesterdayIso);

    const { count: updatedToday } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .match(baseFilter)
      .gte('updated_at', yesterdayIso)
      .neq('created_at', 'updated_at'); // Only count updates, not creates

    const { count: accessedToday } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .match(baseFilter)
      .gte('last_accessed', yesterdayIso);

    // Memories with embeddings
    const { count: withEmbeddings } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .match(baseFilter)
      .not('embedding', 'is', null);

    // Top tags (aggregate from all memories)
    const { data: tagsData } = await supabase
      .from('memory_entries')
      .select('tags')
      .match(baseFilter)
      .not('tags', 'is', null);

    const tagCounts: Record<string, number> = {};
    if (tagsData) {
      for (const row of tagsData) {
        if (Array.isArray(row.tags)) {
          for (const tag of row.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
      }
    }

    // Sort tags by count and take top 10
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    const stats = {
      total_memories: totalCount || 0,
      by_type: byType,
      with_embeddings: withEmbeddings || 0,
      without_embeddings: (totalCount || 0) - (withEmbeddings || 0),
      recent_activity: {
        created_last_24h: createdToday || 0,
        updated_last_24h: updatedToday || 0,
        accessed_last_24h: accessedToday || 0
      },
      top_tags: topTags,
      storage: {
        embedding_dimension: 1536,
        model: 'text-embedding-ada-002'
      }
    };

    return new Response(JSON.stringify({
      data: stats,
      organization_id: auth.organization_id,
      generated_at: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
