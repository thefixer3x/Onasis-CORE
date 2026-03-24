/**
 * Embeddings Proxy Edge Function
 * POST /functions/v1/embeddings
 *
 * Proxies embedding requests to Voyage AI using server-side API key.
 * Returns OpenAI-compatible response format so clients can use
 * provider: "openai" + remote.baseUrl: "https://api.lanonasis.com/api/v1/"
 *
 * This powers the OpenClaw memorySearch file indexer and any client
 * that speaks the OpenAI embeddings contract.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate } from "../_shared/auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createErrorResponse, ErrorCode } from "../_shared/errors.ts";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-4";

// Models we allow proxying (prevent arbitrary model injection)
const ALLOWED_MODELS = new Set([
  "voyage-4",
  "voyage-3",
  "voyage-3-lite",
  "voyage-code-3",
  "voyage-finance-2",
  "voyage-law-2",
  "voyage-large-2-instruct",
]);

interface EmbeddingsRequest {
  input: string | string[];
  model?: string;
  encoding_format?: "float" | "base64";
}

interface VoyageEmbeddingItem {
  object: string;
  embedding: number[];
  index: number;
}

interface VoyageResponse {
  data: VoyageEmbeddingItem[];
  model: string;
  usage: { total_tokens: number };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = corsHeaders(req);

  // Only accept POST
  if (req.method !== "POST") {
    const response = createErrorResponse(
      ErrorCode.VALIDATION_ERROR,
      "Method not allowed. Use POST.",
      405,
    );
    return new Response(response.body, {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    // Authenticate
    const auth = await authenticate(req);
    if (!auth) {
      const response = createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        "Authentication required. Provide a valid API key or Bearer token.",
        401,
      );
      return new Response(response.body, {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    let body: EmbeddingsRequest;
    try {
      body = await req.json();
    } catch {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Invalid JSON body",
        400,
      );
      return new Response(response.body, {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Validate input
    if (!body.input) {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Missing required field: input",
        400,
      );
      return new Response(response.body, {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Normalize input to array
    const inputArray = Array.isArray(body.input) ? body.input : [body.input];

    if (inputArray.length === 0 || inputArray.some((s) => typeof s !== "string" || s.trim().length === 0)) {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Input must be a non-empty string or array of non-empty strings",
        400,
      );
      return new Response(response.body, {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Batch size guard — Voyage supports up to 128 inputs
    if (inputArray.length > 128) {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Maximum 128 inputs per request",
        400,
      );
      return new Response(response.body, {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Resolve model
    const requestedModel = body.model || DEFAULT_MODEL;
    const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

    // Get Voyage API key
    const voyageApiKey = Deno.env.get("VOYAGE_API_KEY");
    if (!voyageApiKey) {
      console.error("[embeddings] VOYAGE_API_KEY not configured");
      const response = createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        "Embedding service temporarily unavailable",
        503,
      );
      return new Response(response.body, {
        status: 503,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Proxy to Voyage AI
    const voyageBody = {
      input: inputArray,
      model,
      input_type: "document",
    };

    const voyageResponse = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${voyageApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(voyageBody),
    });

    if (!voyageResponse.ok) {
      const errorText = await voyageResponse.text();
      console.error(`[embeddings] Voyage API error ${voyageResponse.status}:`, errorText);

      // Map Voyage errors to appropriate HTTP codes
      const status = voyageResponse.status === 429 ? 429 : 502;
      const message = status === 429
        ? "Rate limit exceeded. Please retry after a brief wait."
        : "Embedding provider error";

      const response = createErrorResponse(
        status === 429 ? ErrorCode.RATE_LIMIT_EXCEEDED : ErrorCode.EMBEDDING_ERROR,
        message,
        status,
      );
      return new Response(response.body, {
        status,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const voyageData: VoyageResponse = await voyageResponse.json();

    // Transform to OpenAI-compatible response format
    const openaiResponse = {
      object: "list",
      data: voyageData.data.map((item, idx) => ({
        object: "embedding",
        embedding: item.embedding,
        index: item.index ?? idx,
      })),
      model: voyageData.model || model,
      usage: {
        prompt_tokens: voyageData.usage?.total_tokens ?? 0,
        total_tokens: voyageData.usage?.total_tokens ?? 0,
      },
    };

    return new Response(JSON.stringify(openaiResponse), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[embeddings] Unexpected error:", error);
    const response = createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Internal server error",
      500,
    );
    return new Response(response.body, {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
