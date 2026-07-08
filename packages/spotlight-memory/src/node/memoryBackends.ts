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
