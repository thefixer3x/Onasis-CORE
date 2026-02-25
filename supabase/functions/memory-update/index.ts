/**
 * Memory Update Edge Function
 * Updates an existing memory, regenerating embeddings if content changes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
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

interface UpdateMemoryRequest {
  id?: string;
  title?: string;
  content?: string;
  memory_type?: MemoryType;
  type?: MemoryType;
  tags?: string[];
  metadata?: Record<string, unknown>;
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

function buildMetadata(
  existingMetadata: unknown,
  incomingMetadata: unknown,
  writeControl: {
    idempotency_key?: string;
    continuity_key?: string;
    write_intent: WriteIntent;
  },
  routedBy: "update" | "idempotency" | "continuity",
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

async function findMemoryIdByMetadataKey(
  supabase: any,
  auth: { user_id: string; organization_id: string; is_master?: boolean },
  key: "idempotency_key" | "continuity_key",
  value: string,
): Promise<string | null> {
  const query = supabase
    .from("memory_entries")
    .select("id")
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
  const first = Array.isArray(data) ? data[0] : null;
  return first && typeof first === "object" && "id" in first
    ? String((first as { id: string }).id)
    : null;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") {
    return createErrorResponse(
      ErrorCode.VALIDATION_ERROR,
      "Method not allowed. Use POST, PUT, or PATCH.",
      405,
    );
  }

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        "Authentication required. Provide a valid API key or Bearer token.",
        401,
      );
    }

    const body: UpdateMemoryRequest = await req.json();
    const memoryType = body.memory_type || body.type;
    const writeIntent = body.write_intent ?? "auto";
    const writeControl = {
      idempotency_key: body.idempotency_key?.trim(),
      continuity_key: body.continuity_key?.trim(),
      write_intent: writeIntent as WriteIntent,
    };

    const validationErrors: string[] = [];
    if (memoryType && !VALID_MEMORY_TYPES.includes(memoryType)) {
      validationErrors.push(
        `memory_type/type must be one of: ${VALID_MEMORY_TYPES.join(", ")}`,
      );
    }
    if (!VALID_WRITE_INTENTS.includes(writeIntent)) {
      validationErrors.push(
        `write_intent must be one of: ${VALID_WRITE_INTENTS.join(", ")}`,
      );
    }
    if (validationErrors.length > 0) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Validation failed",
        400,
        validationErrors,
      );
    }

    // Validate at least one field to update
    if (
      !body.title &&
      !body.content &&
      !memoryType &&
      !body.tags &&
      !body.metadata &&
      !body.continuity_key &&
      !body.idempotency_key &&
      body.write_intent === undefined
    ) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "At least one field to update is required (title, content, memory_type/type, tags, metadata, or write-control fields)",
        400,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let targetMemoryId: string | null = body.id?.trim() || null;
    let routedBy: "update" | "idempotency" | "continuity" = "update";

    if (!targetMemoryId) {
      if (writeControl.idempotency_key) {
        targetMemoryId = await findMemoryIdByMetadataKey(
          supabase,
          auth,
          "idempotency_key",
          writeControl.idempotency_key,
        );
        if (targetMemoryId) routedBy = "idempotency";
      }
      if (!targetMemoryId && writeControl.continuity_key) {
        targetMemoryId = await findMemoryIdByMetadataKey(
          supabase,
          auth,
          "continuity_key",
          writeControl.continuity_key,
        );
        if (targetMemoryId) routedBy = "continuity";
      }
    }

    if (!targetMemoryId) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Memory ID is required (or provide a valid idempotency_key/continuity_key)",
        400,
      );
    }

    // First, fetch the existing memory to check ownership and get current content
    const existingQuery = supabase
      .from("memory_entries")
      .select(
        "id, title, content, memory_type, tags, metadata, user_id, organization_id",
      )
      .eq("id", targetMemoryId);

    if (!auth.is_master) {
      existingQuery.eq("organization_id", auth.organization_id);
    }

    const { data: existing, error: fetchError } = await existingQuery.single();

    if (fetchError || !existing) {
      return createErrorResponse(
        ErrorCode.NOT_FOUND,
        `Memory with ID ${body.id} not found.`,
        404,
      );
    }

    // Check if user owns the memory (unless master key)
    if (!auth.is_master && existing.user_id !== auth.user_id) {
      return createErrorResponse(
        ErrorCode.AUTHORIZATION_ERROR,
        "You can only update your own memories",
        403,
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title) updateData.title = body.title;
    if (memoryType) {
      updateData.memory_type = memoryType;
      updateData.type = memoryType;
    }
    if (body.tags) updateData.tags = body.tags;

    const shouldUpdateMetadata = !!body.metadata ||
      !!writeControl.idempotency_key || !!writeControl.continuity_key ||
      body.write_intent !== undefined;
    if (shouldUpdateMetadata) {
      updateData.metadata = buildMetadata(
        existing.metadata,
        body.metadata,
        writeControl,
        routedBy,
      );
    }

    // If content changed, regenerate embedding via configured provider
    let embeddingGenerated = false;
    if (body.content && body.content !== existing.content) {
      updateData.content = body.content;

      const provider = getProvider();
      const providerConfig = PROVIDER_CONFIG[provider];
      const apiKey = getApiKey(provider);

      if (apiKey) {
        const textToEmbed = `${
          body.title || existing.title
        }\n\n${body.content}`;
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
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(embeddingBody),
        });

        if (embeddingRes.ok) {
          const embeddingData = await embeddingRes.json();
          // Store in provider-appropriate column
          if (provider === "voyage") {
            updateData.voyage_embedding = embeddingData.data[0].embedding;
          } else {
            updateData.embedding = embeddingData.data[0].embedding;
          }
          embeddingGenerated = true;
        } else {
          const errText = await embeddingRes.text();
          console.warn(
            `Failed to regenerate embedding via ${provider}:`,
            errText,
          );
        }
      } else {
        console.warn(
          `No API key for embedding provider: ${provider}, updating without embedding`,
        );
      }
    }

    // Perform update
    const { data: updated, error: updateError } = await supabase
      .from("memory_entries")
      .update(updateData)
      .eq("id", targetMemoryId)
      .select(
        "id, title, content, memory_type, tags, metadata, user_id, organization_id, created_at, updated_at",
      )
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
      return createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        `Failed to update memory: ${
          updateError.message || "Unknown database error"
        }`,
        500,
        {
          fields_attempted: Object.keys(updateData).filter((k) =>
            k !== "updated_at"
          ),
        },
      );
    }

    // Audit log (fire and forget)
    supabase.from("audit_log").insert({
      user_id: auth.user_id,
      action: "memory.updated",
      resource_type: "memory",
      resource_id: targetMemoryId,
      metadata: {
        fields_updated: Object.keys(updateData),
        embedding_regenerated: embeddingGenerated,
        routed_by: routedBy,
      },
    }).then(() => {});

    return new Response(
      JSON.stringify({
        data: updated,
        message: "Memory updated successfully",
        embedding_regenerated: embeddingGenerated,
        routed_by: routedBy,
      }),
      {
        status: 200,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      "Internal server error",
      500,
    );
  }
});
