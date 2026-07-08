import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";
import { scoreQuestionSimilarity } from "../normalize.js";
import {
  type EmbeddingProvider,
  resolveEmbeddingProviderFromEnv,
} from "./embeddingProvider.js";
import {
  resolveMemoryEntryScopeFields,
  type MemoryEntryScope,
} from "./memoryEntryScope.js";
import { logMemoryEvent } from "./memoryLog.js";
import {
  buildMilvusSemanticFilter,
  escapeMilvusExpr,
} from "./milvusExpr.js";
import {
  getSpotlightMilvusClient,
  isSpotlightMilvusConfigured,
  resolveSpotlightMilvusEmbeddingDim,
  SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
} from "./milvusClient.js";

import type { SemanticLookupOptions, SemanticWriteResult } from "./memoryStoreTypes.js";

export interface MilvusSemanticMemoryStoreOptions {
  projectId: string;
  tenantId?: string;
  embeddingProvider?: EmbeddingProvider | null;
}

export function isMilvusEmbeddingReady(): boolean {
  return (
    isSpotlightMilvusConfigured() && resolveEmbeddingProviderFromEnv() != null
  );
}

export function validateMilvusEmbedding(
  embedding: number[] | null | undefined,
  dim = resolveSpotlightMilvusEmbeddingDim(),
): boolean {
  return Array.isArray(embedding) && embedding.length === dim;
}

/** L1 semantic recall in Milvus (Spotlight 独立 DB / collection，与 Yuxi kb_* 隔离). */
export class MilvusSemanticMemoryStore {
  private readonly projectId: string;
  private readonly tenantId: string;
  private readonly embeddingProvider: EmbeddingProvider | null;
  private readonly embeddingDim: number;
  private collectionReady: Promise<void> | null = null;

  constructor(options: MilvusSemanticMemoryStoreOptions) {
    this.projectId = options.projectId;
    this.tenantId = options.tenantId?.trim() || "default";
    this.embeddingDim = resolveSpotlightMilvusEmbeddingDim();
    this.embeddingProvider =
      options.embeddingProvider === undefined
        ? resolveEmbeddingProviderFromEnv()
        : options.embeddingProvider;
  }

