import { createHash, randomUUID } from "node:crypto";

export function buildCacheKey(params: {
  projectId: string;
  questionNorm: string;
  invalidation: {
    assetsVersion?: string | null;
    catalogVersion?: string | null;
  };
}): string {
  const payload = [
    params.projectId,
    params.questionNorm,
    params.invalidation.assetsVersion ?? "",
    params.invalidation.catalogVersion ?? "",
  ].join("\0");
  return createHash("sha256").update(payload).digest("hex");
}

export function createMemoryEntryId(): string {
  return `mem-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
