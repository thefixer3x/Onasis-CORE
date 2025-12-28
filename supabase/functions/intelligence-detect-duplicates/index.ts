// Intelligence API: Detect Duplicates
// Finds potential duplicate or very similar memories
// POST /intelligence/detect-duplicates

import {
  corsHeaders,
  authenticateRequest,
  checkIntelligenceAccess,
  getUserTierInfo,
  logUsage,
  generateCacheKey,
  checkCache,
  setCache,
  generateEmbedding,
  cosineSimilarity,
  getSupabaseClient,
  errorResponse,
  successResponse,
  premiumRequiredResponse,
} from "../_shared/utils.ts";

const TOOL_NAME = "detect_duplicates";

interface DetectDuplicatesRequest {
  similarity_threshold?: number;
  include_archived?: boolean;
  limit?: number;
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
    const threshold = body.similarity_threshold || 0.85;
    const includeArchived = body.include_archived || false;
    const limit = Math.min(body.limit || 20, 50);

    // Check cache
    const cacheKey = generateCacheKey(userId, TOOL_NAME, {
      threshold,
      includeArchived,
    });
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

    // Fetch memories
    // Note: is_archived column not in production schema
    const query = supabase
      .from("memory_entries")
      .select("id, title, content, type, tags, embedding, created_at")
      .eq("user_id", userId);

    const { data: memories, error: fetchError } = await query.order("created_at", {
      ascending: false,
    });

    if (fetchError) {
      return errorResponse("Failed to fetch memories: " + fetchError.message);
    }

    if (!memories || memories.length < 2) {
      return successResponse({
        duplicate_groups: [],
        total_duplicates: 0,
        message: "Not enough memories to detect duplicates",
      });
    }

    const duplicateGroups: DuplicateGroup[] = [];
    const processedIds = new Set<string>();
    let totalCost = 0;

    // Check if we have embeddings
    const memoriesWithEmbeddings = memories.filter((m) => m.embedding);

    if (memoriesWithEmbeddings.length >= 2) {
      // Use semantic similarity
      for (let i = 0; i < memoriesWithEmbeddings.length; i++) {
        if (processedIds.has(memoriesWithEmbeddings[i].id)) continue;

        const primary = memoriesWithEmbeddings[i];
        const duplicates: DuplicateGroup["duplicates"] = [];

        for (let j = i + 1; j < memoriesWithEmbeddings.length; j++) {
          if (processedIds.has(memoriesWithEmbeddings[j].id)) continue;

          const candidate = memoriesWithEmbeddings[j];
          const similarity = cosineSimilarity(primary.embedding, candidate.embedding);

          if (similarity >= threshold) {
            duplicates.push({
              id: candidate.id,
              title: candidate.title,
              similarity: Math.round(similarity * 1000) / 1000,
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
    } else {
      // Fallback: title-based similarity
      for (let i = 0; i < memories.length; i++) {
        if (processedIds.has(memories[i].id)) continue;

        const primary = memories[i];
        const primaryTitle = primary.title.toLowerCase().trim();
        const duplicates: DuplicateGroup["duplicates"] = [];

        for (let j = i + 1; j < memories.length; j++) {
          if (processedIds.has(memories[j].id)) continue;

          const candidate = memories[j];
          const candidateTitle = candidate.title.toLowerCase().trim();

          // Check title similarity
          const titleSimilarity = calculateStringSimilarity(primaryTitle, candidateTitle);

          // Check content prefix similarity (first 500 chars)
          const primaryContent = (primary.content || "").slice(0, 500).toLowerCase();
          const candidateContent = (candidate.content || "").slice(0, 500).toLowerCase();
          const contentSimilarity = calculateStringSimilarity(
            primaryContent,
            candidateContent
          );

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
    }

    // Sort by similarity score
    duplicateGroups.sort((a, b) => b.similarity_score - a.similarity_score);

    const totalDuplicates = duplicateGroups.reduce(
      (sum, g) => sum + g.duplicates.length,
      0
    );

    const result = {
      duplicate_groups: duplicateGroups,
      total_groups: duplicateGroups.length,
      total_duplicates: totalDuplicates,
      detection_method: memoriesWithEmbeddings.length >= 2 ? "semantic" : "text",
      threshold_used: threshold,
      memories_analyzed: memories.length,
      potential_storage_savings: `${totalDuplicates} memories could be merged`,
    };

    // Cache result
    await setCache(cacheKey, TOOL_NAME, userId, result, 0, 12);

    await logUsage(
      userId,
      TOOL_NAME,
      0,
      totalCost,
      Date.now() - startTime,
      false,
      true
    );

    const tierInfo = await getUserTierInfo(userId);
    return successResponse(
      result,
      { tokens_used: 0, cost_usd: totalCost, cached: false },
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