  static isAvailable(): boolean {
    return isMilvusEmbeddingReady();
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
    const dim = this.embeddingDim;
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
            name: "scope",
            data_type: DataType.VarChar,
            max_length: 16,
          },
          {
            name: "session_id",
            data_type: DataType.VarChar,
            max_length: 128,
          },
          {
            name: "kind",
            data_type: DataType.VarChar,
            max_length: 64,
          },
          {
            name: "created_at",
            data_type: DataType.Int64,
          },
          {
            name: "expires_at",
            data_type: DataType.Int64,
          },
          {
            name: "question_norm",
            data_type: DataType.VarChar,
            max_length: 2048,
          },
          {
            name: "entry_json",
            data_type: DataType.VarChar,
            max_length: 65_536,
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

  async put(
    entry: SpotlightMemoryEntry,
    embedding: number[],
  ): Promise<void> {
    if (!validateMilvusEmbedding(embedding, this.embeddingDim)) {
      throw new Error("invalid_milvus_embedding");
    }
    await this.ensureCollection();
    const client = await getSpotlightMilvusClient();
    if (!client) return;
    const scopeFields = resolveMemoryEntryScopeFields(entry);
    await client.upsert({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      data: [
        {
          id: entry.id,
          project_id: entry.projectId,
          tenant_id: this.tenantId,
          scope: scopeFields.scope,
          session_id: scopeFields.sessionId,
          kind: scopeFields.kind,
          created_at: scopeFields.createdAt,
          expires_at: scopeFields.expiresAt,
          question_norm: entry.questionNorm,
          entry_json: JSON.stringify(entry),
          embedding,
        },
      ],
    });
  }

  async putWithOptionalEmbedding(
    entry: SpotlightMemoryEntry,
  ): Promise<SemanticWriteResult> {
    if (!this.embeddingProvider) {
      logMemoryEvent("semantic_write_skipped", {
        projectId: entry.projectId,
        entryId: entry.id,
        reason: "no_embedding",
        backend: "milvus",
      });
      return { written: false, skippedReason: "no_embedding" };
    }
    let embedding: number[] | null = null;
    try {
      embedding = await this.embeddingProvider.embed(entry.questionNorm);
    } catch (error) {
      logMemoryEvent("semantic_write_skipped", {
        projectId: entry.projectId,
        entryId: entry.id,
        reason: "embedding_failed",
        backend: "milvus",
        error: String(error),
      });
      return { written: false, skippedReason: "embedding_failed" };
    }
    if (!validateMilvusEmbedding(embedding, this.embeddingDim)) {
      logMemoryEvent("semantic_write_skipped", {
        projectId: entry.projectId,
        entryId: entry.id,
        reason: "invalid_embedding_dim",
        backend: "milvus",
        dim: this.embeddingDim,
        actualDim: embedding?.length ?? 0,
      });
      return { written: false, skippedReason: "invalid_embedding_dim" };
    }
    await this.put(entry, embedding as number[]);
    return { written: true };
  }

  async findSimilar(
    projectId: string,
    questionNorm: string,
    limit = 5,
    options?: SemanticLookupOptions,
  ): Promise<Array<{ entry: SpotlightMemoryEntry; score: number }>> {
    if (projectId !== this.projectId) return [];
    await this.ensureCollection();
    const client = await getSpotlightMilvusClient();
    if (!client) return [];
    const now = options?.now ?? Date.now();
    const filter = buildMilvusSemanticFilter({
      projectId,
      tenantId: this.tenantId,
      now,
      scopes: options?.scopes,
    });

    let queryEmbedding: number[] | null = null;
    if (this.embeddingProvider) {
      try {
        queryEmbedding = await this.embeddingProvider.embed(questionNorm);
      } catch {
        queryEmbedding = null;
      }
    }

    if (queryEmbedding && validateMilvusEmbedding(queryEmbedding, this.embeddingDim)) {
      const search = await client.search({
        collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
        data: [queryEmbedding],
        limit: Math.max(limit, 8),
        filter,
        output_fields: ["entry_json", "question_norm"],
      });
      return this.scoreMilvusHits(search.results ?? [], questionNorm, limit);
    }

    return this.findSimilarLexical(projectId, questionNorm, limit, filter);
  }

  private scoreMilvusHits(
    hits: Array<Record<string, unknown>>,
    questionNorm: string,
    limit: number,
  ): Array<{ entry: SpotlightMemoryEntry; score: number }> {
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

  private async findSimilarLexical(
    projectId: string,
    questionNorm: string,
    limit: number,
    filter: string,
  ): Promise<Array<{ entry: SpotlightMemoryEntry; score: number }>> {
    const client = await getSpotlightMilvusClient();
    if (!client) return [];
    const query = await client.query({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      filter,
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
      output_fields: [
        "id",
        "project_id",
        "tenant_id",
        "scope",
        "session_id",
        "kind",
        "created_at",
        "expires_at",
        "question_norm",
        "entry_json",
        "embedding",
      ],
      limit: 1,
    });
    const row = query.data?.[0];
    if (!row) return;
    try {
      const entry = JSON.parse(String(row.entry_json)) as SpotlightMemoryEntry;
      entry.hitCount += 1;
      entry.lastHitAt = Date.now();
      const embedding = row.embedding as number[];
      if (!validateMilvusEmbedding(embedding, this.embeddingDim)) return;
      await this.put(entry, embedding);
    } catch {
      /* ignore */
    }
  }

  async listEntries(limit = 50): Promise<SpotlightMemoryEntry[]> {
    await this.ensureCollection();
    const client = await getSpotlightMilvusClient();
    if (!client) return [];
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(500, Math.floor(limit)) : 50;
    const filter = buildMilvusSemanticFilter({
      projectId: this.projectId,
      tenantId: this.tenantId,
      now: Date.now(),
    });
    const query = await client.query({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      filter,
      output_fields: ["entry_json", "created_at"],
      limit: safeLimit,
    });
    const entries: SpotlightMemoryEntry[] = [];
    for (const row of query.data ?? []) {
      try {
        entries.push(JSON.parse(String(row.entry_json)) as SpotlightMemoryEntry);
      } catch {
        continue;
      }
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteEntry(entryId: string): Promise<boolean> {
    const client = await getSpotlightMilvusClient();
    if (!client) return false;
    const result = await client.delete({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      filter: `id == "${escapeMilvusExpr(entryId)}" && project_id == "${escapeMilvusExpr(this.projectId)}" && tenant_id == "${escapeMilvusExpr(this.tenantId)}"`,
    });
    const deleted = Number(result.delete_cnt ?? 0);
    return deleted > 0;
  }

  async deleteAll(projectId: string): Promise<number> {
    if (projectId !== this.projectId) return 0;
    const client = await getSpotlightMilvusClient();
    if (!client) return 0;
    const result = await client.delete({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      filter: `project_id == "${escapeMilvusExpr(projectId)}" && tenant_id == "${escapeMilvusExpr(this.tenantId)}"`,
    });
    return Number(result.delete_cnt ?? 0);
  }

  async count(projectId?: string): Promise<number> {
    if (projectId && projectId !== this.projectId) return 0;
    const client = await getSpotlightMilvusClient();
    if (!client) return 0;
    const filter = buildMilvusSemanticFilter({
      projectId: this.projectId,
      tenantId: this.tenantId,
      now: Date.now(),
    });
    const stats = await client.query({
      collection_name: SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
      filter,
      output_fields: ["count(*)"],
    });
    const row = stats.data?.[0] as { "count(*)": number | string } | undefined;
    return Number(row?.["count(*)"] ?? 0);
  }
}
