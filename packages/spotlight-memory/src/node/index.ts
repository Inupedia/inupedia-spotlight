import type { MemoryGate } from "./gate.js";
import { createMemoryGate, type MemoryGateConfig } from "./gate.js";
import type { MemoryStoreReader, MemoryStoreWriter } from "./gate.js";
import { ExactMemoryStore } from "./exactStore.js";
import { refreshPackMemoryMeta } from "./meta.js";
import { resolvePackMemoryDir, type PackMemoryPaths } from "./paths.js";
import { SemanticMemoryStore } from "./semanticStore.js";

export interface PackMemoryStores {
  paths: PackMemoryPaths;
  exact: ExactMemoryStore;
  semantic: SemanticMemoryStore;
  gate: MemoryGate;
}

function createCompositeMemoryStores(
  paths: PackMemoryPaths,
  exact: ExactMemoryStore,
  semantic: SemanticMemoryStore,
  projectId: string,
): { reader: MemoryStoreReader; writer: MemoryStoreWriter } {
  const reader: MemoryStoreReader = {
    getExact: (cacheKey) => exact.getExact(cacheKey),
    findSemantic: (pid, questionNorm, limit) =>
      semantic.findSimilar(pid, questionNorm, limit),
    touch: async (entryId) => {
      await exact.touch(entryId);
      semantic.touch(entryId);
    },
  };
  const writer: MemoryStoreWriter = {
    putExact: (cacheKey, entry) => exact.putExact(cacheKey, entry),
    putSemantic: async (entry) => {
      await semantic.putWithOptionalEmbedding(entry);
      refreshPackMemoryMeta({
        paths,
        exactCount: exact.listEntries(Number.MAX_SAFE_INTEGER).length,
        semanticCount: semantic.count(projectId),
      });
    },
    hasExact: (cacheKey) => exact.hasExact(cacheKey),
  };
  return { reader, writer };
}

export function createPackMemoryStores(params: {
  packsRoot: string;
  projectId: string;
  gateConfig?: MemoryGateConfig;
  lruMax?: number;
}): PackMemoryStores {
  const paths = resolvePackMemoryDir(params.packsRoot, params.projectId);
  const exact = new ExactMemoryStore({ paths, lruMax: params.lruMax });
  const semantic = new SemanticMemoryStore({ paths });
  const { reader, writer } = createCompositeMemoryStores(
    paths,
    exact,
    semantic,
    params.projectId,
  );
  const gate = createMemoryGate(reader, writer, params.gateConfig);
  refreshPackMemoryMeta({
    paths,
    exactCount: exact.listEntries(Number.MAX_SAFE_INTEGER).length,
    semanticCount: semantic.count(params.projectId),
  });
  return { paths, exact, semantic, gate };
}

export { ExactMemoryStore } from "./exactStore.js";
export { SemanticMemoryStore } from "./semanticStore.js";
export {
  buildCacheKey,
  createMemoryEntryId,
} from "./cacheKey.js";
export {
  createMemoryGate,
  type MemoryGate,
  type MemoryGateConfig,
  type MemoryStoreReader,
  type MemoryStoreWriter,
} from "./gate.js";
export {
  defaultPackMemoryMeta,
  resolvePackMemoryDir,
  type PackMemoryMeta,
  type PackMemoryPaths,
} from "./paths.js";
export {
  readPackMemoryMeta,
  refreshPackMemoryMeta,
  writePackMemoryMeta,
} from "./meta.js";
export {
  type EmbeddingProvider,
  resolveEmbeddingProviderFromEnv,
} from "./embeddingProvider.js";
