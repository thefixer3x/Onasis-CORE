// Shared utilities for Intelligence API Edge Functions
// Memory-as-a-Service Intelligence Layer

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Types
export interface IntelligenceRequest {
  user_id: string;
  [key: string]: unknown;
}

export interface IntelligenceResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  usage?: {
    tokens_used: number;
    cost_usd: number;
    cached: boolean;
  };
  tier_info?: {
    tier: string;
    usage_remaining: number;
  };
}

export interface AccessCheck {
  allowed: boolean;
  reason?: string;
  usage_remaining?: number;
  tier_name?: string;
}

// Environment
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

// Create Supabase client with service role
export function getSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// CORS headers for all responses
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Authenticate request and get user ID
// Supports: API keys, auth-gateway JWTs, and Supabase JWTs
export async function authenticateRequest(
  req: Request
): Promise<{ userId: string; authSource?: string } | { error: string; status: number }> {
  const authHeader = req.headers.get("Authorization");
  const apiKey = req.headers.get("X-API-Key");

  const supabase = getSupabaseClient();

  // Helper to check if token is an API key format
  // Supports: lano_* (primary), lms_* (mcp-core), pk_* (enterprise)
  const isApiKeyFormat = (token: string): boolean => {
    return /^(lano_|lms_|pk_)/.test(token);
  };

  // Helper to authenticate API key via database lookup
  const authenticateApiKey = async (key: string): Promise<{ userId: string } | null> => {
    const { data: keyData } = await supabase
      .from("api_keys")
      .select("user_id, is_active")
      .eq("key", key)
      .maybeSingle();

    if (keyData?.is_active) {
      return { userId: keyData.user_id };
    }
    return null;
  };

  // Helper to authenticate via auth-gateway introspection
  const authenticateViaAuthGateway = async (token: string): Promise<{ userId: string } | null> => {
    const authGatewayUrl = Deno.env.get("AUTH_GATEWAY_URL") || "https://auth.lanonasis.com";

    try {
      const response = await fetch(`${authGatewayUrl}/oauth/introspect`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `token=${encodeURIComponent(token)}`,
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (!data.active) return null;

      const userId = data.sub || data.user_id;
      if (userId) {
        console.log(`[auth] Auth-gateway validation successful: ${userId}`);
        return { userId };
      }
      return null;
    } catch (error) {
      console.log("[auth] Auth-gateway introspect failed:", error);
      return null;
    }
  };

  // Helper to authenticate via Supabase JWT
  const authenticateViaSupabase = async (token: string): Promise<{ userId: string } | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        console.log(`[auth] Supabase validation successful: ${user.id}`);
        return { userId: user.id };
      }
      return null;
    } catch (error) {
      console.log("[auth] Supabase validation failed:", error);
      return null;
    }
  };

  // Try Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");

    // 1. Check if it's an API key format
    if (isApiKeyFormat(token)) {
      const result = await authenticateApiKey(token);
      if (result) return { ...result, authSource: "api_key" };
    }

    // 2. Try auth-gateway introspection first (prevents bad_jwt errors)
    const authGatewayResult = await authenticateViaAuthGateway(token);
    if (authGatewayResult) return { ...authGatewayResult, authSource: "auth_gateway" };

    // 3. Fall back to Supabase JWT validation
    const supabaseResult = await authenticateViaSupabase(token);
    if (supabaseResult) return { ...supabaseResult, authSource: "supabase" };
  }

  // Try X-API-Key header
  if (apiKey && isApiKeyFormat(apiKey)) {
    const result = await authenticateApiKey(apiKey);
    if (result) return { ...result, authSource: "api_key" };
  }

  return { error: "Unauthorized", status: 401 };
}

