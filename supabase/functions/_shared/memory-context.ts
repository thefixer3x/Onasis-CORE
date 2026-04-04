export type MemoryKeyContext = "personal" | "team" | "enterprise" | "legacy";
export type MemoryBoundaryContext = "personal" | "team" | "enterprise" | "none";

export interface MemoryBoundaryAuthContext {
  user_id: string;
  organization_id: string;
  is_master?: boolean;
  key_context?: string | null;
  permissions?: string[];
  auth_source?: string;
  api_key_id?: string;
  project_scope?: string;
}

export interface MemoryBoundaryFlags {
  shadow: boolean;
  enforce: boolean;
}

export interface MemoryBoundaryResolution {
  context: MemoryBoundaryContext;
  flags: MemoryBoundaryFlags;
  organization_id: string | null;
  user_id: string | null;
}

function envFlag(name: string): boolean {
  const value = Deno.env.get(name)?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function normalizePermissions(scopes?: string[]): string[] {
  if (!Array.isArray(scopes)) return [];
  return scopes
    .map((scope) => String(scope || "").trim())
    .filter(Boolean);
}

export function getMemoryBoundaryFlags(): MemoryBoundaryFlags {
  const shadow = envFlag("FEATURE_MEMORY_CONTEXT_SHADOW");
  const enforce = envFlag("FEATURE_MEMORY_CONTEXT_ENFORCE");
  return {
    shadow: shadow || enforce,
    enforce,
  };
}

export function normalizeMemoryKeyContext(
  value?: string | null,
): MemoryKeyContext | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "personal" || normalized === "team" ||
    normalized === "enterprise" || normalized === "legacy"
  ) {
    return normalized;
  }
  return undefined;
}

export function resolveMemoryContext(
  keyContext?: string | null,
  scopes?: string[],
): MemoryBoundaryContext {
  const normalizedKeyContext = normalizeMemoryKeyContext(keyContext);
  if (normalizedKeyContext === "personal") return "personal";
  if (normalizedKeyContext === "team") return "team";
  if (normalizedKeyContext === "enterprise") return "enterprise";
  if (normalizedKeyContext === "legacy") return "none";

  const normalizedScopes = normalizePermissions(scopes).map((scope) =>
    scope.toLowerCase()
  );

  if (
    normalizedScopes.includes("*") ||
    normalizedScopes.includes("admin.*") ||
    normalizedScopes.includes("legacy.full_access") ||
    normalizedScopes.includes("memories.*")
  ) {
    return "none";
  }

  if (normalizedScopes.some((scope) => scope.startsWith("memories:personal:"))) {
    return "personal";
  }

  if (normalizedScopes.some((scope) => scope.startsWith("memories:team:"))) {
    return "team";
  }

  if (
    normalizedScopes.some((scope) => scope.startsWith("memories:enterprise:")) ||
    normalizedScopes.some((scope) => scope === "memories:*")
  ) {
    return "enterprise";
  }

  return "none";
}

export function resolveMemoryBoundary(
  auth: MemoryBoundaryAuthContext,
): MemoryBoundaryResolution {
  const flags = getMemoryBoundaryFlags();
  if (auth.is_master) {
    return {
      context: "enterprise",
      flags,
      organization_id: null,
      user_id: null,
    };
  }

  const context = resolveMemoryContext(auth.key_context, auth.permissions);
  return {
    context,
    flags,
    // Preserve the existing organization fence for all non-master traffic.
    // P4 currently adds a personal user boundary on top of tenant isolation
    // instead of widening enterprise/legacy keys beyond their org.
    organization_id: auth.organization_id || null,
    user_id: context === "personal" ? auth.user_id : null,
  };
}

export function applyMemoryBoundary<T>(
  query: T,
  auth: MemoryBoundaryAuthContext,
  options: { requestId?: string; route?: string } = {},
): T {
  let scopedQuery = query as Record<string, unknown>;
  const resolution = resolveMemoryBoundary(auth);

  if (resolution.organization_id) {
    scopedQuery =
      (scopedQuery as { eq: (column: string, value: unknown) => unknown }).eq(
        "organization_id",
        resolution.organization_id,
      ) as Record<string, unknown>;
  }

  if (resolution.flags.shadow || resolution.flags.enforce) {
    console.info(
      "[memory-context]",
      JSON.stringify({
        route: options.route || "unknown",
        request_id: options.requestId || null,
        auth_source: auth.auth_source || "unknown",
        api_key_id: auth.api_key_id || null,
        project_scope: auth.project_scope || null,
        context: resolution.context,
        enforce: resolution.flags.enforce,
        organization_id: resolution.organization_id,
        user_id: resolution.user_id,
      }),
    );
  }

  if (resolution.flags.enforce && resolution.user_id) {
    scopedQuery =
      (scopedQuery as { eq: (column: string, value: unknown) => unknown }).eq(
        "user_id",
        resolution.user_id,
      ) as Record<string, unknown>;
  }

  return scopedQuery as T;
}
