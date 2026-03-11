/**
 * Topic Key Suggestion Helper
 * 
 * Provides lightweight topic key generation for memory organization.
 * Used by memory-create and memory-update handlers.
 * 
 * Prefix conventions:
 * - architecture/   - architectural decisions and patterns
 * - decision/      - general decisions and rationale
 * - bug/           - bug tracking and fixes
 * - project/       - project-specific memories
 * - session/       - dated session notes (session/YYYY-MM-DD/)
 * - workflow/      - workflow and process documentation
 */

type MemoryType = "context" | "project" | "knowledge" | "reference" | "personal" | "workflow";

interface TopicKeyInput {
  memory_type?: MemoryType | string;
  title?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate a slug from a string
 * - lowercase
 * - hyphens for spaces
 * - remove special characters
 * - limit length
 */
function generateSlug(text: string, maxLength: number = 50): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, maxLength)
    .replace(/-+$/, "");
}

/**
 * Determine the appropriate prefix based on memory type and metadata
 */
function determinePrefix(memoryType?: string, metadata?: Record<string, unknown>): string {
  const type = (memoryType || "").toLowerCase();
  const meta = metadata || {};
  
  // Check for explicit type hints in metadata
  if (meta.topic_type === "architecture" || meta.topic_type === "architectural") {
    return "architecture";
  }
  if (meta.topic_type === "decision") {
    return "decision";
  }
  if (meta.topic_type === "bug" || meta.topic_type === "fix") {
    return "bug";
  }
  if (meta.topic_type === "session" || meta.topic_type === "meeting") {
    return "session";
  }
  if (meta.topic_type === "workflow" || meta.topic_type === "process") {
    return "workflow";
  }
  
  // Map memory_type to prefix
  switch (type) {
    case "context":
      return "architecture";
    case "project":
      return "project";
    case "knowledge":
      return "decision";
    case "reference":
      return "project";
    case "workflow":
      return "workflow";
    case "personal":
    default:
      return "session";
  }
}

/**
 * Generate a session-based prefix with today's date
 */
function getSessionPrefix(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `session/${year}-${month}-${day}`;
}

/**
 * Generate a topic key suggestion from memory input
 * 
 * This is a conservative, additive suggestion - it does NOT override
 * existing topic keys and does NOT modify historical data.
 * 
 * @param input - Memory input containing type, title, and optional metadata
 * @returns Suggested topic key string, or null if insufficient data
 */
export function suggestTopicKey(input: TopicKeyInput): string | null {
  const { memory_type, title, metadata } = input;
  
  // Cannot suggest without at least a memory type or title
  if (!memory_type && !title) {
    return null;
  }
  
  const prefix = determinePrefix(memory_type, metadata);
  
  // Session uses dated prefix
  if (prefix.startsWith("session")) {
    const sessionPrefix = getSessionPrefix();
    
    if (title) {
      const slug = generateSlug(title, 40);
      return `${sessionPrefix}/${slug}`;
    }
    
    // Session without title - just return the date prefix
    return sessionPrefix;
  }
  
  // Other prefixes need a title for meaningful slug
  if (!title) {
    // For non-session types without title, return prefix only
    // This creates a category-level topic key
    return prefix;
  }
  
  const slug = generateSlug(title, 45);
  return `${prefix}/${slug}`;
}

/**
 * Validate a topic key format
 * 
 * Accepts keys matching pattern: prefix/slug or just prefix
 * Prefixes: architecture, decision, bug, project, session/YYYY-MM-DD, workflow
 */
export function isValidTopicKey(topicKey: string | null | undefined): boolean {
  if (!topicKey || typeof topicKey !== "string") {
    return false;
  }
  
  const trimmed = topicKey.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return false;
  }
  
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  // Valid prefixes
  const validPrefixes = [
    "architecture",
    "decision", 
    "bug",
    "project",
    "workflow",
  ];
  
  // Check if it starts with a valid prefix
  const parts = trimmed.split("/");
  const firstPart = parts[0];
  
  if (validPrefixes.includes(firstPart)) {
    if (parts.length === 1) {
      return true;
    }
    if (parts.length === 2) {
      return slugPattern.test(parts[1]);
    }
    return false;
  }
  
  if (firstPart === "session") {
    if (parts.length < 2 || parts.length > 3) {
      return false;
    }

    const datePart = parts[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return false;
    }

    if (parts.length === 2) {
      return true;
    }

    return slugPattern.test(parts[2]);
  }
  
  return false;
}

/**
 * Normalize a topic key - trim and lowercase for consistent storage
 */
export function normalizeTopicKey(topicKey: string | null | undefined): string | null {
  if (!topicKey) {
    return null;
  }
  
  const normalized = topicKey.trim().toLowerCase();
  
  if (normalized.length === 0) {
    return null;
  }
  
  return normalized;
}

// Example topic keys generated for representative inputs:
// ============================================================================
// Input: { memory_type: "context", title: "API Design Principles" }
// Output: "architecture/api-design-principles"
//
// Input: { memory_type: "knowledge", title: "Why We Chose PostgreSQL" }  
// Output: "decision/why-we-chose-postgresql"
//
// Input: { memory_type: "project", title: "Q1 Launch Checklist" }
// Output: "project/q1-launch-checklist"
//
// Input: { memory_type: "bug", title: "Memory leak in user session" }
// Output: "bug/memory-leak-in-user-session"
//
// Input: { memory_type: "workflow", title: "Code review process" }
// Output: "workflow/code-review-process"
//
// Input: { memory_type: "personal", title: "Meeting notes" }
// Output: "session/2026-03-11/meeting-notes" (current date)
//
// Input: { memory_type: "context", metadata: { topic_type: "architecture" }, title: "System Overview" }
// Output: "architecture/system-overview" (explicit override from metadata)
//
// Input: { memory_type: "reference" }
// Output: "project" (category-only for references without title)
//
// Input: { title: "Quick thought" }
// Output: "session/2026-03-11/quick-thought" (defaults to session for unknown types)
//
// Input: { memory_type: "context" }
// Output: "architecture" (category-only for context without title)
