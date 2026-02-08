/**
 * Project Create Edge Function
 * Creates a new project within an organization
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

interface CreateProjectRequest {
  name: string;
  description?: string;
  organization_id?: string; // Optional - defaults to user's org
  settings?: Record<string, any>;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Method not allowed. Use POST.', 405);
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

    const body: CreateProjectRequest = await req.json();

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'name is required', 400);
    }

    if (body.name.length > 100) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'name must be 100 characters or less', 400);
    }

    // Use provided org_id or default to user's org
    const orgId = body.organization_id || auth.organization_id;

    // Only master keys can create projects in other orgs
    if (body.organization_id && body.organization_id !== auth.organization_id && !auth.is_master) {
      return createErrorResponse(
        ErrorCode.AUTHORIZATION_ERROR,
        'Cannot create projects in other organizations',
        403
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check for duplicate name in org (via metadata->organization_id)
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('metadata->>organization_id', orgId)
      .eq('name', body.name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'A project with this name already exists in your organization',
        400
      );
    }

    // Create project - using actual columns from control_room.projects facade view
    const projectData: Record<string, unknown> = {
      name: body.name.trim(),
      description: body.description?.trim() || null,
      type: 'memory',
      status: 'active',
      metadata: {
        organization_id: orgId,
        created_by: auth.user_id,
        ...(body.settings || {}),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: project, error } = await supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      // Check if projects table exists
      if (error.code === '42P01') {
        return createErrorResponse(
          ErrorCode.DATABASE_ERROR,
          'Projects feature not available. Please contact support.',
          500
        );
      }
      return createErrorResponse(ErrorCode.DATABASE_ERROR, `Failed to create project: ${error.message || 'Unknown database error'}`, 500);
    }

    // Audit log
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'project.created',
      resource_type: 'project',
      resource_id: project.id,
      metadata: {
        name: project.name,
        organization_id: orgId,
      }
    }).then(() => {});

    return new Response(JSON.stringify({
      data: project,
      message: 'Project created successfully',
    }), {
      status: 201,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
