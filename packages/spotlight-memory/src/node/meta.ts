import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ExactMemoryBackend, SemanticMemoryBackend } from "./memoryBackends.js";
import {
  defaultPackMemoryMeta,
  type PackMemoryMeta,
  type PackMemoryPaths,
} from "./paths.js";

export function readPackMemoryMeta(paths: PackMemoryPaths): PackMemoryMeta {
  if (!existsSync(paths.metaPath)) return defaultPackMemoryMeta();
  try {
    return JSON.parse(readFileSync(paths.metaPath, "utf8")) as PackMemoryMeta;
  } catch {
    return defaultPackMemoryMeta();
  }
}

export function writePackMemoryMeta(
  paths: PackMemoryPaths,
  meta: PackMemoryMeta,
): void {
  mkdirSync(paths.root, { recursive: true });
  writeFileSync(paths.metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

export function refreshPackMemoryMeta(params: {
  paths: PackMemoryPaths;
  exactCount?: number;
  semanticCount?: number;
  exactBackend?: ExactMemoryBackend;
  semanticBackend?: SemanticMemoryBackend;
  countsAvailable?: boolean;
}): PackMemoryMeta {
  const countsAvailable = params.countsAvailable ?? true;
  const meta: PackMemoryMeta = {
    version: "2",
    updatedAt: new Date().toISOString(),
    exactBackend: params.exactBackend,
    semanticBackend: params.semanticBackend,
    countsAvailable,
  };
  if (countsAvailable) {
    meta.exactCount = params.exactCount ?? 0;
    meta.semanticCount = params.semanticCount ?? 0;
  }
  writePackMemoryMeta(params.paths, meta);
  return meta;
}
