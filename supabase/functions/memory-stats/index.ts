/**
 * Memory Stats Edge Function
 * Returns memory statistics for the authenticated user/organization
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createErrorResponse, ErrorCode } from "../_shared/errors.ts";

const MEMORY_TYPES = [
  "context",
  "project",
  "knowledge",
  "reference",
  "personal",
  "workflow",
] as const;
const MEMORY_ENTRY_FIELDS =
  "id, title, content, memory_type, tags, metadata, user_id, organization_id, created_at, updated_at, last_accessed, access_count";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function createByTypeCounts(): Record<string, number> {
  return MEMORY_TYPES.reduce<Record<string, number>>((accumulator, type) => {
    accumulator[type] = 0;
    return accumulator;
  }, {});
}

function normalizeByTypeCounts(value: unknown): Record<string, number> {
  const normalized = createByTypeCounts();
  if (!isRecord(value)) {
    return normalized;
  }

  for (const type of MEMORY_TYPES) {
    const count = value[type];
    normalized[type] = typeof count === "number" ? count : 0;
  }

  return normalized;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return createErrorResponse(
        ErrorCode.AUTHENTICATION_ERROR,
        "Authentication required. Provide a valid API key or Bearer token.",
        401,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Try to use the memory_stats RPC function if available.
    // The migration defines filter_organization_id/filter_user_id, so we align with that contract here.
    const { data: rpcStats, error: rpcError } = await supabase.rpc(
      "memory_stats",
      {
        filter_organization_id: auth.is_master ? null : auth.organization_id,
        filter_user_id: null,
      },
    );

    const baseFilter = auth.is_master
      ? {}
      : { organization_id: auth.organization_id };
    const encoder = new TextEncoder();
    const normalizedRpcStats = isRecord(rpcStats) ? rpcStats : null;

    let totalMemories = 0;
    let byType = createByTypeCounts();
    let withEmbeddingsFromRpc: number | undefined;
    let recent24hFromRpc: number | undefined;

    if (normalizedRpcStats) {
      totalMemories = typeof normalizedRpcStats.total_memories === "number"
        ? normalizedRpcStats.total_memories
        : typeof normalizedRpcStats.total === "number"
        ? normalizedRpcStats.total
        : 0;
      byType = normalizeByTypeCounts(
        normalizedRpcStats.memories_by_type ?? normalizedRpcStats.by_type,
      );
      withEmbeddingsFromRpc =
        typeof normalizedRpcStats.with_embeddings === "number"
          ? normalizedRpcStats.with_embeddings
          : typeof normalizedRpcStats.with_embedding === "number"
          ? normalizedRpcStats.with_embedding
          : undefined;
      recent24hFromRpc = typeof normalizedRpcStats.recent_24h === "number"
        ? normalizedRpcStats.recent_24h
        : undefined;
    } else {
      console.log("RPC not available, calculating stats manually", rpcError);

      const { count: totalCount, error: totalCountError } = await supabase
        .from("memory_entries")
        .select("*", { count: "exact", head: true })
        .match(baseFilter);

      if (totalCountError) {
        console.error("Total count error:", totalCountError);
        return createErrorResponse(
          ErrorCode.DATABASE_ERROR,
          `Failed to calculate total memory count: ${
            totalCountError.message || "Unknown database error"
          }`,
          500,
        );
      }

      totalMemories = totalCount || 0;

      const typeCounts = await Promise.all(
        MEMORY_TYPES.map(async (type) => {
          const { count, error } = await supabase
            .from("memory_entries")
            .select("*", { count: "exact", head: true })
            .match({ ...baseFilter, memory_type: type });

          if (error) {
            throw error;
          }

          return [type, count || 0] as const;
        }),
      );

      for (const [type, count] of typeCounts) {
        byType[type] = count;
      }
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();

    const { count: createdToday } = await supabase
      .from("memory_entries")
      .select("*", { count: "exact", head: true })
      .match(baseFilter)
      .gte("created_at", yesterdayIso);

    const { count: updatedToday } = await supabase
      .from("memory_entries")
      .select("*", { count: "exact", head: true })
      .match(baseFilter)
      .gte("updated_at", yesterdayIso)
      .neq("created_at", "updated_at");

    const { count: accessedToday } = await supabase
      .from("memory_entries")
      .select("*", { count: "exact", head: true })
      .match(baseFilter)
      .gte("last_accessed", yesterdayIso);

    // Reuse the existing MaaS service approach for size/access metrics to keep behavior aligned.
    const { data: sizeStats, error: sizeError } = await supabase
      .from("memory_entries")
      .select("content, access_count")
      .match(baseFilter);

    if (sizeError) {
      console.error("Size stats error:", sizeError);
      return createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        `Failed to calculate memory size stats: ${
          sizeError.message || "Unknown database error"
        }`,
        500,
      );
    }

    const totalSizeBytes = sizeStats?.reduce((total, item) =>
      total + encoder.encode(String(item.content || "")).byteLength, 0) || 0;

    const avgAccessCount = sizeStats?.length
      ? sizeStats.reduce((total, item) =>
        total + Number(item.access_count || 0), 0) / sizeStats.length
      : 0;

    const { count: withOpenAI } = await supabase
      .from("memory_entries")
      .select("*", { count: "exact", head: true })
      .match(baseFilter)
      .not("embedding", "is", null);

    const { count: withVoyage } = await supabase
      .from("memory_entries")
      .select("*", { count: "exact", head: true })
      .match(baseFilter)
      .not("voyage_embedding", "is", null);

    const withEmbeddings = typeof withEmbeddingsFromRpc === "number"
      ? withEmbeddingsFromRpc
      : Math.max(withOpenAI || 0, withVoyage || 0);

    const { data: mostAccessed, error: mostAccessedError } = await supabase
      .from("memory_entries")
      .select(MEMORY_ENTRY_FIELDS)
      .match(baseFilter)
      .order("access_count", { ascending: false })
      .order("last_accessed", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (mostAccessedError) {
      console.error("Most accessed memory error:", mostAccessedError);
      return createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch most accessed memory: ${
          mostAccessedError.message || "Unknown database error"
        }`,
        500,
      );
    }

    const { data: recentMemories, error: recentMemoriesError } = await supabase
      .from("memory_entries")
      .select(MEMORY_ENTRY_FIELDS)
      .match(baseFilter)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentMemoriesError) {
      console.error("Recent memories error:", recentMemoriesError);
      return createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch recent memories: ${
          recentMemoriesError.message || "Unknown database error"
        }`,
        500,
      );
    }

    const { data: tagsData } = await supabase
      .from("memory_entries")
      .select("tags")
      .match(baseFilter)
      .not("tags", "is", null);

    const tagCounts: Record<string, number> = {};
    if (tagsData) {
      for (const row of tagsData) {
        if (Array.isArray(row.tags)) {
          for (const tag of row.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
      }
    }

    const topTags = Object.entries(tagCounts)
      .sort((a, b) =>
        b[1] - a[1]
      )
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    const stats = {
      total: totalMemories,
      total_memories: totalMemories,
      by_type: byType,
      memories_by_type: byType,
      total_size_bytes: totalSizeBytes,
      avg_access_count: Math.round(avgAccessCount * 100) / 100,
      most_accessed_memory: mostAccessed || undefined,
      recent_memories: recentMemories || [],
      with_embeddings: withEmbeddings || 0,
      without_embeddings: Math.max(totalMemories - (withEmbeddings || 0), 0),
      recent_activity: {
        created_last_24h: (recent24hFromRpc ?? createdToday) || 0,
        updated_last_24h: updatedToday || 0,
        accessed_last_24h: accessedToday || 0,
      },
      top_tags: topTags,
      storage: {
        embedding_provider:
          Deno.env.get("EMBEDDING_PROVIDER")?.toLowerCase() === "voyage"
            ? "voyage"
            : "openai",
        embedding_dimension:
          Deno.env.get("EMBEDDING_PROVIDER")?.toLowerCase() === "voyage"
            ? 1024
            : 1536,
        model: Deno.env.get("EMBEDDING_PROVIDER")?.toLowerCase() === "voyage"
          ? (Deno.env.get("VOYAGE_MODEL") || "voyage-4")
          : "text-embedding-3-small",
        openai_embeddings: withOpenAI || 0,
        voyage_embeddings: withVoyage || 0,
      },
    };

    return new Response(
      JSON.stringify({
        data: stats,
        organization_id: auth.organization_id,
        generated_at: new Date().toISOString(),
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
