import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";
import { scoreQuestionSimilarity } from "../normalize.js";
import type { PackMemoryPaths } from "./paths.js";
import {
  entryMatchesLookupScopes,
  isMemoryEntryExpired,
} from "./memoryEntryScope.js";
import type { SemanticLookupOptions, SemanticWriteResult } from "./memoryStoreTypes.js";
import {
  type EmbeddingProvider,
  resolveEmbeddingProviderFromEnv,
  scoreEmbeddingPair,
} from "./embeddingProvider.js";

type SemanticRow = {
  entry_json: string;
  embedding_json: string | null;
};

export interface SemanticMemoryStoreOptions {
  paths: PackMemoryPaths;
  embeddingProvider?: EmbeddingProvider | null;
}

/** L1 semantic cache backed by SQLite; BM25/bigram fallback, optional embeddings. */
export class SemanticMemoryStore {
  private readonly db: DatabaseSync;
  private readonly embeddingProvider: EmbeddingProvider | null;

  constructor(options: SemanticMemoryStoreOptions) {
    mkdirSync(options.paths.semanticDir, { recursive: true });
    this.embeddingProvider =
      options.embeddingProvider === undefined
        ? resolveEmbeddingProviderFromEnv()
        : options.embeddingProvider;
    this.db = new DatabaseSync(options.paths.semanticDbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        question_norm TEXT NOT NULL,
        entry_json TEXT NOT NULL,
        embedding_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_semantic_project ON entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_semantic_question ON entries(question_norm);
    `);
  }

  put(entry: SpotlightMemoryEntry, embedding?: number[] | null): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entries (id, project_id, question_norm, entry_json, embedding_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.id,
      entry.projectId,
      entry.questionNorm,
      JSON.stringify(entry),
      embedding?.length ? JSON.stringify(embedding) : null,
    );
  }

  async putWithOptionalEmbedding(
    entry: SpotlightMemoryEntry,
  ): Promise<SemanticWriteResult> {
    let embedding: number[] | null = null;
    if (this.embeddingProvider) {
      try {
        embedding = await this.embeddingProvider.embed(entry.questionNorm);
      } catch {
        embedding = null;
      }
    }
    this.put(entry, embedding);
    return { written: true };
  }

  async findSimilar(
    projectId: string,
    questionNorm: string,
    limit = 5,
    options?: SemanticLookupOptions,
  ): Promise<Array<{ entry: SpotlightMemoryEntry; score: number }>> {
    const rows = this.db
      .prepare(
        `SELECT entry_json, embedding_json FROM entries WHERE project_id = ?`,
      )
      .all(projectId) as SemanticRow[];

    let queryEmbedding: number[] | null = null;
    if (this.embeddingProvider) {
      try {
        queryEmbedding = await this.embeddingProvider.embed(questionNorm);
      } catch {
        queryEmbedding = null;
      }
    }

    const now = options?.now ?? Date.now();
    const scored: Array<{ entry: SpotlightMemoryEntry; score: number }> = [];
    for (const row of rows) {
      let entry: SpotlightMemoryEntry;
      try {
        entry = JSON.parse(row.entry_json) as SpotlightMemoryEntry;
      } catch {
        continue;
      }
      if (isMemoryEntryExpired(entry, now)) continue;
      if (
        options?.scopes?.length &&
        !entryMatchesLookupScopes(entry, options.scopes)
      ) {
        continue;
      }
      const lexical = scoreQuestionSimilarity(questionNorm, entry.questionNorm);
      let embeddingScore = 0;
      if (queryEmbedding && row.embedding_json) {
        try {
          const stored = JSON.parse(row.embedding_json) as number[];
          embeddingScore = scoreEmbeddingPair(queryEmbedding, stored);
        } catch {
          embeddingScore = 0;
        }
      }
      const score = Math.max(lexical, embeddingScore);
      if (score <= 0) continue;
      scored.push({ entry, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  touch(entryId: string): void {
    const row = this.db
      .prepare(`SELECT entry_json FROM entries WHERE id = ?`)
      .get(entryId) as { entry_json: string } | undefined;
    if (!row) return;
    try {
      const entry = JSON.parse(row.entry_json) as SpotlightMemoryEntry;
      entry.hitCount += 1;
      entry.lastHitAt = Date.now();
      this.db
        .prepare(`UPDATE entries SET entry_json = ? WHERE id = ?`)
        .run(JSON.stringify(entry), entryId);
    } catch {
      /* ignore corrupt row */
    }
  }

  async listEntries(limit = 50): Promise<SpotlightMemoryEntry[]> {
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(500, Math.floor(limit)) : 50;
    const rows = this.db
      .prepare(`SELECT entry_json FROM entries ORDER BY json_extract(entry_json, '$.createdAt') DESC LIMIT ?`)
      .all(safeLimit) as Array<{ entry_json: string }>;
    const entries: SpotlightMemoryEntry[] = [];
    for (const row of rows) {
      try {
        entries.push(JSON.parse(row.entry_json) as SpotlightMemoryEntry);
      } catch {
        /* skip */
      }
    }
    return entries;
  }

  async deleteEntry(entryId: string): Promise<boolean> {
    const result = this.db
      .prepare(`DELETE FROM entries WHERE id = ?`)
      .run(entryId);
    return Number(result.changes) > 0;
  }

  async deleteAll(projectId: string): Promise<number> {
    const result = this.db
      .prepare(`DELETE FROM entries WHERE project_id = ?`)
      .run(projectId);
    return Number(result.changes);
  }

  async count(projectId?: string): Promise<number> {
    if (projectId) {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS total FROM entries WHERE project_id = ?`)
        .get(projectId) as { total: number | bigint };
      return Number(row.total);
    }
    const row = this.db
      .prepare(`SELECT COUNT(*) AS total FROM entries`)
      .get() as { total: number | bigint };
    return Number(row.total);
  }
}
