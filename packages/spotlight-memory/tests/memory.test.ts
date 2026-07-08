import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyMemoryKind,
  isMemoryEntryStale,
  normalizeQuestion,
} from "../src/index.js";
import {
  appendSpotlightFileMemory,
  buildSpotlightFileMemoryPrompt,
  buildCacheKey,
  createMemoryGate,
  createPackMemoryStores,
  resolveAgentMemoryEntrypoint,
  resolveSpotlightFileMemoryPaths,
} from "../src/node/index.js";
import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";

describe("normalizeQuestion", () => {
  it("strips filler and whitespace", () => {
    expect(normalizeQuestion("请问  引大2号支洞  今天掘进多少米？")).toBe(
      "引大2号支洞今天掘进多少米",
    );
  });
});

describe("buildCacheKey", () => {
  it("changes when assets version changes", () => {
    const base = { projectId: "p1", questionNorm: "abc" };
    const a = buildCacheKey({
      ...base,
      invalidation: { assetsVersion: "v1" },
    });
    const b = buildCacheKey({
      ...base,
      invalidation: { assetsVersion: "v2" },
    });
    expect(a).not.toBe(b);
  });

  it("changes when knowledge version or session scope changes", () => {
    const base = {
      projectId: "p1",
      questionNorm: "abc",
      invalidation: { knowledgeIndexVersion: "k1" },
    };
    const project = buildCacheKey(base);
    const session = buildCacheKey({
      ...base,
      scope: "session",
      sessionId: "s1",
    });
    const changedKnowledge = buildCacheKey({
      ...base,
      invalidation: { knowledgeIndexVersion: "k2" },
    });
    expect(session).not.toBe(project);
    expect(changedKnowledge).not.toBe(project);
  });
});

describe("classifyMemoryKind", () => {
  it("blocks realtime data questions", () => {
    const result = classifyMemoryKind({
      question: "今天掘进多少米",
      hasToolPlan: false,
      hasTextAnswer: true,
      usedDataTools: true,
    });
    expect(result.kind).toBeNull();
    expect(result.blockedReason).toBe("realtime_data");
  });

  it("classifies action plans", () => {
    expect(
      classifyMemoryKind({
        question: "打开室外风机摄像头",
        hasToolPlan: true,
        hasTextAnswer: false,
        usedDataTools: false,
      }).kind,
    ).toBe("action_plan");
  });
});

describe("isMemoryEntryStale", () => {
  const entry: SpotlightMemoryEntry = {
    id: "mem-1",
    projectId: "p1",
    questionNorm: "test",
    kind: "data_snapshot",
    answer: "42m",
    invalidation: { assetsVersion: "v1" },
    ttlSec: 3600,
    createdAt: Date.now(),
    hitCount: 0,
    confidence: 0.9,
  };

  it("expires by ttl", () => {
    const stale = { ...entry, createdAt: Date.now() - 7200_000 };
    expect(isMemoryEntryStale(stale, { assetsVersion: "v1" })).toBe(true);
  });

  it("invalidates data_snapshot on assets version change", () => {
    expect(isMemoryEntryStale(entry, { assetsVersion: "v2" })).toBe(true);
  });

  it("invalidates qa_answer on knowledge version change", () => {
    expect(
      isMemoryEntryStale(
        {
          ...entry,
          kind: "qa_answer",
          invalidation: { knowledgeIndexVersion: "k1" },
        },
        { knowledgeIndexVersion: "k2" },
      ),
    ).toBe(true);
  });
});

describe("createMemoryGate", () => {
  it("exact hit returns cached entry", async () => {
    const store = new Map<string, SpotlightMemoryEntry>();
    const reader = {
      getExact: async (key: string) => store.get(key) ?? null,
      findSemantic: async () => [],
      touch: async () => {},
    };
    const writer = {
      putExact: async (key: string, entry: SpotlightMemoryEntry) => {
        store.set(key, entry);
      },
      putSemantic: async () => {},
      hasExact: async (key: string) => store.has(key),
    };
    const gate = createMemoryGate(reader, writer);

    const invalidation = { assetsVersion: "v1", catalogVersion: "c1" };
    const write = await gate.write({
      projectId: "p1",
      question: "项目概况是什么",
      kind: "qa_answer",
      answer: "引大济岷是…",
      invalidation,
      confidence: 0.95,
    });
    expect(write.written).toBe(true);

    const lookup = await gate.lookup({
      projectId: "p1",
      question: "请问项目概况是什么？",
      invalidation,
    });
    expect(lookup.hit).toBe(true);
    if (lookup.hit) {
      expect(lookup.result.source).toBe("exact");
      expect(lookup.result.entry.answer).toContain("引大济岷");
    }
  });
});

