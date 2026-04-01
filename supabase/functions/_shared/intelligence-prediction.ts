/// <reference lib="deno.ns" />
import { cosineSimilarity } from "./utils.ts";

export interface PredictiveContext {
  currentProject?: string;
  recentTopics?: string[];
  activeFiles?: string[];
  contextText?: string;
  teamContext?: string;
}

export interface PredictionCandidate {
  id: string;
  title: string;
  content: string;
  type: string;
  tags: string[];
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
}

export interface PredictionScoreBreakdown {
  semanticScore: number;
  temporalScore: number;
  frequencyScore: number;
  serendipityScore: number;
  combinedScore: number;
}

export interface PredictedMemory {
  id: string;
  title: string;
  type: string;
  tags: string[];
  contentPreview: string;
  confidence: number;
  reason: string;
  reasonType:
    | "semantic_match"
    | "recent_related"
    | "team_trending"
    | "adjacent_discovery"
    | "frequently_used";
  scoreBreakdown: PredictionScoreBreakdown;
  daysSinceCreated: number;
  daysSinceAccessed?: number;
  suggestedAction: "review" | "apply" | "reference" | "explore";
  relatedTopics?: string[];
}

export interface PredictionScoringConfig {
  semanticWeight: number;
  temporalWeight: number;
  frequencyWeight: number;
  serendipityWeight: number;
  temporalDecayHalfLife: number;
  semanticThreshold: number;
  serendipityRange: {
    min: number;
    max: number;
  };
}

export const DEFAULT_PREDICTION_SCORING: PredictionScoringConfig = {
  semanticWeight: 0.4,
  temporalWeight: 0.3,
  frequencyWeight: 0.2,
  serendipityWeight: 0.1,
  temporalDecayHalfLife: 14,
  semanticThreshold: 0.5,
  serendipityRange: {
    min: 0.3,
    max: 0.6,
  },
};

export function buildContextText(context: PredictiveContext): string {
  const parts: string[] = [];

  if (context.currentProject) {
    parts.push(`Project: ${context.currentProject}`);
  }

  if (context.recentTopics?.length) {
    parts.push(`Topics: ${context.recentTopics.join(", ")}`);
  }

  if (context.activeFiles?.length) {
    const fileNames = context.activeFiles.map((file) => {
      const parts = file.split("/");
      return parts[parts.length - 1];
    });
    parts.push(`Files: ${fileNames.join(", ")}`);
  }

  if (context.contextText) {
    parts.push(context.contextText);
  }

  if (context.teamContext) {
    parts.push(`Team discussion: ${context.teamContext}`);
  }

  return parts.join(". ");
}

export function buildContextUsedSummary(context: PredictiveContext) {
  return {
    projectContext: !!context.currentProject,
    topicsContext: !!context.recentTopics?.length,
    filesContext: !!context.activeFiles?.length,
    textContext: !!context.contextText,
    teamContext: !!context.teamContext,
  };
}

function calculateSemanticScore(
  contextEmbedding: number[],
  memoryEmbedding: number[],
  threshold: number,
): number {
  if (!contextEmbedding.length || !memoryEmbedding.length) {
    return 0;
  }

  const similarity = cosineSimilarity(contextEmbedding, memoryEmbedding);
  if (similarity < threshold) {
    return 0;
  }

  const normalized = (similarity - threshold) / (1 - threshold);
  return Math.round(normalized * 100);
}

