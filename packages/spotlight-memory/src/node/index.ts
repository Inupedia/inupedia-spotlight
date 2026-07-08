import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";
import type { MemoryGate } from "./gate.js";
import { createMemoryGate, type MemoryGateConfig } from "./gate.js";
import type { MemoryStoreReader, MemoryStoreWriter } from "./gate.js";
import { ExactMemoryStore } from "./exactStore.js";
import { refreshPackMemoryMeta } from "./meta.js";
import {
  isRemoteMemoryBackend,
  resolveEffectiveSemanticMemoryBackend,
  resolveExactMemoryBackend,
  type ExactMemoryBackend,
  type SemanticMemoryBackend,
} from "./memoryBackends.js";
import { MilvusSemanticMemoryStore } from "./milvusSemanticStore.js";
import { resolvePackMemoryDir, type PackMemoryPaths } from "./paths.js";
import { RedisExactMemoryStore } from "./redisExactStore.js";
import { SemanticMemoryStore } from "./semanticStore.js";
import type { MemoryEntryScope } from "./memoryEntryScope.js";
import type { SemanticLookupOptions, SemanticWriteResult } from "./memoryStoreTypes.js";
import { logMemoryEvent } from "./memoryLog.js";

export interface SemanticMemoryStoreLike {
  findSimilar(
    projectId: string,
    questionNorm: string,
    limit?: number,
    options?: SemanticLookupOptions,
  ): Promise<Array<{ entry: SpotlightMemoryEntry; score: number }>>;
  putWithOptionalEmbedding(
    entry: SpotlightMemoryEntry,
  ): Promise<SemanticWriteResult>;
  touch(entryId: string): void | Promise<void>;
  count(projectId?: string): number | Promise<number>;
  listEntries(limit?: number): SpotlightMemoryEntry[] | Promise<SpotlightMemoryEntry[]>;
  deleteEntry(entryId: string): boolean | Promise<boolean>;
  deleteAll(projectId: string): number | Promise<number>;
}

export interface ExactMemoryStoreLike {
  getExact(cacheKey: string): Promise<SpotlightMemoryEntry | null>;
  putExact(cacheKey: string, entry: SpotlightMemoryEntry): Promise<void>;
  hasExact(cacheKey: string): Promise<boolean>;
  touch(entryId: string): Promise<void>;
  listEntries(limit?: number): SpotlightMemoryEntry[] | Promise<SpotlightMemoryEntry[]>;
  deleteEntry(entryId: string): boolean | Promise<boolean>;
  deleteAll(projectId: string): number | Promise<number>;
  count?(projectId?: string): number | Promise<number>;
}

export interface PackMemoryStores {
  paths: PackMemoryPaths;
  exact: ExactMemoryStoreLike;
  semantic: SemanticMemoryStoreLike;
  gate: MemoryGate;
  backends: {
    exact: ExactMemoryBackend;
    semantic: SemanticMemoryBackend;
    countsAvailable: boolean;
  };
}

async function resolveStoreCount(
  store: { count?(projectId?: string): number | Promise<number> },
  projectId: string,
): Promise<number> {
  if (!store.count) return 0;
  return Promise.resolve(store.count(projectId));
}

async function refreshLocalMetaIfAvailable(params: {
  paths: PackMemoryPaths;
  exact: ExactMemoryStoreLike;
  semantic: SemanticMemoryStoreLike;
  projectId: string;
  backends: PackMemoryStores["backends"];
}): Promise<void> {
  if (!params.backends.countsAvailable) {
    refreshPackMemoryMeta({
      paths: params.paths,
      exactBackend: params.backends.exact,
      semanticBackend: params.backends.semantic,
      countsAvailable: false,
    });
    return;
  }
  refreshPackMemoryMeta({
    paths: params.paths,
    exactCount: (await Promise.resolve(params.exact.listEntries(Number.MAX_SAFE_INTEGER))).length,
    semanticCount: await resolveStoreCount(params.semantic, params.projectId),
    exactBackend: params.backends.exact,
    semanticBackend: params.backends.semantic,
    countsAvailable: true,
  });
}

