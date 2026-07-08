import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";
import { scoreQuestionSimilarity } from "../normalize.js";
import {
  type EmbeddingProvider,
  resolveEmbeddingProviderFromEnv,
  scoreEmbeddingPair,
} from "./embeddingProvider.js";
import {
  getSpotlightMilvusClient,
  isSpotlightMilvusConfigured,
  resolveSpotlightMilvusEmbeddingDim,
  SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
} from "./milvusClient.js";

export interface MilvusSemanticMemoryStoreOptions {
  projectId: string;
  tenantId?: string;
  embeddingProvider?: EmbeddingProvider | null;
}

/** L1 semantic cache in Milvus (Spotlight 独立 DB / collection，与 Yuxi kb_* 隔离). */
export class MilvusSemanticMemoryStore {
  private readonly projectId: string;
  private readonly tenantId: string;
  private readonly embeddingProvider: EmbeddingProvider | null;
  private collectionReady: Promise<void> | null = null;

  constructor(options: MilvusSemanticMemoryStoreOptions) {
    this.projectId = options.projectId;
    this.tenantId = options.tenantId?.trim() || "default";
    this.embeddingProvider =
      options.embeddingProvider === undefined
        ? resolveEmbeddingProviderFromEnv()
        : options.embeddingProvider;
  }

  static isAvailable(): boolean {
    return isSpotlightMilvusConfigured();
  }

  private async ensureCollection(): Promise<void> {
    if (!this.collectionReady) {
      this.collectionReady = this.initCollection();
    }
    await this.collectionReady;
  }

  private async initCollection(): Promise<void> {
    const client = await getSpotlightMilvusClient();
    if (!client) throw new Error("Milvus client unavailable");
    const { DataType, IndexType, MetricType } = await import(
      "@zilliz/milvus2-sdk-node"
    );
    const dim = resolveSpotlightMilvusEmbeddingDim();
    const name = SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION;
    const exists = await client.hasCollection({ collection_name: name });
    if (!exists.value) {
      await client.createCollection({
        collection_name: name,
        fields: [
          {
            name: "id",
            data_type: DataType.VarChar,
            is_primary_key: true,
            max_length: 128,
          },
          {
            name: "project_id",
            data_type: DataType.VarChar,
            max_length: 128,
          },
          {
            name: "tenant_id",
            data_type: DataType.VarChar,
            max_length: 128,
          },
          {
            name: "question_norm",
            data_type: DataType.VarChar,
            max_length: 2048,
          },
          {
            name: "entry_json",
            data_type: DataType.VarChar,
            max_length: 65_535,
          },
          {
            name: "embedding",
            data_type: DataType.FloatVector,
            dim,
          },
        ],
      });
      await client.createIndex({
        collection_name: name,
        field_name: "embedding",
        index_type: IndexType.AUTOINDEX,
        metric_type: MetricType.COSINE,
      });
    }
    await client.loadCollectionSync({ collection_name: name });
  }

  async put(entry: SpotlightMemoryEntry, embedding?: number[] | null): Promise<void> {
    await this.ensureCollection();
    const client = await getSpotlightMilvusClient();
    if (!client) return;
    await client.upsert({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      data: [
        {
          id: entry.id,
          project_id: entry.projectId,
          tenant_id: this.tenantId,
          question_norm: entry.questionNorm,
          entry_json: JSON.stringify(entry),
          embedding: embedding ?? [],
        },
      ],
    });
  }

  async putWithOptionalEmbedding(entry: SpotlightMemoryEntry): Promise<void> {
    let embedding: number[] | null = null;
    if (this.embeddingProvider) {
      try {
        embedding = await this.embeddingProvider.embed(entry.questionNorm);
      } catch {
        embedding = null;
      }
    }
    await this.put(entry, embedding);
  }

  async findSimilar(
    projectId: string,
    questionNorm: string,
    limit = 5,
  ): Promise<Array<{ entry: SpotlightMemoryEntry; score: number }>> {
    if (projectId !== this.projectId) return [];
    await this.ensureCollection();
    const client = await getSpotlightMilvusClient();
    if (!client) return [];

    let queryEmbedding: number[] | null = null;
    if (this.embeddingProvider) {
      try {
        queryEmbedding = await this.embeddingProvider.embed(questionNorm);
      } catch {
        queryEmbedding = null;
      }
    }

    if (queryEmbedding?.length) {
      const search = await client.search({
        collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
        data: [queryEmbedding],
        limit: Math.max(limit, 8),
        filter: `project_id == "${escapeMilvusExpr(projectId)}" && tenant_id == "${escapeMilvusExpr(this.tenantId)}"`,
        output_fields: ["entry_json", "question_norm"],
      });
      const hits = search.results ?? [];
      const scored: Array<{ entry: SpotlightMemoryEntry; score: number }> = [];
      for (const hit of hits) {
        const entryJson = String(hit.entry_json ?? "");
        let entry: SpotlightMemoryEntry;
        try {
          entry = JSON.parse(entryJson) as SpotlightMemoryEntry;
        } catch {
          continue;
        }
        const lexical = scoreQuestionSimilarity(questionNorm, entry.questionNorm);
        const vectorScore =
          typeof hit.score === "number"
            ? Math.max(0, Math.min(1, (hit.score + 1) / 2))
            : 0;
        const score = Math.max(lexical, vectorScore);
        if (score <= 0) continue;
        scored.push({ entry, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    }

    return this.findSimilarLexical(projectId, questionNorm, limit);
  }

  private async findSimilarLexical(
    projectId: string,
    questionNorm: string,
    limit: number,
  ): Promise<Array<{ entry: SpotlightMemoryEntry; score: number }>> {
    const client = await getSpotlightMilvusClient();
    if (!client) return [];
    const query = await client.query({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      filter: `project_id == "${escapeMilvusExpr(projectId)}" && tenant_id == "${escapeMilvusExpr(this.tenantId)}"`,
      output_fields: ["entry_json", "question_norm"],
      limit: 200,
    });
    const scored: Array<{ entry: SpotlightMemoryEntry; score: number }> = [];
    for (const row of query.data ?? []) {
      try {
        const entry = JSON.parse(String(row.entry_json)) as SpotlightMemoryEntry;
        const score = scoreQuestionSimilarity(questionNorm, entry.questionNorm);
        if (score <= 0) continue;
        scored.push({ entry, score });
      } catch {
        continue;
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async touch(entryId: string): Promise<void> {
    const client = await getSpotlightMilvusClient();
    if (!client) return;
    const query = await client.query({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      filter: `id == "${escapeMilvusExpr(entryId)}"`,
      output_fields: ["id", "project_id", "tenant_id", "question_norm", "entry_json", "embedding"],
      limit: 1,
    });
    const row = query.data?.[0];
    if (!row) return;
    try {
      const entry = JSON.parse(String(row.entry_json)) as SpotlightMemoryEntry;
      entry.hitCount += 1;
      entry.lastHitAt = Date.now();
      await this.put(entry, row.embedding as number[] | null);
    } catch {
      /* ignore */
    }
  }

  listEntries(limit = 50): SpotlightMemoryEntry[] {
    void limit;
    return [];
  }

  deleteEntry(entryId: string): boolean {
    void entryId;
    return false;
  }

  deleteAll(_projectId: string): number {
    return 0;
  }

  count(projectId?: string): number {
    void projectId;
    return 0;
  }
}

function escapeMilvusExpr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