describe("SemanticMemoryStore", () => {
  let tempRoot = "";

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  });

  it("persists entries in sqlite and finds lexical matches", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "spotlight-memory-semantic-"));
    const packsRoot = join(tempRoot, "packs");
    mkdirSync(join(packsRoot, "demo"), { recursive: true });
    const stores = createPackMemoryStores({
      packsRoot,
      projectId: "demo",
      gateConfig: { semanticThreshold: 0.55 },
    });
    const invalidation = { catalogVersion: "c1" };
    await stores.gate.write({
      projectId: "demo",
      question: "项目概况是什么",
      kind: "qa_answer",
      answer: "这是项目概况说明，长度足够写入 semantic sqlite。",
      invalidation,
      confidence: 0.95,
    });

    const reloaded = createPackMemoryStores({
      packsRoot,
      projectId: "demo",
      gateConfig: { semanticThreshold: 0.55 },
    });
    const lookup = await reloaded.gate.lookup({
      projectId: "demo",
      question: "请问项目概况是什么？",
      invalidation,
    });
    expect(lookup.hit).toBe(true);
    if (lookup.hit) {
      expect(["exact", "semantic"]).toContain(lookup.result.source);
    }
    expect(reloaded.semantic.count("demo")).toBe(1);
  });

  it("keeps session memory isolated while allowing project fallback", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "spotlight-memory-scope-"));
    const packsRoot = join(tempRoot, "packs");
    mkdirSync(join(packsRoot, "demo"), { recursive: true });
    const stores = createPackMemoryStores({
      packsRoot,
      projectId: "demo",
      gateConfig: { semanticThreshold: 0.55 },
    });
    const invalidation = { catalogVersion: "c1" };
    await stores.gate.write({
      projectId: "demo",
      question: "项目概况是什么",
      kind: "qa_answer",
      answer: "这是公共项目概况。",
      invalidation,
      confidence: 0.95,
    });
    await stores.gate.write({
      projectId: "demo",
      sessionId: "s1",
      question: "我的当前任务是什么",
      kind: "qa_answer",
      answer: "这是 s1 的私有任务。",
      invalidation,
      confidence: 0.95,
    });

    const ownSession = await stores.gate.lookup({
      projectId: "demo",
      sessionId: "s1",
      question: "我的当前任务是什么",
      invalidation,
      exactOnly: true,
    });
    expect(ownSession.hit).toBe(true);

    const otherSession = await stores.gate.lookup({
      projectId: "demo",
      sessionId: "s2",
      question: "我的当前任务是什么",
      invalidation,
      exactOnly: true,
    });
    expect(otherSession.hit).toBe(false);

    const projectFallback = await stores.gate.lookup({
      projectId: "demo",
      sessionId: "s2",
      question: "项目概况是什么",
      invalidation,
      exactOnly: true,
    });
    expect(projectFallback.hit).toBe(true);
    if (projectFallback.hit) {
      expect(projectFallback.result.entry.answer).toContain("公共");
    }
  });
});

describe("file memory", () => {
  let tempRoot = "";

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  });

  it("loads project, auto, session, and agent memory into a prompt", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "spotlight-file-memory-"));
    const cwd = join(tempRoot, "workspace", "app");
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "CLAUDE.md"), "Project rule: use metric units.", "utf8");

    const memoryBase = join(tempRoot, "memory");
    const paths = resolveSpotlightFileMemoryPaths({
      projectId: "demo/project",
      sessionId: "s1",
      baseDir: memoryBase,
    });
    mkdirSync(paths.autoDir, { recursive: true });
    writeFileSync(paths.autoEntrypoint, "Auto memory: prefer tunnel context.", "utf8");
    mkdirSync(paths.sessionDir!, { recursive: true });
    writeFileSync(paths.sessionEntrypoint!, "Session memory: user is comparing reports.", "utf8");

    const agentPath = resolveAgentMemoryEntrypoint({
      projectId: "demo/project",
      agentType: "planner",
      scope: "user",
      baseDir: memoryBase,
      cwd,
    });
    mkdirSync(join(agentPath, ".."), { recursive: true });
    writeFileSync(agentPath, "Agent memory: ask for missing time range.", "utf8");

    const prompt = await buildSpotlightFileMemoryPrompt({
      projectId: "demo/project",
      sessionId: "s1",
      baseDir: memoryBase,
      cwd,
      agent: { type: "planner", scope: "user" },
    });

    expect(prompt).toContain("Project rule");
    expect(prompt).toContain("Auto memory");
    expect(prompt).toContain("Session memory");
    expect(prompt).toContain("Agent memory");
  });

  it("appends memory entries as markdown", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "spotlight-file-memory-append-"));
    const filePath = resolveSpotlightFileMemoryPaths({
      projectId: "demo",
      baseDir: tempRoot,
    }).autoEntrypoint;
    await appendSpotlightFileMemory({
      filePath,
      heading: "Preference",
      content: "用户偏好中文回答。",
    });
    const content = await buildSpotlightFileMemoryPrompt({
      projectId: "demo",
      baseDir: tempRoot,
      includeProjectFiles: false,
    });
    expect(content).toContain("用户偏好中文回答");
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", async () => {
    const { cosineSimilarity } = await import("../src/similarity.js");
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
  });
});

describe("ExactMemoryStore admin", () => {
  let tempRoot = "";

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  });

  it("lists and deletes persisted entries", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "spotlight-memory-admin-"));
    const packsRoot = join(tempRoot, "packs");
    mkdirSync(join(packsRoot, "demo"), { recursive: true });
    const { exact, gate } = createPackMemoryStores({
      packsRoot,
      projectId: "demo",
    });
    const invalidation = { assetsVersion: "v1", catalogVersion: "c1" };
    await gate.write({
      projectId: "demo",
      question: "memory admin list test",
      kind: "qa_answer",
      answer: "listed answer",
      invalidation,
      confidence: 0.95,
    });

    const listed = exact.listEntries(10);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.answer).toBe("listed answer");

    expect(exact.deleteEntry(listed[0]!.id)).toBe(true);
    expect(exact.listEntries(10)).toHaveLength(0);
  });
});