function createCompositeMemoryStores(
  paths: PackMemoryPaths,
  exact: ExactMemoryStoreLike,
  semantic: SemanticMemoryStoreLike,
  projectId: string,
  backends: PackMemoryStores["backends"],
): { reader: MemoryStoreReader; writer: MemoryStoreWriter } {
  const reader: MemoryStoreReader = {
    getExact: (cacheKey) => exact.getExact(cacheKey),
    findSemantic: (pid, questionNorm, limit, lookupScopes) =>
      semantic.findSimilar(pid, questionNorm, limit, {
        scopes: lookupScopes as
          | Array<{ scope: MemoryEntryScope; sessionId?: string }>
          | undefined,
      }),
    touch: async (entryId) => {
      await exact.touch(entryId);
      await semantic.touch(entryId);
    },
  };
  const writer: MemoryStoreWriter = {
    putExact: (cacheKey, entry) => exact.putExact(cacheKey, entry),
    putSemantic: async (entry) => {
      const result = await semantic.putWithOptionalEmbedding(entry);
      if (!result.written) {
        logMemoryEvent("semantic_write_skipped", {
          projectId: entry.projectId,
          entryId: entry.id,
          reason: result.skippedReason,
          exactBackend: backends.exact,
          semanticBackend: backends.semantic,
        });
        return;
      }
      await refreshLocalMetaIfAvailable({
        paths,
        exact,
        semantic,
        projectId,
        backends,
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
}): { store: ExactMemoryStoreLike; backend: ExactMemoryBackend } {
  const backend = resolveExactMemoryBackend();
  if (backend === "redis" && RedisExactMemoryStore.isAvailable()) {
    return {
      backend: "redis",
      store: new RedisExactMemoryStore({
        projectId: params.projectId,
        tenantId: params.tenantId,
        lruMax: params.lruMax,
      }),
    };
  }
  return {
    backend: "file",
    store: new ExactMemoryStore({
      paths: params.paths,
      lruMax: params.lruMax,
    }),
  };
}

function createSemanticStore(params: {
  paths: PackMemoryPaths;
  projectId: string;
  tenantId?: string;
}): { store: SemanticMemoryStoreLike; backend: SemanticMemoryBackend } {
  const backend = resolveEffectiveSemanticMemoryBackend();
  if (backend === "milvus" && MilvusSemanticMemoryStore.isAvailable()) {
    return {
      backend: "milvus",
      store: new MilvusSemanticMemoryStore({
        projectId: params.projectId,
        tenantId: params.tenantId,
      }),
    };
  }
  return {
    backend: "sqlite",
    store: new SemanticMemoryStore({ paths: params.paths }),
  };
}

export function createPackMemoryStores(params: {
  packsRoot: string;
  projectId: string;
  tenantId?: string;
  gateConfig?: MemoryGateConfig;
  lruMax?: number;
}): PackMemoryStores {
  const paths = resolvePackMemoryDir(params.packsRoot, params.projectId);
  const { store: exact, backend: exactBackend } = createExactStore({
    paths,
    projectId: params.projectId,
    tenantId: params.tenantId,
    lruMax: params.lruMax,
  });
  const { store: semantic, backend: semanticBackend } = createSemanticStore({
    paths,
    projectId: params.projectId,
    tenantId: params.tenantId,
  });
  const backends = {
    exact: exactBackend,
    semantic: semanticBackend,
    countsAvailable: !isRemoteMemoryBackend({
      exact: exactBackend,
      semantic: semanticBackend,
    }),
  };
  const { reader, writer } = createCompositeMemoryStores(
    paths,
    exact,
    semantic,
    params.projectId,
    backends,
  );
  const gate = createMemoryGate(reader, writer, params.gateConfig);
  void refreshLocalMetaIfAvailable({
    paths,
    exact,
    semantic,
    projectId: params.projectId,
    backends,
  });
  return {
    paths,
    exact,
    semantic,
    gate,
    backends,
  };
}

export { ExactMemoryStore } from "./exactStore.js";
export { SemanticMemoryStore } from "./semanticStore.js";
export {
  MilvusSemanticMemoryStore,
  isMilvusEmbeddingReady,
  validateMilvusEmbedding,
} from "./milvusSemanticStore.js";
export { RedisExactMemoryStore } from "./redisExactStore.js";
export {
  resolveExactMemoryBackend,
  resolveSemanticMemoryBackend,
  resolveEffectiveSemanticMemoryBackend,
  isRemoteMemoryBackend,
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
export type {
  SemanticLookupOptions,
  SemanticWriteResult,
} from "./memoryStoreTypes.js";
export {
  resolveMemoryEntryScopeFields,
  entryMatchesLookupScopes,
  isMemoryEntryExpired,
} from "./memoryEntryScope.js";
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
