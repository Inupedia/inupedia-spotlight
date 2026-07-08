import { MilvusSemanticMemoryStore } from "./milvusSemanticStore.js";
import { resolveEmbeddingProviderFromEnv } from "./embeddingProvider.js";
import { isSpotlightMilvusConfigured } from "./milvusClient.js";

export type SemanticMemoryBackend = "sqlite" | "milvus";
export type ExactMemoryBackend = "file" | "redis";

export function resolveSemanticMemoryBackend(): SemanticMemoryBackend {
  const raw = process.env.SPOTLIGHT_MEMORY_SEMANTIC_BACKEND?.trim().toLowerCase();
  if (raw === "sqlite" || raw === "file") return "sqlite";
  if (raw === "milvus") return "milvus";
  if (process.env.SPOTLIGHT_MILVUS_URI?.trim()) return "milvus";
  return "sqlite";
}

export function resolveExactMemoryBackend(): ExactMemoryBackend {
  const raw = process.env.SPOTLIGHT_MEMORY_EXACT_BACKEND?.trim().toLowerCase();
  if (raw === "file" || raw === "disk") return "file";
  if (raw === "redis") return "redis";
  if (process.env.SPOTLIGHT_REDIS_URL?.trim()) return "redis";
  return "file";
}

/** Milvus semantic requires a working embedding provider; otherwise fall back to SQLite. */
export function resolveEffectiveSemanticMemoryBackend(): SemanticMemoryBackend {
  const requested = resolveSemanticMemoryBackend();
  if (requested !== "milvus") return "sqlite";
  if (!isSpotlightMilvusConfigured()) return "sqlite";
  if (!MilvusSemanticMemoryStore.isAvailable()) return "sqlite";
  if (!resolveEmbeddingProviderFromEnv()) return "sqlite";
  return "milvus";
}

export function isRemoteMemoryBackend(params: {
  exact: ExactMemoryBackend;
  semantic: SemanticMemoryBackend;
}): boolean {
  return params.exact !== "file" || params.semantic !== "sqlite";
}
