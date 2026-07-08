import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";
import type { MemoryGate } from "./gate.js";
import { createMemoryGate, type MemoryGateConfig } from "./gate.js";
import type { MemoryStoreReader, MemoryStoreWriter } from "./gate.js";
import { ExactMemoryStore } from "./exactStore.js";
import { refreshPackMemoryMeta } from "./meta.js";
import {
  resolveExactMemoryBackend,
  resolveSemanticMemoryBackend,
} from "./memoryBackends.js";
import { MilvusSemanticMemoryStore } from "./milvusSemanticStore.js";
import { resolvePackMemoryDir, type PackMemoryPaths } from "./paths.js";
import { RedisExactMemoryStore } from "./redisExactStore.js";
import { SemanticMemoryStore } from "./semanticStore.js";

export interface SemanticMemoryStoreLike {
  findSimilar(
    projectId: string,
    questionNorm: string,
    limit?: number,
  ): Promise<Array<{ entry: SpotlightMemoryEntry; score: number }>>;
  putWithOptionalEmbedding(entry: SpotlightMemoryEntry): Promise<void>;
  touch(entryId: string): void | Promise<void>;
  count(projectId?: string): number;
}

export interface ExactMemoryStoreLike {
  getExact(cacheKey: string): Promise<SpotlightMemoryEntry | null>;
  putExact(cacheKey: string, entry: SpotlightMemoryEntry): Promise<void>;
  hasExact(cacheKey: string): Promise<boolean>;
  touch(entryId: string): Promise<void>;
  listEntries(limit?: number): SpotlightMemoryEntry[];
}

export interface PackMemoryStores {
  paths: PackMemoryPaths;
  exact: ExactMemoryStoreLike;
  semantic: SemanticMemoryStoreLike;
  gate: MemoryGate;
  backends: {
    exact: "file" | "redis";
    semantic: "sqlite" | "milvus";
  };
}

function createCompositeMemoryStores(
  paths: PackMemoryPaths,
  exact: ExactMemoryStoreLike,
  semantic: SemanticMemoryStoreLike,
  projectId: string,
): { reader: MemoryStoreReader; writer: MemoryStoreWriter } {
  const reader: MemoryStoreReader = {
    getExact: (cacheKey) => exact.getExact(cacheKey),
    findSemantic: (pid, questionNorm, limit) =>
      semantic.findSimilar(pid, questionNorm, limit),
    touch: async (entryId) => {
      await exact.touch(entryId);
      await semantic.touch(entryId);
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

function createExactStore(params: {
  paths: PackMemoryPaths;
  projectId: string;
  tenantId?: string;
  lruMax?: number;
}): ExactMemoryStoreLike {
  const backend = resolveExactMemoryBackend();
  if (backend === "redis" && RedisExactMemoryStore.isAvailable()) {
    return new RedisExactMemoryStore({
      projectId: params.projectId,
      tenantId: params.tenantId,
      lruMax: params.lruMax,
    });
  }
  return new ExactMemoryStore({
    paths: params.paths,
    lruMax: params.lruMax,
  });
}

function createSemanticStore(params: {
  paths: PackMemoryPaths;
  projectId: string;
  tenantId?: string;
}): SemanticMemoryStoreLike {
  const backend = resolveSemanticMemoryBackend();
  if (backend === "milvus" && MilvusSemanticMemoryStore.isAvailable()) {
    return new MilvusSemanticMemoryStore({
      projectId: params.projectId,
      tenantId: params.tenantId,
    });
  }
  return new SemanticMemoryStore({ paths: params.paths });
}

export function createPackMemoryStores(params: {
  packsRoot: string;
  projectId: string;
  tenantId?: string;
  gateConfig?: MemoryGateConfig;
  lruMax?: number;
}): PackMemoryStores {
  const paths = resolvePackMemoryDir(params.packsRoot, params.projectId);
  const exactBackend = resolveExactMemoryBackend();
  const semanticBackend = resolveSemanticMemoryBackend();
  const exact = createExactStore({
    paths,
    projectId: params.projectId,
    tenantId: params.tenantId,
    lruMax: params.lruMax,
  });
  const semantic = createSemanticStore({
    paths,
    projectId: params.projectId,
    tenantId: params.tenantId,
  });
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
  return {
    paths,
    exact,
    semantic,
    gate,
    backends: {
      exact:
        exactBackend === "redis" && RedisExactMemoryStore.isAvailable()
          ? "redis"
          : "file",
      semantic:
        semanticBackend === "milvus" && MilvusSemanticMemoryStore.isAvailable()
          ? "milvus"
          : "sqlite",
    },
  };
}

export { ExactMemoryStore } from "./exactStore.js";
export { SemanticMemoryStore } from "./semanticStore.js";
export { MilvusSemanticMemoryStore } from "./milvusSemanticStore.js";
export { RedisExactMemoryStore } from "./redisExactStore.js";
export {
  resolveExactMemoryBackend,
  resolveSemanticMemoryBackend,
} from "./memoryBackends.js";
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
export {
  getSpotlightRedisClient,
  isSpotlightRedisConfigured,
  spotlightRedisKey,
} from "./redisClient.js";
export {
  getSpotlightMilvusClient,
  isSpotlightMilvusConfigured,
  resolveSpotlightMilvusDb,
  SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION,
} from "./milvusClient.js";
export {
  FILE_MEMORY_ENTRYPOINT,
  appendSpotlightFileMemory,
  buildSpotlightFileMemoryPrompt,
  ensureSpotlightFileMemoryEntrypoints,
  isSpotlightFileMemoryPath,
  loadSpotlightFileMemories,
  resolveAgentMemoryDir,
  resolveAgentMemoryEntrypoint,
  resolveSpotlightFileMemoryPaths,
  type BuildSpotlightFileMemoryPromptOptions,
  type LoadSpotlightFileMemoryOptions,
  type ResolveSpotlightFileMemoryPathsOptions,
  type SpotlightFileMemoryInfo,
  type SpotlightFileMemoryPaths,
  type SpotlightFileMemoryScope,
} from "./fileMemory.js";
