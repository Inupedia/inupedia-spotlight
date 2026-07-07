import { join } from "node:path";
import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";

export interface PackMemoryPaths {
  root: string;
  exactDir: string;
  exactIndexPath: string;
  exactEntriesPath: string;
  semanticDir: string;
  semanticDbPath: string;
  metaPath: string;
}

/** Resolve pack-scoped memory directories (mirrors assets.jsonl layout). */
export function resolvePackMemoryDir(
  packsRoot: string,
  projectId: string,
): PackMemoryPaths {
  const root = join(packsRoot, projectId, "memory");
  const exactDir = join(root, "exact");
  return {
    root,
    exactDir,
    exactIndexPath: join(exactDir, "index.json"),
    exactEntriesPath: join(exactDir, "entries.jsonl"),
    semanticDir: join(root, "semantic"),
    semanticDbPath: join(root, "semantic", "memory.db"),
    metaPath: join(root, "meta.json"),
  };
}

export interface PackMemoryMeta {
  version: string;
  exactCount: number;
  semanticCount: number;
  updatedAt: string;
}

export function defaultPackMemoryMeta(): PackMemoryMeta {
  return {
    version: "1",
    exactCount: 0,
    semanticCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

export type { SpotlightMemoryEntry };
