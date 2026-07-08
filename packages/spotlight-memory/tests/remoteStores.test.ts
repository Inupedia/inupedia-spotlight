import { describe, expect, it, afterEach } from "vitest";
import { buildMilvusSemanticFilter } from "../src/node/milvusExpr.js";
import {
  validateMilvusEmbedding,
} from "../src/node/milvusSemanticStore.js";
import {
  resolveEffectiveSemanticMemoryBackend,
  isRemoteMemoryBackend,
} from "../src/node/memoryBackends.js";
import { createMemoryGate } from "../src/node/gate.js";
import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";
import { isMemoryEntryStale } from "../src/index.js";

describe("milvus semantic filters", () => {
  it("includes expiry and session scope in filter expression", () => {
    const filter = buildMilvusSemanticFilter({
      projectId: "demo",
      tenantId: "tenant-a",
      now: 1_700_000_000_000,
      scopes: [{ scope: "session", sessionId: "s1" }],
    });
    expect(filter).toContain('project_id == "demo"');
    expect(filter).toContain('tenant_id == "tenant-a"');
    expect(filter).toContain("expires_at > 1700000000000");
    expect(filter).toContain('scope == "session"');
    expect(filter).toContain('session_id == "s1"');
  });
});

describe("milvus embedding validation", () => {
  it("rejects empty or wrong-dimension vectors", () => {
    expect(validateMilvusEmbedding([], 1024)).toBe(false);
    expect(validateMilvusEmbedding([0.1, 0.2], 1024)).toBe(false);
    expect(validateMilvusEmbedding(Array.from({ length: 1024 }, () => 0.1), 1024)).toBe(
      true,
    );
  });
});

describe("semantic backend resolution", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("falls back to sqlite when milvus is configured without embedding provider", () => {
    process.env.SPOTLIGHT_MILVUS_URI = "http://127.0.0.1:19530";
    delete process.env.SPOTLIGHT_MEMORY_EMBEDDING_PROVIDER;
    expect(resolveEffectiveSemanticMemoryBackend()).toBe("sqlite");
  });

  it("marks redis/milvus as remote for meta counts", () => {
    expect(
      isRemoteMemoryBackend({ exact: "redis", semantic: "sqlite" }),
    ).toBe(true);
    expect(
      isRemoteMemoryBackend({ exact: "file", semantic: "milvus" }),
    ).toBe(true);
    expect(
      isRemoteMemoryBackend({ exact: "file", semantic: "sqlite" }),
    ).toBe(false);
  });
});

describe("gate semantic candidate selection", () => {
  it("skips stale top hit and returns the next viable candidate", async () => {
    const fresh: SpotlightMemoryEntry = {
      id: "fresh",
      projectId: "p1",
      questionNorm: "打开监控",
      kind: "action_plan",
      answer: "fresh answer long enough",
      invalidation: { catalogVersion: "c2" },
      ttlSec: 3600,
      createdAt: Date.now(),
      hitCount: 0,
      confidence: 0.95,
    };
    const stale: SpotlightMemoryEntry = {
      ...fresh,
      id: "stale",
      invalidation: { catalogVersion: "c1" },
    };
    const reader = {
      getExact: async () => null,
      findSemantic: async () => [
        { entry: stale, score: 0.99 },
        { entry: fresh, score: 0.93 },
      ],
      touch: async () => {},
    };
    const writer = {
      putExact: async () => {},
      putSemantic: async () => {},
      hasExact: async () => false,
    };
    const gate = createMemoryGate(reader, writer, { semanticThreshold: 0.92 });
    const lookup = await gate.lookup({
      projectId: "p1",
      question: "打开监控",
      invalidation: { catalogVersion: "c2" },
    });
    expect(lookup.hit).toBe(true);
    if (lookup.hit) {
      expect(lookup.result.entry.id).toBe("fresh");
    }
    expect(isMemoryEntryStale(stale, { catalogVersion: "c2" })).toBe(true);
  });
});
