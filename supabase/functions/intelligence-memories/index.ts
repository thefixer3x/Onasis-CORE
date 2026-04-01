/// <reference lib="deno.ns" />
// Intelligence API: Memories
// Context-aware memory query route for the Memory Intelligence SDK
// GET|POST /intelligence/memories

import {
  applyIntelligenceMemoryContext,
  authenticateRequest,
  corsHeaders,
  errorResponse,
  getSupabaseClient,
  resolveIntelligenceQueryContext,
  successResponse,
} from "../_shared/utils.ts";

interface IntelligenceMemoriesRequest {
  user_id?: string;
  userId?: string;
  type?: string;
  memory_type?: string;
  memory_types?: string[] | string;
  organization_id?: string;
  organizationId?: string;
  topic_id?: string;
  topicId?: string;
  query_scope?: "personal" | "team" | "organization" | "hybrid";
  queryScope?: "personal" | "team" | "organization" | "hybrid";
  limit?: number;
  offset?: number;
  sort_by?: "created_at" | "updated_at" | "title" | "last_accessed";
  sortBy?: "created_at" | "updated_at" | "title" | "last_accessed";
  sort_order?: "asc" | "desc";
  sortOrder?: "asc" | "desc";
}

function toStringArray(
  value: string[] | string | null | undefined,
): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map((item) => item.trim()).filter(Boolean);
    return values.length > 0 ? values : undefined;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const values = value.split(",").map((item) => item.trim()).filter(Boolean);
    return values.length > 0 ? values : undefined;
  }

  return undefined;
}

function parseRequest(
  req: Request,
): Promise<IntelligenceMemoriesRequest> | IntelligenceMemoriesRequest {
  if (req.method === "POST") {
    return req.json().catch(() => ({} as IntelligenceMemoriesRequest));
  }

  const url = new URL(req.url);
  const memoryTypes = url.searchParams.getAll("memory_types");

  return {
    user_id: url.searchParams.get("user_id") || undefined,
    type: url.searchParams.get("type") || undefined,
    memory_type: url.searchParams.get("memory_type") || undefined,
    memory_types: memoryTypes.length > 0
      ? memoryTypes
      : url.searchParams.get("memory_types") || undefined,
    organization_id: url.searchParams.get("organization_id") || undefined,
    topic_id: url.searchParams.get("topic_id") || undefined,
    query_scope: (url.searchParams.get(
      "query_scope",
    ) as IntelligenceMemoriesRequest["query_scope"]) || undefined,
    limit: url.searchParams.get("limit")
      ? Number.parseInt(url.searchParams.get("limit") || "100", 10)
      : undefined,
    offset: url.searchParams.get("offset")
      ? Number.parseInt(url.searchParams.get("offset") || "0", 10)
      : undefined,
    sort_by: (url.searchParams.get(
      "sort_by",
    ) as IntelligenceMemoriesRequest["sort_by"]) || undefined,
    sort_order: (url.searchParams.get(
      "sort_order",
    ) as IntelligenceMemoriesRequest["sort_order"]) || undefined,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return errorResponse(auth.error, auth.status);
    }

    const body = await parseRequest(req);
    const requestedUserId = typeof body.userId === "string"
      ? body.userId
      : body.user_id;

    if (requestedUserId && requestedUserId !== auth.userId) {
      return errorResponse(
        "Cross-user intelligence queries are not allowed",
        403,
      );
    }

    const normalizedBody: Record<string, unknown> = {
      organization_id: body.organizationId || body.organization_id,
      topic_id: body.topicId || body.topic_id,
      query_scope: body.queryScope || body.query_scope,
      memory_type: body.memory_type || body.type,
      memory_types: toStringArray(body.memory_types),
    };

    const context = resolveIntelligenceQueryContext(auth, normalizedBody);
    if ("error" in context) {
      return errorResponse(context.error, context.status);
    }

    const limit = Math.min(Math.max(body.limit || 100, 1), 200);
    const offset = Math.max(body.offset || 0, 0);
    const requestedSortBy = body.sortBy || body.sort_by || "updated_at";
    const sortBy =
      ["created_at", "updated_at", "title", "last_accessed"].includes(
          requestedSortBy,
        )
        ? requestedSortBy
        : "updated_at";
    const sortOrder = (body.sortOrder || body.sort_order) === "asc"
      ? "asc"
      : "desc";

    const supabase = getSupabaseClient();
    let query = supabase
      .from("memory_entries")
      .select(
        "id, title, content, type, memory_type, tags, metadata, user_id, organization_id, topic_id, created_at, updated_at, last_accessed, access_count",
        { count: "exact" },
      )
      .is("deleted_at", null);

    query = applyIntelligenceMemoryContext(query, auth, context);
    query = query.order(sortBy, { ascending: sortOrder === "asc" });
    query = query.range(offset, offset + limit - 1);

    const { data: memories, error, count } = await query;
    if (error) {
      return errorResponse(`Failed to query memories: ${error.message}`, 500);
    }

    return successResponse({
      memories: memories || [],
      total_memories: count || 0,
      limit,
      offset,
      has_more: typeof count === "number" ? offset + limit < count : false,
      query_scope: context.query_scope || "personal",
      organization_id: context.organization_id || auth.organizationId,
      topic_id: context.topic_id || null,
      memory_types: context.memory_types || [],
    });
  } catch (error) {
    console.error("Intelligence memories error:", error);
    return errorResponse("Internal server error", 500);
  }
});
