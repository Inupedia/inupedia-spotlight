import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  exactCount: number;
  semanticCount: number;
}): PackMemoryMeta {
  const meta: PackMemoryMeta = {
    version: "1",
    exactCount: params.exactCount,
    semanticCount: params.semanticCount,
    updatedAt: new Date().toISOString(),
  };
  writePackMemoryMeta(params.paths, meta);
  return meta;
}
