/**
 * System Health Edge Function
 * GET /functions/v1/system-health
 *
 * Returns health status of the Supabase REST API
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  environment: string;
  components: {
    database: 'healthy' | 'unhealthy';
    edge_functions: 'healthy' | 'unhealthy';
    vector_search: 'available' | 'unavailable';
    openai: 'available' | 'unavailable' | 'not_configured';
  };
  metrics: {
    response_time_ms: number;
    memory_count?: number;
  };
  capabilities: string[];
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();

  try {
    const supabase = createSupabaseClient();

    // Test database connection
    const { count, error: dbError } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true });

    const dbHealthy = !dbError;

    // Check memory count
    let memoryCount: number | undefined;
    if (dbHealthy) {
      const { count: memCount } = await supabase
        .from('memory_entries')
        .select('id', { count: 'exact', head: true });
      memoryCount = memCount ?? undefined;
    }

    // Check vector search availability (function exists)
    let vectorAvailable = false;
    if (dbHealthy) {
      try {
        const { error: vecError } = await supabase.rpc('search_memories', {
          query_embedding: Array(1536).fill(0),
          match_threshold: 0.99,
          match_count: 1,
        });
        vectorAvailable = !vecError;
      } catch {
        vectorAvailable = false;
      }
    }

    // Check OpenAI configuration
    const openaiConfigured = !!Deno.env.get('OPENAI_API_KEY');

    const responseTime = Date.now() - startTime;
    const overallStatus = dbHealthy ? 'ok' : 'unhealthy';

    const health: HealthStatus = {
      status: overallStatus,
      service: 'Lanonasis MaaS API (Supabase Edge)',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      environment: Deno.env.get('ENVIRONMENT') || 'production',
      components: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        edge_functions: 'healthy',
        vector_search: vectorAvailable ? 'available' : 'unavailable',
        openai: openaiConfigured ? 'available' : 'not_configured',
      },
      metrics: {
        response_time_ms: responseTime,
        memory_count: memoryCount,
      },
      capabilities: [
        'memory_crud',
        'semantic_search',
        'api_key_auth',
        'jwt_auth',
        'multi_tenant',
        'vector_embeddings',
        'audit_logging',
      ],
    };

    return new Response(JSON.stringify(health), {
      status: overallStatus === 'ok' ? 200 : 503,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Health check error:', error);

    const health: HealthStatus = {
      status: 'unhealthy',
      service: 'Lanonasis MaaS API (Supabase Edge)',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      environment: Deno.env.get('ENVIRONMENT') || 'production',
      components: {
        database: 'unhealthy',
        edge_functions: 'healthy',
        vector_search: 'unavailable',
        openai: 'unavailable',
      },
      metrics: {
        response_time_ms: Date.now() - startTime,
      },
      capabilities: [],
    };

    return new Response(JSON.stringify(health), {
      status: 503,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