// Check if user has access to intelligence tool
export async function checkIntelligenceAccess(
  userId: string,
  toolName: string
): Promise<AccessCheck> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("check_intelligence_access", {
    p_user_id: userId,
    p_tool_name: toolName,
  });

  if (error || !data || data.length === 0) {
    return {
      allowed: false,
      reason: "Could not verify subscription status",
    };
  }

  const result = data[0];
  return {
    allowed: result.allowed,
    reason: result.reason,
    usage_remaining: result.usage_remaining,
  };
}

// Get user tier info
export async function getUserTierInfo(userId: string) {
  const supabase = getSupabaseClient();

  const { data } = await supabase.rpc("get_user_tier_info", {
    p_user_id: userId,
  });

  if (data && data.length > 0) {
    return data[0];
  }

  return null;
}

// Log usage and increment counter
export async function logUsage(
  userId: string,
  toolName: string,
  tokensUsed: number,
  costUsd: number,
  responseTimeMs: number,
  cacheHit: boolean,
  success: boolean,
  errorMessage?: string
) {
  const supabase = getSupabaseClient();

  await supabase.rpc("log_intelligence_usage", {
    p_user_id: userId,
    p_tool_name: toolName,
    p_tokens_used: tokensUsed,
    p_cost_usd: costUsd,
    p_response_time_ms: responseTimeMs,
    p_cache_hit: cacheHit,
    p_success: success,
    p_error_message: errorMessage,
  });
}

// Generate cache key
export function generateCacheKey(
  userId: string,
  toolName: string,
  params: Record<string, unknown>
): string {
  const paramStr = JSON.stringify(params, Object.keys(params).sort());
  return `${userId}:${toolName}:${btoa(paramStr).slice(0, 64)}`;
}

// Check cache
export async function checkCache(
  cacheKey: string
): Promise<{ hit: boolean; data?: unknown }> {
  const supabase = getSupabaseClient();

  const { data } = await supabase
    .from("intelligence_cache")
    .select("result, hit_count")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (data) {
    // Increment hit count
    await supabase
      .from("intelligence_cache")
      .update({ hit_count: (data.hit_count || 0) + 1 })
      .eq("cache_key", cacheKey);

    return { hit: true, data: data.result };
  }

  return { hit: false };
}

// Set cache
export async function setCache(
  cacheKey: string,
  toolName: string,
  userId: string,
  result: unknown,
  tokensSaved: number = 0,
  ttlHours: number = 24
) {
  const supabase = getSupabaseClient();

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);

  await supabase.from("intelligence_cache").upsert({
    cache_key: cacheKey,
    tool_name: toolName,
    user_id: userId,
    result,
    tokens_saved: tokensSaved,
    expires_at: expiresAt.toISOString(),
    hit_count: 0,
  });
}

// OpenAI chat completion
export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  model: string = "gpt-4o-mini"
): Promise<{ content: string; tokensUsed: number; cost: number }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI API error");
  }

  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  // GPT-4o-mini pricing (as of Dec 2024)
  const cost = inputTokens * 0.00000015 + outputTokens * 0.0000006;

  return {
    content: data.choices[0]?.message?.content || "",
    tokensUsed: inputTokens + outputTokens,
    cost,
  };
}

// OpenAI embedding
export async function generateEmbedding(
  text: string
): Promise<{ embedding: number[]; cost: number }> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI embedding API error");
  }

  const tokensUsed = data.usage?.total_tokens || 0;
  // text-embedding-3-small pricing
  const cost = tokensUsed * 0.00000002;

  return {
    embedding: data.data[0].embedding,
    cost,
  };
}

// Cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Standard error response
export function errorResponse(
  message: string,
  status: number = 400
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// Standard success response
export function successResponse(
  data: unknown,
  usage?: { tokens_used: number; cost_usd: number; cached: boolean },
  tierInfo?: { tier: string; usage_remaining: number }
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      usage,
      tier_info: tierInfo,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// Premium upgrade required response
export function premiumRequiredResponse(
  reason: string,
  currentTier?: string
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Premium feature",
      reason,
      current_tier: currentTier,
      upgrade_url: "https://app.lanonasis.com/upgrade",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