function calculateTemporalScore(
  createdAt: Date,
  now: Date,
  halfLifeDays: number,
): number {
  const daysSinceCreation = Math.max(
    0,
    (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  const decayConstant = Math.log(2) / halfLifeDays;
  const decayFactor = Math.exp(-daysSinceCreation * decayConstant);
  return Math.round(decayFactor * 100);
}

function calculateFrequencyScore(
  accessCount: number,
  maxAccessCount: number,
): number {
  if (accessCount <= 0) return 0;
  const logAccess = Math.log10(accessCount + 1);
  const logMax = Math.log10(maxAccessCount + 1);
  return Math.round(Math.min(1, logAccess / logMax) * 100);
}

function calculateSerendipityScore(
  contextEmbedding: number[],
  memoryEmbedding: number[],
  range: { min: number; max: number },
): number {
  if (!contextEmbedding.length || !memoryEmbedding.length) {
    return 0;
  }

  const similarity = cosineSimilarity(contextEmbedding, memoryEmbedding);
  if (similarity < range.min || similarity > range.max) {
    return 0;
  }

  const mid = (range.min + range.max) / 2;
  const halfWidth = (range.max - range.min) / 2;
  const normalizedDistance = Math.abs(similarity - mid) / halfWidth;
  return Math.round(
    Math.exp(-2 * normalizedDistance * normalizedDistance) * 100,
  );
}

function determinePredictionReason(
  scoreBreakdown: PredictionScoreBreakdown,
  hasTeamContext: boolean,
): { reason: PredictedMemory["reasonType"]; explanation: string } {
  if (hasTeamContext && scoreBreakdown.semanticScore > 60) {
    return {
      reason: "team_trending",
      explanation: "Team context suggests this will be helpful right now",
    };
  }

  const weightedFactors = [
    {
      reason: "semantic_match" as const,
      effective: scoreBreakdown.semanticScore * 0.4,
      explanation: "Highly relevant to your current work",
    },
    {
      reason: "recent_related" as const,
      effective: scoreBreakdown.temporalScore * 0.3,
      explanation: "Recently active and still relevant",
    },
    {
      reason: "frequently_used" as const,
      effective: scoreBreakdown.frequencyScore * 0.2,
      explanation: "Frequently used in similar situations",
    },
    {
      reason: "adjacent_discovery" as const,
      effective: scoreBreakdown.serendipityScore * 0.1,
      explanation: "An adjacent topic worth exploring",
    },
  ].sort((left, right) => right.effective - left.effective);

  const dominant = weightedFactors[0];
  return {
    reason: dominant.reason,
    explanation: dominant.explanation,
  };
}

function suggestAction(
  scoreBreakdown: PredictionScoreBreakdown,
  memoryType: string,
): PredictedMemory["suggestedAction"] {
  if (scoreBreakdown.serendipityScore > 60) {
    return "explore";
  }

  if (scoreBreakdown.semanticScore > 70 && scoreBreakdown.temporalScore > 50) {
    return "apply";
  }

  if (memoryType === "knowledge" || memoryType === "reference") {
    return "reference";
  }

  return "review";
}

function extractTopicsFromTags(tags: string[]): string[] {
  return tags
    .filter((tag) => !tag.startsWith("meta:") && !tag.startsWith("auto:"))
    .slice(0, 5);
}

export function generatePredictions(
  contextEmbedding: number[],
  memories: PredictionCandidate[],
  params: {
    limit?: number;
    minConfidence?: number;
    includeSerendipity?: boolean;
    context: PredictiveContext;
  },
  config: PredictionScoringConfig = DEFAULT_PREDICTION_SCORING,
): PredictedMemory[] {
  const limit = params.limit || 5;
  const minConfidence = params.minConfidence || 40;
  const includeSerendipity = params.includeSerendipity !== false;
  const maxAccessCount = Math.max(
    10,
    ...memories.map((memory) => memory.accessCount || 0),
  );
  const now = new Date();

  const scored = memories.map((memory) => {
    const scoreBreakdown: PredictionScoreBreakdown = {
      semanticScore: calculateSemanticScore(
        contextEmbedding,
        memory.embedding,
        config.semanticThreshold,
      ),
      temporalScore: calculateTemporalScore(
        memory.createdAt,
        now,
        config.temporalDecayHalfLife,
      ),
      frequencyScore: calculateFrequencyScore(
        memory.accessCount,
        maxAccessCount,
      ),
      serendipityScore: calculateSerendipityScore(
        contextEmbedding,
        memory.embedding,
        config.serendipityRange,
      ),
      combinedScore: 0,
    };

    scoreBreakdown.combinedScore = Math.round(
      scoreBreakdown.semanticScore * config.semanticWeight +
        scoreBreakdown.temporalScore * config.temporalWeight +
        scoreBreakdown.frequencyScore * config.frequencyWeight +
        scoreBreakdown.serendipityScore * config.serendipityWeight,
    );

    const { reason, explanation } = determinePredictionReason(
      scoreBreakdown,
      !!params.context.teamContext,
    );

    const daysSinceCreated = Math.floor(
      (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysSinceAccessed = Math.floor(
      (Date.now() - memory.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      id: memory.id,
      title: memory.title,
      type: memory.type,
      tags: memory.tags,
      contentPreview: memory.content.substring(0, 300) +
        (memory.content.length > 300 ? "..." : ""),
      confidence: scoreBreakdown.combinedScore,
      reason: explanation,
      reasonType: reason,
      scoreBreakdown,
      daysSinceCreated,
      daysSinceAccessed,
      suggestedAction: suggestAction(scoreBreakdown, memory.type),
      relatedTopics: extractTopicsFromTags(memory.tags),
    } satisfies PredictedMemory;
  });

  let filtered = scored
    .filter((memory) => memory.confidence >= minConfidence)
    .sort((left, right) => right.confidence - left.confidence);

  if (includeSerendipity) {
    const serendipitous = filtered.filter(
      (memory) => memory.reasonType === "adjacent_discovery",
    );
    const regular = filtered.filter(
      (memory) => memory.reasonType !== "adjacent_discovery",
    );

    const regularLimit = Math.max(1, limit - 1);
    const regularPicks = regular.slice(0, regularLimit);
    const surprisePick = serendipitous[0];

    filtered = surprisePick && regularPicks.length < limit
      ? [...regularPicks, surprisePick]
      : regularPicks;
  } else {
    filtered = filtered.slice(0, limit);
  }

  return filtered.slice(0, limit).sort((left, right) =>
    right.confidence - left.confidence
  );
}
