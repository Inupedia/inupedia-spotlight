import type {
  SpotlightMemoryEntry,
  SpotlightMemoryInvalidationContext,
} from "@inupedia/spotlight-protocol";

export function isMemoryEntryStale(
  entry: SpotlightMemoryEntry,
  ctx: SpotlightMemoryInvalidationContext,
  now = Date.now(),
): boolean {
  if (entry.ttlSec > 0 && now - entry.createdAt > entry.ttlSec * 1000) {
    return true;
  }

  const assetsChanged =
    entry.invalidation.assetsVersion != null &&
    ctx.assetsVersion != null &&
    entry.invalidation.assetsVersion !== ctx.assetsVersion;

  const catalogChanged =
    entry.invalidation.catalogVersion != null &&
    ctx.catalogVersion != null &&
    entry.invalidation.catalogVersion !== ctx.catalogVersion;

  const knowledgeChanged =
    entry.invalidation.knowledgeIndexVersion != null &&
    ctx.knowledgeIndexVersion != null &&
    entry.invalidation.knowledgeIndexVersion !== ctx.knowledgeIndexVersion;

  if (assetsChanged && entry.kind === "data_snapshot") return true;
  if (catalogChanged && (entry.kind === "action_plan" || entry.kind === "routing_hint")) {
    return true;
  }
  if (knowledgeChanged && (entry.kind === "qa_answer" || entry.kind === "routing_hint")) {
    return true;
  }

  return false;
}

export function pickSemanticHit<T extends { entry: SpotlightMemoryEntry; score: number }>(
  candidates: T[],
  threshold: number,
): T | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const runner = sorted[1];
  if (top.score < threshold) return null;
  if (runner && top.score - runner.score < 0.05) return null;
  return top;
}
