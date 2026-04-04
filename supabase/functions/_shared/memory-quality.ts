import {
  applyMemoryBoundary,
  type MemoryBoundaryAuthContext,
  type MemoryBoundaryResolution,
  resolveMemoryBoundary,
} from "./memory-context.ts";

export interface MemoryWriteCandidate {
  title: string;
  content: string;
  tags?: string[];
  memory_type?: string;
  write_intent?: "new" | "continue" | "auto";
}

export interface MemoryQualityFlags {
  shadow: boolean;
  enforce: boolean;
}

export interface MemoryQualityDecision {
  pass: boolean;
  mode: "pass" | "shadow_fail" | "hard_fail";
  reasons: string[];
  duplicate_memory_id?: string;
  needs_signal_check: boolean;
  boundary: MemoryBoundaryResolution;
}

interface AnalyzedCandidate {
  reasons: string[];
  needsSignalCheck: boolean;
  fingerprint: string;
}

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "openai_api_key", regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  {
    name: "bearer_token",
    regex: /\bbearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i,
  },
  {
    name: "jwt_token",
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/,
  },
];

const DANGER_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  {
    name: "prompt_injection",
    regex: /\b(ignore (all|any|previous) instructions|system prompt|developer message|override safety|jailbreak)\b/i,
  },
];

function envFlag(name: string): boolean {
  const value = Deno.env.get(name)?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function getMemoryQualityFlags(): MemoryQualityFlags {
  const shadow = envFlag("FEATURE_MEMORY_QUALITY_SHADOW");
  const enforce = envFlag("FEATURE_MEMORY_QUALITY_ENFORCE");
  return {
    shadow: shadow || enforce,
    enforce,
  };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fingerprintCandidate(title: string, content: string): string {
  return `${normalizeText(title).toLowerCase()}::${normalizeText(content).toLowerCase()}`;
}

function lowSignal(candidate: MemoryWriteCandidate): boolean {
  const content = normalizeText(candidate.content);
  const title = normalizeText(candidate.title);
  const combined = `${title} ${content}`.trim();
  if (combined.length < 40) return true;
  if ((candidate.tags?.length || 0) > 0) return false;
  const tokenCount = combined.split(/\s+/).filter(Boolean).length;
  return tokenCount < 8;
}

export function analyzeMemoryWriteCandidate(
  candidate: MemoryWriteCandidate,
): AnalyzedCandidate {
  const reasons: string[] = [];
  const normalizedTitle = normalizeText(candidate.title);
  const normalizedContent = normalizeText(candidate.content);
  const combined = `${normalizedTitle} ${normalizedContent}`.trim();
  const writeIntent = candidate.write_intent || "auto";

  if (writeIntent !== "continue" && normalizedContent.length < 12) {
    reasons.push("too_short");
  }

  if (/^(.)\1{11,}$/.test(normalizedContent.replace(/\s/g, ""))) {
    reasons.push("repetitive_content");
  }

  const tokens = combined.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length >= 6) {
    const uniqueRatio = new Set(tokens).size / tokens.length;
    if (uniqueRatio < 0.35) {
      reasons.push("low_information_density");
    }
  }

  for (const pattern of DANGER_PATTERNS) {
    if (pattern.regex.test(combined)) {
      reasons.push(pattern.name);
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(combined)) {
      reasons.push(pattern.name);
    }
  }

  return {
    reasons,
    needsSignalCheck: reasons.length === 0 && lowSignal(candidate),
    fingerprint: fingerprintCandidate(candidate.title, candidate.content),
  };
}

async function findRecentDuplicate(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (
            count: number,
          ) => Promise<
            {
              data: Array<{ id: string; title?: string; content?: string }> | null;
              error: { message: string } | null;
            }
          >;
        };
      };
    };
  } | any,
  auth: MemoryBoundaryAuthContext,
  fingerprint: string,
): Promise<string | undefined> {
  let query = supabase
    .from("memory_entries")
    .select("id, title, content")
    .order("updated_at", { ascending: false });

  query = applyMemoryBoundary(query, auth);

  const { data, error } = await query.limit(25);
  if (error || !Array.isArray(data)) {
    if (error) {
      console.warn("[memory-quality] duplicate lookup failed:", error.message);
    }
    return undefined;
  }

  for (const row of data) {
    const rowFingerprint = fingerprintCandidate(row.title || "", row.content || "");
    if (rowFingerprint === fingerprint) {
      return row.id;
    }
  }

  return undefined;
}

export async function scoreMemoryWrite(
  supabase: any,
  auth: MemoryBoundaryAuthContext,
  candidate: MemoryWriteCandidate,
): Promise<MemoryQualityDecision | null> {
  const flags = getMemoryQualityFlags();
  if (!flags.shadow && !flags.enforce) {
    return null;
  }

  const analysis = analyzeMemoryWriteCandidate(candidate);
  const reasons = [...analysis.reasons];
  const boundary = resolveMemoryBoundary(auth);
  const duplicateId = await findRecentDuplicate(supabase, auth, analysis.fingerprint);
  if (duplicateId) {
    reasons.push("duplicate_recent");
  }

  const failingReasons = reasons.length > 0;
  return {
    pass: !failingReasons || !flags.enforce,
    mode: failingReasons
      ? flags.enforce ? "hard_fail" : "shadow_fail"
      : "pass",
    reasons,
    duplicate_memory_id: duplicateId,
    needs_signal_check: analysis.needsSignalCheck,
    boundary,
  };
}
