/**
 * Organization Info Edge Function
 * Returns organization details, plan limits, and usage
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

// Default limits by plan
const PLAN_LIMITS: Record<string, any> = {
  free: {
    max_memories: 100,
    max_api_calls_per_month: 1000,
    max_users: 1,
    storage_limit_mb: 50,
    features: ['basic_search', 'api_access'],
  },
  pro: {
    max_memories: 10000,
    max_api_calls_per_month: 50000,
    max_users: 5,
    storage_limit_mb: 1000,
    features: ['basic_search', 'api_access', 'vector_search', 'webhooks', 'priority_support'],
  },
  enterprise: {
    max_memories: -1, // Unlimited
    max_api_calls_per_month: -1,
    max_users: -1,
    storage_limit_mb: -1,
    features: ['basic_search', 'api_access', 'vector_search', 'webhooks', 'priority_support', 'sso', 'audit_logs', 'custom_integrations'],
  },
};

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use GET or POST.', 405);
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Get organization details
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', auth.organization_id)
      .single();

    if (orgError || !org) {
      // Return minimal info if org not found (might be personal account)
      return new Response(JSON.stringify({
        data: {
          id: auth.organization_id,
          name: 'Personal Account',
          plan: 'free',
          limits: PLAN_LIMITS.free,
          created_at: null,
        },
        usage: {
          memories: 0,
          api_calls_this_month: 0,
          storage_used_mb: 0,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
      });
    }

    const plan = org.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Get usage stats
    const { count: memoryCount } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', auth.organization_id);

    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', auth.organization_id);

    // Get API call count for this month (if tracking table exists)
    let apiCallsThisMonth = 0;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    try {
      const { count: callCount } = await supabase
        .from('api_usage')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', auth.organization_id)
        .gte('created_at', startOfMonth.toISOString());
      apiCallsThisMonth = callCount || 0;
    } catch {
      // api_usage table might not exist
    }

    // Calculate usage percentages
    const usage = {
      memories: {
        current: memoryCount || 0,
        limit: limits.max_memories,
        percentage: limits.max_memories > 0
          ? Math.round(((memoryCount || 0) / limits.max_memories) * 100)
          : 0,
      },
      users: {
        current: userCount || 0,
        limit: limits.max_users,
        percentage: limits.max_users > 0
          ? Math.round(((userCount || 0) / limits.max_users) * 100)
          : 0,
      },
      api_calls: {
        current: apiCallsThisMonth,
        limit: limits.max_api_calls_per_month,
        percentage: limits.max_api_calls_per_month > 0
          ? Math.round((apiCallsThisMonth / limits.max_api_calls_per_month) * 100)
          : 0,
      },
    };

    return new Response(JSON.stringify({
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: plan,
        limits: limits,
        features: limits.features,
        created_at: org.created_at,
        updated_at: org.updated_at,
      },
      usage: usage,
      billing: {
        plan: plan,
        status: org.billing_status || 'active',
        next_billing_date: org.next_billing_date,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
