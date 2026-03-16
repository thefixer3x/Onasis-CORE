/**
 * Memory Update Edge Function
 * Updates an existing memory, regenerating embeddings if content changes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, createSupabaseClient } from "../_shared/auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createErrorResponse, ErrorCode } from "../_shared/errors.ts";
import { extractRequestContext, writeAudit } from "../_shared/audit.ts";
import { suggestTopicKey, isValidTopicKey, normalizeTopicKey } from "../_shared/topic-key.ts";

type MemoryType =
  | "context"
  | "project"
  | "knowledge"
  | "reference"
  | "personal"
  | "workflow";
type WriteIntent = "new" | "continue" | "auto";
type RevisionPolicy = "none" | "important_only" | "always";

interface UpdateMemoryRequest {
  id?: string;
  title?: string;
  content?: string;
  memory_type?: MemoryType;
  type?: MemoryType;
  tags?: string[];
  metadata?: Record<string, unknown>;
  topic_key?: string;
  continuity_key?: string;
  idempotency_key?: string;
  write_intent?: WriteIntent;
  create_revision?: boolean;
  revision_policy?: RevisionPolicy;
  change_reason?: string;
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
const VALID_REVISION_POLICIES: RevisionPolicy[] = ["none", "important_only", "always"];

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
  const reqCtx = extractRequestContext(req);

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
      writeAudit(createSupabaseClient(), {
        action: "memory.updated",
        resource_type: "memory",
        metadata: {
          reason: "authentication_required",
        },
        result: "denied",
        failure_reason: "authentication_required",
        route_source: "edge_function",
        actor_type: "anonymous",
        auth_source: "anonymous",
        ...reqCtx,
      });
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

    // Validate topic_key if provided
    const rawTopicKey = body.topic_key;
    if (rawTopicKey !== undefined && !isValidTopicKey(rawTopicKey)) {
      validationErrors.push(
        "topic_key must be a valid format (e.g., architecture/slug, decision/slug, session/YYYY-MM-DD/slug)",
      );
    }

    // Validate revision_policy if provided
    const requestedRevisionPolicy = body.revision_policy ?? "important_only";
    if (!VALID_REVISION_POLICIES.includes(requestedRevisionPolicy)) {
      validationErrors.push(
        `revision_policy must be one of: ${VALID_REVISION_POLICIES.join(", ")}`,
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
      !body.topic_key &&
      !body.continuity_key &&
      !body.idempotency_key &&
      body.write_intent === undefined
    ) {
      return createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "At least one field to update is required (title, content, memory_type/type, tags, metadata, topic_key, or write-control fields)",
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
        "id, title, content, memory_type, tags, topic_key, metadata, user_id, organization_id, revision_count",
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
      writeAudit(supabase, {
        user_id: auth.user_id,
        organization_id: auth.organization_id,
        action: "memory.updated",
        resource_type: "memory",
        resource_id: targetMemoryId,
        metadata: {
          owner_user_id: existing.user_id,
        },
        result: "denied",
        failure_reason: "not_owner",
        route_source: "edge_function",
        auth_source: auth.auth_source,
        actor_id: auth.user_id,
        actor_type: "user",
        api_key_id: auth.api_key_id,
        project_scope: auth.project_scope,
        ...reqCtx,
      });
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

    // Handle topic_key: use provided value or generate suggestion if title/memory_type changed
    if (body.topic_key !== undefined) {
      // Explicit topic_key provided
      const normalizedTopicKey = normalizeTopicKey(body.topic_key);
      if (normalizedTopicKey) {
        updateData.topic_key = normalizedTopicKey;
      }
    } else if (body.title || memoryType) {
      // Suggest topic key if title or memory_type changed
      const suggestedTopicKey = suggestTopicKey({
        memory_type: memoryType || existing.memory_type,
        title: body.title || existing.title,
        metadata: body.metadata,
      });
      if (suggestedTopicKey) {
        updateData.topic_key = suggestedTopicKey;
      }
    }

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

    // Determine if we should create a revision snapshot
    const createRevisionExplicit = body.create_revision ?? false;
    const revisionPolicy = requestedRevisionPolicy;
    const changeReason = body.change_reason?.trim() || null;
    const titleChanged = body.title !== undefined && body.title !== existing.title;
    const contentChanged = body.content !== undefined &&
      body.content !== existing.content;
    const isImportantChange = titleChanged || contentChanged;

    let shouldCreateRevision = false;
    switch (revisionPolicy) {
      case "always":
        shouldCreateRevision = true;
        break;
      case "important_only":
        shouldCreateRevision = isImportantChange;
        break;
      case "none":
      default:
        shouldCreateRevision = false;
    }
    // Override if explicitly requested
    if (createRevisionExplicit) {
      shouldCreateRevision = true;
    }

    // Prepare revision data if needed (will be created after successful update)
    const currentRevisionCount = (existing as any).revision_count || 0;
    const nextRevisionNumber = currentRevisionCount + 1;
    const revisionData = shouldCreateRevision
      ? {
          memory_id: targetMemoryId,
          organization_id: auth.organization_id,
          revision_number: nextRevisionNumber,
          title: existing.title,
          content: existing.content,
          tags: existing.tags || [],
          metadata: existing.metadata || {},
          changed_by: auth.user_id,
          change_reason: changeReason,
        }
      : null;

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
    let { data: updated, error: updateError } = await supabase
      .from("memory_entries")
      .update(updateData)
      .eq("id", targetMemoryId)
      .select(
        "id, title, content, memory_type, tags, topic_key, metadata, user_id, organization_id, revision_count, created_at, updated_at",
      )
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
      writeAudit(supabase, {
        user_id: auth.user_id,
        organization_id: auth.organization_id,
        action: "memory.updated",
        resource_type: "memory",
        resource_id: targetMemoryId,
        metadata: {
          fields_attempted: Object.keys(updateData).filter((k) =>
            k !== "updated_at"
          ),
        },
        result: "failure",
        failure_reason: "update_failed",
        route_source: "edge_function",
        auth_source: auth.auth_source,
        actor_id: auth.user_id,
        actor_type: "user",
        api_key_id: auth.api_key_id,
        project_scope: auth.project_scope,
        ...reqCtx,
      });
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

    // Create revision snapshot if policy required it
    let revisionCreated = false;
    if (revisionData) {
      const { error: revisionError } = await supabase
        .from("memory_revisions")
        .insert(revisionData);

      if (revisionError) {
        console.warn("Failed to create revision snapshot:", revisionError);
        // Don't fail the update if revision creation fails - log and continue
      } else {
        const {
          data: revisionCountUpdated,
          error: revisionCountError,
        } = await supabase
          .from("memory_entries")
          .update({ revision_count: nextRevisionNumber })
          .eq("id", targetMemoryId)
          .select(
            "id, title, content, memory_type, tags, topic_key, metadata, user_id, organization_id, revision_count, created_at, updated_at",
          )
          .single();

        if (revisionCountError) {
          console.warn(
            "Failed to persist revision_count after creating revision:",
            revisionCountError,
          );
          const { error: rollbackError } = await supabase
            .from("memory_revisions")
            .delete()
            .eq("memory_id", targetMemoryId)
            .eq("revision_number", nextRevisionNumber);

          if (rollbackError) {
            console.warn(
              "Failed to roll back revision after revision_count error:",
              rollbackError,
            );
          }
        } else {
          updated = revisionCountUpdated;
          revisionCreated = true;
          console.log(
            `Revision ${nextRevisionNumber} created for memory ${targetMemoryId}`,
          );
        }
      }
    }

    // Audit log (fire and forget)
    writeAudit(supabase, {
      user_id: auth.user_id,
      organization_id: auth.organization_id,
      action: 'memory.updated',
      resource_type: 'memory',
      resource_id: targetMemoryId,
      metadata: {
        fields_updated: Object.keys(updateData),
        embedding_regenerated: embeddingGenerated,
        routed_by: routedBy,
        revision_created: revisionCreated,
        revision_number: revisionCreated ? nextRevisionNumber : null,
      },
      result: 'success',
      route_source: 'edge_function',
      auth_source: auth.auth_source,
      actor_id: auth.user_id,
      actor_type: 'user',
      api_key_id: auth.api_key_id,
      project_scope: auth.project_scope,
      ...reqCtx,
    });

    return new Response(
      JSON.stringify({
        data: updated,
        message: "Memory updated successfully",
        embedding_regenerated: embeddingGenerated,
        revision_created: revisionCreated,
        revision_number: revisionCreated ? nextRevisionNumber : null,
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
