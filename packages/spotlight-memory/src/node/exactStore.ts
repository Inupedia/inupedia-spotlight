import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";
import type { PackMemoryPaths } from "./paths.js";

type ExactIndex = Record<string, string>;

export interface ExactMemoryStoreOptions {
  paths: PackMemoryPaths;
  lruMax?: number;
}

/** L0 exact cache: jsonl persistence + in-process LRU + index.json. */
export class ExactMemoryStore {
  private readonly paths: PackMemoryPaths;
  private readonly lruMax: number;
  private index: ExactIndex = {};
  private entries = new Map<string, SpotlightMemoryEntry>();
  private lruKeys: string[] = [];

  constructor(options: ExactMemoryStoreOptions) {
    this.paths = options.paths;
    this.lruMax = options.lruMax ?? 500;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    mkdirSync(this.paths.exactDir, { recursive: true });
    if (existsSync(this.paths.exactIndexPath)) {
      try {
        this.index = JSON.parse(
          readFileSync(this.paths.exactIndexPath, "utf8"),
        ) as ExactIndex;
      } catch {
        this.index = {};
      }
    }
    if (!existsSync(this.paths.exactEntriesPath)) return;
    const lines = readFileSync(this.paths.exactEntriesPath, "utf8")
      .split("\n")
      .filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as SpotlightMemoryEntry;
        this.entries.set(entry.id, entry);
      } catch {
        /* skip corrupt line */
      }
    }
  }

  private persistIndex(): void {
    mkdirSync(this.paths.exactDir, { recursive: true });
    writeFileSync(
      this.paths.exactIndexPath,
      JSON.stringify(this.index, null, 2),
      "utf8",
    );
  }

  private appendEntry(entry: SpotlightMemoryEntry): void {
    mkdirSync(this.paths.exactDir, { recursive: true });
    appendFileSync(
      this.paths.exactEntriesPath,
      `${JSON.stringify(entry)}\n`,
      "utf8",
    );
  }

  private touchLru(cacheKey: string): void {
    this.lruKeys = this.lruKeys.filter((k) => k !== cacheKey);
    this.lruKeys.unshift(cacheKey);
    while (this.lruKeys.length > this.lruMax) {
      const evicted = this.lruKeys.pop();
      if (!evicted) break;
      const entryId = this.index[evicted];
      if (entryId) {
        delete this.index[evicted];
        this.entries.delete(entryId);
      }
    }
  }

  async getExact(cacheKey: string): Promise<SpotlightMemoryEntry | null> {
    const entryId = this.index[cacheKey];
    if (!entryId) return null;
    const entry = this.entries.get(entryId) ?? null;
    if (entry) this.touchLru(cacheKey);
    return entry;
  }

  async hasExact(cacheKey: string): Promise<boolean> {
    return Boolean(this.index[cacheKey]);
  }

  async putExact(
    cacheKey: string,
    entry: SpotlightMemoryEntry,
  ): Promise<void> {
    this.index[cacheKey] = entry.id;
    this.entries.set(entry.id, entry);
    this.touchLru(cacheKey);
    this.persistIndex();
    this.appendEntry(entry);
  }

  async touch(entryId: string): Promise<void> {
    const entry = this.entries.get(entryId);
    if (!entry) return;
    entry.hitCount += 1;
    entry.lastHitAt = Date.now();
  }

  async listEntries(limit = 50): Promise<SpotlightMemoryEntry[]> {
    return this.listEntriesSync(limit);
  }

  listEntriesSync(limit = 50): SpotlightMemoryEntry[] {
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(500, Math.floor(limit)) : 50;
    return [...this.entries.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, safeLimit);
  }

  async deleteEntry(entryId: string): Promise<boolean> {
    return this.deleteEntrySync(entryId);
  }

  deleteEntrySync(entryId: string): boolean {
    if (!this.entries.has(entryId)) return false;
    this.entries.delete(entryId);
    for (const [cacheKey, id] of Object.entries(this.index)) {
      if (id === entryId) delete this.index[cacheKey];
    }
    this.lruKeys = this.lruKeys.filter((cacheKey) => this.index[cacheKey] != null);
    this.persistIndex();
    this.rewriteEntriesFile();
    return true;
  }

  async deleteAll(projectId: string): Promise<number> {
    return this.deleteAllSync(projectId);
  }

  deleteAllSync(projectId: string): number {
    const ids = [...this.entries.values()]
      .filter((entry) => entry.projectId === projectId)
      .map((entry) => entry.id);
    let removed = 0;
    for (const entryId of ids) {
      if (this.deleteEntrySync(entryId)) removed += 1;
    }
    return removed;
  }

  async count(): Promise<number> {
    return this.entries.size;
  }

  /** @deprecated use async count() */
  countSync(): number {
    return this.entries.size;
  }

  private rewriteEntriesFile(): void {
    mkdirSync(this.paths.exactDir, { recursive: true });
    const lines = [...this.entries.values()].map((entry) => JSON.stringify(entry));
    writeFileSync(
      this.paths.exactEntriesPath,
      lines.length ? `${lines.join("\n")}\n` : "",
      "utf8",
    );
  }
}
