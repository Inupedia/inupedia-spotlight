import { createHash, randomUUID } from "node:crypto";

export function buildCacheKey(params: {
  projectId: string;
  scope?: "project" | "session";
  sessionId?: string | null;
  questionNorm: string;
  invalidation: {
    assetsVersion?: string | null;
    catalogVersion?: string | null;
    knowledgeIndexVersion?: string | null;
  };
}): string {
  const scope = params.scope ?? "project";
  const payload = [
    params.projectId,
    scope,
    scope === "session" ? (params.sessionId ?? "") : "",
    params.questionNorm,
    params.invalidation.assetsVersion ?? "",
    params.invalidation.catalogVersion ?? "",
    params.invalidation.knowledgeIndexVersion ?? "",
  ].join("\0");
  return createHash("sha256").update(payload).digest("hex");
}

export function createMemoryEntryId(): string {
  return `mem-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
