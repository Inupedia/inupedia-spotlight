import { cosineSimilarity } from "../similarity.js";

export interface EmbeddingProvider {
  readonly name: string;
  embed(text: string): Promise<number[] | null>;
}

export function resolveEmbeddingProviderFromEnv(): EmbeddingProvider | null {
  const raw = process.env.SPOTLIGHT_MEMORY_EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === "none" || raw === "off" || raw === "0") return null;
  if (raw === "siliconflow" || raw === "openai") {
    return createHttpEmbeddingProvider(raw);
  }
  return null;
}

function createHttpEmbeddingProvider(
  vendor: "siliconflow" | "openai",
): EmbeddingProvider | null {
  const apiKey =
    vendor === "siliconflow"
      ? process.env.SILICONFLOW_API_KEY?.trim()
      : process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const apiBase =
    vendor === "siliconflow"
      ? (process.env.SILICONFLOW_API_BASE?.trim() ??
        "https://api.siliconflow.cn/v1")
      : (process.env.OPENAI_API_BASE?.trim() ?? "https://api.openai.com/v1");
  const model =
    process.env.SPOTLIGHT_MEMORY_EMBEDDING_MODEL?.trim() ??
    (vendor === "siliconflow"
      ? "BAAI/bge-large-zh-v1.5"
      : "text-embedding-3-small");

  return {
    name: vendor,
    async embed(text: string): Promise<number[] | null> {
      const input = text.trim();
      if (!input) return null;
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const embedding = payload.data?.[0]?.embedding;
      return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
    },
  };
}

export function scoreEmbeddingPair(
  query: number[] | null | undefined,
  stored: number[] | null | undefined,
): number {
  if (!query?.length || !stored?.length) return 0;
  return cosineSimilarity(query, stored);
}
