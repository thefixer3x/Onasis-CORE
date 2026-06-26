// Intelligence API: Detect Duplicates
// Finds potential duplicate or very similar memories
// POST /intelligence/detect-duplicates
//
// Implementation note (2026-06-26):
//   Duplicate detection runs server-side via detect_duplicate_memories_voyage()
//   which uses the HNSW index on `voyage_embedding` (top-k nearest neighbors per
//   row). This replaced the previous approach that fetched every memory row WITH
//   its full vector serialized as text and compared all pairs in-function (O(n^2)).
//   Above ~500 rows that exceeded the Edge Function compute/memory limit
//   ("not enough compute resources"). The old code also read only the legacy
//   `embedding` (1536/OpenAI) column, which is mostly NULL post voyage-4 migration,
//   so it silently degraded to jaccard text matching. The text path below is now
//   only a capped fallback for datasets that have no voyage embeddings at all.

import {
  corsHeaders,
  authenticateRequest,
  checkIntelligenceAccess,
  getUserTierInfo,
  logUsage,
  generateCacheKey,
  checkCache,
  setCache,
  resolveIntelligenceQueryContext,
  extendCacheKeyParams,
  applyIntelligenceMemoryContext,
  getSupabaseClient,
  errorResponse,
  successResponse,
  premiumRequiredResponse,
} from "../_shared/utils.ts";

const TOOL_NAME = "detect_duplicates";

// Server-side candidate generation bounds. neighbors_per_memory is how many
// nearest neighbors the HNSW index returns per row; max_memories caps the
// in-scope base set. Verified live: 782 voyage rows x 5 neighbors ~= 434ms.
const NEIGHBORS_PER_MEMORY = 5;
const MAX_MEMORIES = 2000;
// Capped fallback fetch for datasets with no voyage embeddings (stays under the
// known-safe ceiling that the old O(n^2) text path handled fine).
const TEXT_FALLBACK_MAX_ROWS = 500;

interface DetectDuplicatesRequest {
  similarity_threshold?: number;
  include_archived?: boolean;
  limit?: number;
  organization_id?: string;
  topic_id?: string;
  memory_type?: string;
  memory_types?: string[];
  query_scope?: "personal" | "team" | "organization" | "hybrid";
}

interface DuplicateGroup {
  primary_id: string;
  primary_title: string;
  duplicates: Array<{
    id: string;
    title: string;
    similarity: number;
    created_at: string;
  }>;
  similarity_score: number;
}

interface DuplicatePairRow {
  primary_id: string;
  primary_title: string | null;
  primary_created_at: string | null;
  duplicate_id: string;
  duplicate_title: string | null;
  duplicate_created_at: string | null;
  similarity: number;
}

// Map the intelligence query scope onto the RPC's AND-ed filter args.
// personal -> user_id (plus org if explicitly requested)
// organization/team/hybrid -> organization_id (hybrid is approximated as the
//   org superset; the RPC cannot express the user-OR-org union, and a slightly
//   broader scope is acceptable for a dedup maintenance tool).
function resolveDedupFilters(
  auth: { userId: string; organizationId?: string | null },
  context: {
    organization_id?: string;
    query_scope?: string;
    memory_types?: string[];
  },
): {
  filter_user_id: string | null;
  filter_organization_id: string | null;
  filter_type: string | null;
} {
  const scope = context.query_scope || "personal";
  const orgId = context.organization_id || auth.organizationId || null;

  let filter_user_id: string | null = null;
  let filter_organization_id: string | null = null;

  if (scope === "organization" || scope === "team" || scope === "hybrid") {
    filter_organization_id = orgId;
  } else {
    filter_user_id = auth.userId;
    if (context.organization_id) filter_organization_id = orgId;
  }

  const filter_type =
    context.memory_types && context.memory_types.length === 1
      ? context.memory_types[0]
      : null;

  return { filter_user_id, filter_organization_id, filter_type };
}

