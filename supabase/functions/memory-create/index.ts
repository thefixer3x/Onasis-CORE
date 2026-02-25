/**
 * Memory Create Edge Function
 * POST /functions/v1/memory-create
 *
 * Creates a new memory entry with automatic embedding generation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, createSupabaseClient } from "../_shared/auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createErrorResponse, ErrorCode } from "../_shared/errors.ts";

type MemoryType =
  | "context"
  | "project"
  | "knowledge"
  | "reference"
  | "personal"
  | "workflow";
type WriteIntent = "new" | "continue" | "auto";

interface CreateMemoryRequest {
  title: string;
  content: string;
  memory_type?: MemoryType; // Preferred field name
  type?: MemoryType; // Also accept 'type' for backwards compatibility
  tags?: string[];
  metadata?: Record<string, unknown>;
  topic_id?: string;
  continuity_key?: string;
  idempotency_key?: string;
  write_intent?: WriteIntent;
}

const VALID_MEMORY_TYPES: MemoryType[] = [
  "context",
  "project",
  "knowledge",
  "reference",
  "personal",
  "workflow",
];
const VALID_WRITE_INTENTS: WriteIntent[] = ["new", "continue", "auto"];

// Embedding provider configuration
type EmbeddingProvider = "openai" | "voyage";

const PROVIDER_CONFIG = {
  openai: {
    model: "text-embedding-3-small",
    url: "https://api.openai.com/v1/embeddings",
  },
  voyage: {
    model: "voyage-4",
    url: "https://api.voyageai.com/v1/embeddings",
  },
} as const;

function getProvider(): EmbeddingProvider {
  const provider = Deno.env.get("EMBEDDING_PROVIDER")?.toLowerCase();
  return provider === "voyage" ? "voyage" : "openai";
}

function getApiKey(provider: EmbeddingProvider): string | undefined {
  return provider === "voyage"
    ? Deno.env.get("VOYAGE_API_KEY")
    : Deno.env.get("OPENAI_API_KEY");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
}

function buildMetadata(
  existingMetadata: unknown,
  incomingMetadata: unknown,
  writeControl: {
    idempotency_key?: string;
    continuity_key?: string;
    write_intent: WriteIntent;
  },
  routedBy: "create" | "idempotency" | "continuity",
): Record<string, unknown> {
  const existing = asRecord(existingMetadata);
  const incoming = asRecord(incomingMetadata);
  const existingControl = asRecord(existing.write_control);
  const incomingControl = asRecord(incoming.write_control);
  const now = new Date().toISOString();

  return {
    ...existing,
    ...incoming,
    ...(writeControl.idempotency_key
      ? { idempotency_key: writeControl.idempotency_key }
      : {}),
    ...(writeControl.continuity_key
      ? { continuity_key: writeControl.continuity_key }
      : {}),
    write_intent: writeControl.write_intent,
    write_control: {
      ...existingControl,
      ...incomingControl,
      ...(writeControl.idempotency_key
        ? { idempotency_key: writeControl.idempotency_key }
        : {}),
      ...(writeControl.continuity_key
        ? { continuity_key: writeControl.continuity_key }
        : {}),
      write_intent: writeControl.write_intent,
      routed_by: routedBy,
      routed_at: now,
      source: "supabase-rest",
    },
  };
}

async function generateEmbedding(
  title: string,
  content: string,
): Promise<{ embedding: number[] | null; provider: EmbeddingProvider }> {
  const provider = getProvider();
  const providerConfig = PROVIDER_CONFIG[provider];
  const apiKey = getApiKey(provider);

  if (!apiKey) {
    console.warn(`No API key configured for embedding provider: ${provider}`);
    return { embedding: null, provider };
  }

  try {
    const textToEmbed = `${title}\n\n${content}`;
    const embeddingBody = provider === "voyage"
      ? {
        input: [textToEmbed],
        model: Deno.env.get("VOYAGE_MODEL") || providerConfig.model,
        input_type: "document",
      }
      : { model: providerConfig.model, input: textToEmbed };

    const embeddingRes = await fetch(providerConfig.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(embeddingBody),
    });

    if (!embeddingRes.ok) {
      const errText = await embeddingRes.text();
      console.warn(`Failed to generate embedding via ${provider}:`, errText);
      return { embedding: null, provider };
    }

    const embeddingData = await embeddingRes.json();
    return { embedding: embeddingData.data[0].embedding as number[], provider };
  } catch (embeddingError) {
    console.warn("Embedding generation error:", embeddingError);
    return { embedding: null, provider };
  }
}

async function findExistingByMetadataKey(
  supabase: any,
  auth: { user_id: string; organization_id: string; is_master?: boolean },
  key: "idempotency_key" | "continuity_key",
  value: string,
) {
  const query = supabase
    .from("memory_entries")
    .select(
      "id, title, content, memory_type, tags, metadata, user_id, organization_id, topic_id, created_at, updated_at",
    )
    .eq("user_id", auth.user_id)
    .eq(`metadata->>${key}`, value)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!auth.is_master) {
    query.eq("organization_id", auth.organization_id);
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`Failed metadata lookup for ${key}:`, error.message);
    return null;
  }

  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as Record<string, unknown>;
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message = typeof maybeError.message === "string"
    ? maybeError.message.toLowerCase()
    : "";
  return code === "23505" || message.includes("duplicate key");
}

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
        "Authentication required. Provide a valid API key or Bearer token.",
        401,
      );
      return new Response(response.body, {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Only allow POST
    if (req.method !== "POST") {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Method not allowed. Use POST.",
        405,
      );
      return new Response(response.body, {
        status: 405,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body: CreateMemoryRequest = await req.json();

    // Normalize field names: accept 'type' as alias for 'memory_type'
    const memoryType = body.memory_type || body.type;
    const writeIntent = body.write_intent ?? "auto";
    const writeControl = {
      idempotency_key: body.idempotency_key?.trim(),
      continuity_key: body.continuity_key?.trim(),
      write_intent: writeIntent as WriteIntent,
    };

    // Validate required fields
    const errors: string[] = [];
    if (!body.title || body.title.trim().length === 0) {
      errors.push("title is required");
    }
    if (!body.content || body.content.trim().length === 0) {
      errors.push("content is required");
    }
    if (!memoryType) {
      errors.push("memory_type (or type) is required");
    } else if (!VALID_MEMORY_TYPES.includes(memoryType)) {
      errors.push(
        `memory_type must be one of: ${VALID_MEMORY_TYPES.join(", ")}`,
      );
    }
    if (!VALID_WRITE_INTENTS.includes(writeIntent)) {
      errors.push(
        `write_intent must be one of: ${VALID_WRITE_INTENTS.join(", ")}`,
      );
    }

    if (errors.length > 0) {
      const response = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Validation failed",
        400,
        errors,
      );
      return new Response(response.body, {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Insert memory
    const supabase = createSupabaseClient();

    const shouldApplyIdempotency = !!writeControl.idempotency_key &&
      writeControl.write_intent !== "new";
    const shouldRouteContinuity = !!writeControl.continuity_key &&
      writeControl.write_intent !== "new";

    // Idempotency short-circuit: return existing memory for the same key.
    // NOTE: write_intent="new" explicitly bypasses idempotent reuse semantics.
    if (shouldApplyIdempotency && writeControl.idempotency_key) {
      const existing = await findExistingByMetadataKey(
        supabase,
        auth,
        "idempotency_key",
        writeControl.idempotency_key,
      );

      if (existing) {
        const responseBody = {
          data: existing,
          message: "Idempotency key matched existing memory",
          routed_by: "idempotency",
        };

        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Continuity route: update latest related memory instead of creating a new row.
    if (shouldRouteContinuity && writeControl.continuity_key) {
      // Optimistic concurrency loop to prevent dropped appends during
      // concurrent continuity writes.
      const MAX_CONTINUITY_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_CONTINUITY_RETRIES; attempt++) {
        const existing = await findExistingByMetadataKey(
          supabase,
          auth,
          "continuity_key",
          writeControl.continuity_key,
        );

        if (!existing) {
          break;
        }

        const existingContent = String(existing.content || "").trim();
        const incomingContent = body.content.trim();
        const mergedContent = existingContent.length > 0
          ? `${existingContent}\n\n---\n\n${incomingContent}`
          : incomingContent;
        const mergedTags = [
          ...new Set([
            ...normalizeTags(existing.tags),
            ...normalizeTags(body.tags),
          ]),
        ];
        const mergedMemoryType =
          (memoryType || existing.memory_type) as MemoryType;
        const mergedMetadata = buildMetadata(
          existing.metadata,
          body.metadata,
          writeControl,
          "continuity",
        );
        const title = body.title.trim() || String(existing.title || "").trim();

        const { embedding, provider } = await generateEmbedding(
          title,
          mergedContent,
        );
        const updateData: Record<string, unknown> = {
          title,
          content: mergedContent,
          memory_type: mergedMemoryType,
          type: mergedMemoryType,
          tags: mergedTags,
          metadata: mergedMetadata,
          updated_at: new Date().toISOString(),
        };

        if (body.topic_id) {
          updateData.topic_id = body.topic_id;
        }

        if (embedding) {
          if (provider === "voyage") {
            updateData.voyage_embedding = embedding;
          } else {
            updateData.embedding = embedding;
          }
        }

        const { data: updatedRows, error: updateError } = await supabase
          .from("memory_entries")
          .update(updateData)
          .eq("id", existing.id)
          .eq("updated_at", existing.updated_at)
          .select();

        if (updateError) {
          console.error("Continuity update error:", updateError);
          const response = createErrorResponse(
            ErrorCode.DATABASE_ERROR,
            "Failed to apply continuity update",
            500,
            updateError.message,
          );
          return new Response(response.body, {
            status: 500,
            headers: {
              ...corsHeaders(req),
              "Content-Type": "application/json",
            },
          });
        }

        const updated = Array.isArray(updatedRows) && updatedRows.length > 0
          ? updatedRows[0]
          : null;

        if (updated) {
          const { embedding: _embedding, ...memoryWithoutEmbedding } = updated;
          const responseBody = {
            data: memoryWithoutEmbedding,
            message: "Memory updated via continuity key",
            has_embedding: !!embedding,
            routed_by: "continuity",
          };

          return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: {
              ...corsHeaders(req),
              "Content-Type": "application/json",
            },
          });
        }

        if (attempt === MAX_CONTINUITY_RETRIES) {
          const response = createErrorResponse(
            ErrorCode.DATABASE_ERROR,
            "Continuity update conflict: please retry",
            409,
          );
          return new Response(response.body, {
            status: 409,
            headers: {
              ...corsHeaders(req),
              "Content-Type": "application/json",
            },
          });
        }
      }
    }

    const { embedding, provider } = await generateEmbedding(
      body.title.trim(),
      body.content.trim(),
    );
    const metadata = buildMetadata(
      undefined,
      body.metadata,
      writeControl,
      "create",
    );

    const insertData: Record<string, unknown> = {
      user_id: auth.user_id,
      organization_id: auth.organization_id,
      title: body.title.trim(),
      content: body.content.trim(),
      memory_type: memoryType,
      type: memoryType, // Also set legacy 'type' field
      tags: body.tags || [],
      metadata,
    };

    if (body.topic_id) {
      insertData.topic_id = body.topic_id;
    }

    if (embedding) {
      // Store in provider-appropriate column
      if (provider === "voyage") {
        insertData.voyage_embedding = embedding;
      } else {
        insertData.embedding = embedding;
      }
    }

    const { data: memory, error } = await supabase
      .from("memory_entries")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (
        shouldApplyIdempotency && writeControl.idempotency_key &&
        isUniqueViolation(error)
      ) {
        const existing = await findExistingByMetadataKey(
          supabase,
          auth,
          "idempotency_key",
          writeControl.idempotency_key,
        );
        if (existing) {
          const responseBody = {
            data: existing,
            message: "Idempotency key matched existing memory",
            routed_by: "idempotency",
          };

          return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: {
              ...corsHeaders(req),
              "Content-Type": "application/json",
            },
          });
        }
      }

      console.error("Insert error:", error);
      const response = createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        "Failed to create memory",
        500,
        error.message,
      );
      return new Response(response.body, {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Create audit log entry (fire and forget)
    supabase
      .from("audit_log")
      .insert({
        user_id: auth.user_id,
        organization_id: auth.organization_id,
        action: "memory.created",
        resource_type: "memory",
        resource_id: memory.id,
        metadata: {
          title: body.title,
          memory_type: memoryType,
          has_embedding: !!embedding,
        },
      })
      .then(() => {});

    // Return success response (exclude embedding from response for cleaner output)
    const { embedding: _embedding, ...memoryWithoutEmbedding } = memory;
    const responseBody = {
      data: memoryWithoutEmbedding,
      message: "Memory created successfully",
      has_embedding: !!embedding,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 201,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error in memory-create:", error);
    const response = createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Internal server error",
      500,
    );
    return new Response(response.body, {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
