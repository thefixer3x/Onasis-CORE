/**
 * API Key Create Edge Function
 * Creates a new API key for the authenticated user
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createErrorResponse, ErrorCode } from '../_shared/errors.ts';

interface CreateApiKeyRequest {
  name: string;
  access_level?: 'public' | 'authenticated' | 'team' | 'admin' | 'enterprise';
  expires_in_days?: number;
  scopes?: string[];
  description?: string;
  project_id?: string;
}

const VALID_ACCESS_LEVELS = ['public', 'authenticated', 'team', 'admin', 'enterprise'];
const VALID_SCOPES = new Set([
  'memories.read', 'memories.write', 'memories.*',
  'secrets.read', 'secrets.write', 'secrets.*',
  'mcp.read', 'mcp.write', 'mcp.*',
  'profile.read', 'profile.write', 'profile.*',
  'projects.read', 'projects.write', 'projects.*',
  'analytics.read', 'analytics.*',
  'admin.*', 'legacy.full_access', '*'
]);

/**
 * Generate a secure API key with lano_ prefix
 */
function generateSecureApiKey(): string {
  const prefix = 'lano_';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const randomHex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${randomHex}`;
}

/**
 * Hash an API key using SHA-256
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Normalize and validate scopes
 */
function normalizeScopes(scopes?: string[]): string[] {
  if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
    return ['legacy.full_access'];
  }

  const validPattern = /^[a-z_]+\.(read|write|\*)$/;
  return scopes.filter(scope => {
    const s = scope.trim().toLowerCase();
    return VALID_SCOPES.has(s) || validPattern.test(s);
  });
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

    const body: CreateApiKeyRequest = await req.json();

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'name is required', 400);
    }

    if (body.name.length > 100) {
      return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'name must be 100 characters or less', 400);
    }

    // Validate access level
    if (body.access_level && !VALID_ACCESS_LEVELS.includes(body.access_level)) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        `Invalid access_level. Allowed: ${VALID_ACCESS_LEVELS.join(', ')}`,
        400
      );
    }

    // Validate expires_in_days
    if (body.expires_in_days !== undefined) {
      const days = Number(body.expires_in_days);
      if (!Number.isInteger(days) || days <= 0 || days > 3650) {
        return createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          'expires_in_days must be a positive integer (max 3650)',
          400
        );
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check for duplicate name
    const { data: existing } = await supabase
      .from('api_keys')
      .select('id')
      .eq('user_id', auth.user_id)
      .eq('name', body.name.trim())
      .eq('is_active', true)
      .limit(1);

    if (existing && existing.length > 0) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'An active API key with this name already exists',
        400
      );
    }

    // Generate API key and hash
    const apiKey = generateSecureApiKey();
    const keyHash = await hashApiKey(apiKey);

    // Calculate expiration date
    let expiresAt: string | undefined;
    if (body.expires_in_days && body.expires_in_days > 0) {
      expiresAt = new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000).toISOString();
    }

    // Normalize scopes
    const permissions = normalizeScopes(body.scopes);

    // Insert API key - let Supabase auto-generate UUID for id
    // Note: The `key` column is NOT NULL in the schema (legacy requirement)
    // We store the key for backward compatibility, but authentication uses key_hash
    const apiKeyRecord: Record<string, unknown> = {
      name: body.name.trim(),
      key: apiKey,           // Required: plaintext key (legacy column, NOT NULL)
      key_hash: keyHash,     // For secure hash-based auth
      user_id: auth.user_id,
      access_level: body.access_level || 'authenticated',
      permissions,
      is_active: true,
    };

    // Only add expires_at if specified
    if (expiresAt) {
      apiKeyRecord.expires_at = expiresAt;
    }

    // Add optional fields
    if (body.description) {
      apiKeyRecord.description = body.description;
    }

    const { data: newKey, error } = await supabase
      .from('api_keys')
      .insert(apiKeyRecord)
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      return createErrorResponse(ErrorCode.DATABASE_ERROR, 'Failed to create API key', 500);
    }

    // Audit log (fire and forget)
    supabase.from('audit_log').insert({
      user_id: auth.user_id,
      action: 'api_key.created',
      resource_type: 'api_key',
      resource_id: newKey.id,
      metadata: {
        name: body.name,
        access_level: newKey.access_level,
        has_expiration: !!expiresAt,
      }
    }).then(() => {});

    return new Response(JSON.stringify({
      data: {
        id: newKey.id,
        name: newKey.name,
        key: apiKey, // Only returned on creation
        user_id: newKey.user_id,
        access_level: newKey.access_level,
        permissions: newKey.permissions,
        expires_at: newKey.expires_at,
        created_at: newKey.created_at,
        is_active: newKey.is_active,
      },
      message: 'API key created successfully. Save the key now - it will not be shown again.',
    }), {
      status: 201,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500);
  }
});