// Group canonical (primary_id < duplicate_id) pairs, sorted by similarity desc,
// into non-overlapping groups. Mirrors the previous greedy semantics: once a
// memory is claimed by a group it is not re-grouped.
function groupDuplicatePairs(
  pairs: DuplicatePairRow[],
  limit: number,
): DuplicateGroup[] {
  const processed = new Set<string>();
  const groupsByPrimary = new Map<string, DuplicateGroup>();

  for (const pair of pairs) {
    if (processed.has(pair.duplicate_id)) continue;
    // Don't let a memory that was already attached as someone's duplicate start
    // a fresh group of its own.
    if (processed.has(pair.primary_id) && !groupsByPrimary.has(pair.primary_id)) {
      continue;
    }

    let group = groupsByPrimary.get(pair.primary_id);
    if (!group) {
      group = {
        primary_id: pair.primary_id,
        primary_title: pair.primary_title || "(untitled)",
        duplicates: [],
        similarity_score: 0,
      };
      groupsByPrimary.set(pair.primary_id, group);
    }

    group.duplicates.push({
      id: pair.duplicate_id,
      title: pair.duplicate_title || "(untitled)",
      similarity: Math.round(pair.similarity * 1000) / 1000,
      created_at: pair.duplicate_created_at || "",
    });
    processed.add(pair.duplicate_id);
    processed.add(pair.primary_id);
  }

  const groups = [...groupsByPrimary.values()].filter(
    (g) => g.duplicates.length > 0,
  );
  for (const g of groups) {
    g.similarity_score =
      g.duplicates.reduce((sum, d) => sum + d.similarity, 0) /
      g.duplicates.length;
  }
  groups.sort((a, b) => b.similarity_score - a.similarity_score);
  return groups.slice(0, limit);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return errorResponse(auth.error, auth.status);
    }

    const userId = auth.userId;

    const access = await checkIntelligenceAccess(userId, TOOL_NAME);
    if (!access.allowed) {
      const tierInfo = await getUserTierInfo(userId);
      return premiumRequiredResponse(
        access.reason || "Feature not available",
        tierInfo?.tier_name
      );
    }

    const body: DetectDuplicatesRequest = await req.json().catch(() => ({}));
    const context = resolveIntelligenceQueryContext(auth, body as Record<string, unknown>);
    if ("error" in context) {
      return errorResponse(context.error, context.status);
    }
    const threshold = body.similarity_threshold || 0.85;
    const includeArchived = body.include_archived || false;
    const limit = Math.min(body.limit || 20, 50);

    // Check cache
    const cacheKey = generateCacheKey(
      userId,
      TOOL_NAME,
      extendCacheKeyParams(
        {
          threshold,
          includeArchived,
        },
        context,
      ),
    );
    const cached = await checkCache(cacheKey);

    if (cached.hit) {
      await logUsage(userId, TOOL_NAME, 0, 0, Date.now() - startTime, true, true);
      const tierInfo = await getUserTierInfo(userId);
      return successResponse(
        cached.data,
        { tokens_used: 0, cost_usd: 0, cached: true },
        { tier: tierInfo?.tier_name || "free", usage_remaining: access.usage_remaining || 0 }
      );
    }

    const supabase = getSupabaseClient();

    // --- Primary path: index-backed semantic dedup via voyage_embedding ----
    const filters = resolveDedupFilters(auth, context);
    const { data: pairData, error: rpcError } = await supabase.rpc(
      "detect_duplicate_memories_voyage",
      {
        match_threshold: threshold,
        neighbors_per_memory: NEIGHBORS_PER_MEMORY,
        max_memories: MAX_MEMORIES,
        filter_organization_id: filters.filter_organization_id,
        filter_user_id: filters.filter_user_id,
        filter_type: filters.filter_type,
      },
    );

    if (rpcError) {
      console.error("detect_duplicate_memories_voyage RPC error:", rpcError.message);
      return errorResponse("Failed to detect duplicates: " + rpcError.message);
    }

    const pairs = (pairData || []) as DuplicatePairRow[];

    let duplicateGroups: DuplicateGroup[];
    let detectionMethod: string;
    let memoriesAnalyzed: number;

    if (pairs.length > 0) {
      duplicateGroups = groupDuplicatePairs(pairs, limit);
      detectionMethod = "semantic_voyage";
      // Distinct memories that appeared in the candidate set.
      const seen = new Set<string>();
      for (const p of pairs) {
        seen.add(p.primary_id);
        seen.add(p.duplicate_id);
      }
      memoriesAnalyzed = seen.size;
    } else {
      // --- Fallback: capped title/content text similarity --------------------
      // Reached when the in-scope set has no voyage embeddings (RPC returns 0).
      // Bounded to TEXT_FALLBACK_MAX_ROWS so it stays under the compute ceiling.
      let query = supabase
        .from("memory_entries")
        .select("id, title, content, created_at");
      query = applyIntelligenceMemoryContext(query, auth, context);
      const { data: memories, error: fetchError } = await query
        .order("created_at", { ascending: false })
        .limit(TEXT_FALLBACK_MAX_ROWS);

      if (fetchError) {
        return errorResponse("Failed to fetch memories: " + fetchError.message);
      }

      memoriesAnalyzed = memories?.length || 0;
      duplicateGroups = [];

      if (memories && memories.length >= 2) {
        const processedIds = new Set<string>();
        for (let i = 0; i < memories.length; i++) {
          if (processedIds.has(memories[i].id)) continue;

          const primary = memories[i];
          const primaryTitle = (primary.title || "").toLowerCase().trim();
          const duplicates: DuplicateGroup["duplicates"] = [];

          for (let j = i + 1; j < memories.length; j++) {
            if (processedIds.has(memories[j].id)) continue;

            const candidate = memories[j];
            const candidateTitle = (candidate.title || "").toLowerCase().trim();
            const titleSimilarity = calculateStringSimilarity(primaryTitle, candidateTitle);
            const primaryContent = (primary.content || "").slice(0, 500).toLowerCase();
            const candidateContent = (candidate.content || "").slice(0, 500).toLowerCase();
            const contentSimilarity = calculateStringSimilarity(primaryContent, candidateContent);
            const combinedSimilarity = titleSimilarity * 0.4 + contentSimilarity * 0.6;

            if (combinedSimilarity >= threshold * 0.9) {
              duplicates.push({
                id: candidate.id,
                title: candidate.title,
                similarity: Math.round(combinedSimilarity * 1000) / 1000,
                created_at: candidate.created_at,
              });
              processedIds.add(candidate.id);
            }
          }

          if (duplicates.length > 0) {
            processedIds.add(primary.id);
            duplicateGroups.push({
              primary_id: primary.id,
              primary_title: primary.title,
              duplicates,
              similarity_score:
                duplicates.reduce((sum, d) => sum + d.similarity, 0) / duplicates.length,
            });
          }

          if (duplicateGroups.length >= limit) break;
        }
        duplicateGroups.sort((a, b) => b.similarity_score - a.similarity_score);
      }
      detectionMethod = "text";
    }

    const totalDuplicates = duplicateGroups.reduce(
      (sum, g) => sum + g.duplicates.length,
      0
    );

    const result = {
      duplicate_groups: duplicateGroups,
      total_groups: duplicateGroups.length,
      total_duplicates: totalDuplicates,
      detection_method: detectionMethod,
      threshold_used: threshold,
      memories_analyzed: memoriesAnalyzed,
      potential_storage_savings: `${totalDuplicates} memories could be merged`,
    };

    // Cache result
    await setCache(cacheKey, TOOL_NAME, userId, result, 0, 12);

    await logUsage(
      userId,
      TOOL_NAME,
      0,
      0,
      Date.now() - startTime,
      false,
      true
    );

    const tierInfo = await getUserTierInfo(userId);
    return successResponse(
      result,
      { tokens_used: 0, cost_usd: 0, cached: false },
      { tier: tierInfo?.tier_name || "free", usage_remaining: (access.usage_remaining || 1) - 1 }
    );
  } catch (error) {
    console.error("Detect duplicates error:", error);
    return errorResponse("Internal server error", 500);
  }
});

// Simple string similarity (Jaccard on words)
function calculateStringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}
