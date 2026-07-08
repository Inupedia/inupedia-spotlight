import type { MemoryEntryScope } from "./memoryEntryScope.js";

export function escapeMilvusExpr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildMilvusScopeFilter(
  scopes: Array<{ scope: MemoryEntryScope; sessionId?: string }>,
): string {
  const clauses = scopes.map((scope) => {
    if (scope.scope === "session") {
      const sessionId = scope.sessionId?.trim();
      if (!sessionId) return `(scope == "project")`;
      return `(scope == "session" && session_id == "${escapeMilvusExpr(sessionId)}")`;
    }
    return `(scope == "project")`;
  });
  if (clauses.length === 0) return `(scope == "project")`;
  if (clauses.length === 1) return clauses[0]!;
  return `(${clauses.join(" || ")})`;
}

export function buildMilvusSemanticFilter(params: {
  projectId: string;
  tenantId: string;
  now: number;
  scopes?: Array<{ scope: MemoryEntryScope; sessionId?: string }>;
}): string {
  const parts = [
    `project_id == "${escapeMilvusExpr(params.projectId)}"`,
    `tenant_id == "${escapeMilvusExpr(params.tenantId)}"`,
    `expires_at > ${Math.floor(params.now)}`,
  ];
  if (params.scopes?.length) {
    parts.push(buildMilvusScopeFilter(params.scopes));
  }
  return parts.join(" && ");
}
