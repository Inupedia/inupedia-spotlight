import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import { FakeToolCallingModel } from "langchain";
import type { FrontendToolDescriptorV1, HostToolResultRequest } from "@inupedia/spotlight-protocol";
import {
  runSpotlightGraph,
  langChainClientToolName,
  memoryNamespace,
  type IntentDecision,
  type IntentRouter,
  type ProjectPack,
} from "../src/index.js";

const descriptor: FrontendToolDescriptorV1 = {
  name: "panel.playVideoMonitoringFullscreenByName",
  version: "1.0.0",
  description: "按名称打开视频监控",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
  sideEffect: "ui",
  replayPolicy: "never",
  riskLevel: "low",
};

function router(decision: IntentDecision): IntentRouter {
  return {
    async route() {
      return decision;
    },
  };
}

function pack(): ProjectPack {
  return { projectId: "test-project", serverTools: [] };
}

function context(
  question: string,
  hostResults: HostToolResultRequest[],
  options: { sessionId?: string; memorySubjectId?: string } = {},
) {
  return {
    request: {
      projectId: "test-project",
      sessionId: options.sessionId ?? crypto.randomUUID(),
      memorySubjectId: options.memorySubjectId,
      userQuestion: question,
      clientToolManifest: {
        protocolVersion: "spotlight.capabilities/1" as const,
        projectId: "test-project",
        frontendBuildId: "test",
        manifestDigest: "test-digest",
        tools: [descriptor],
      },
    },
    runId: crypto.randomUUID(),
    project: pack(),
    host: {
      async request(call: { id: string; name: string; input: Record<string, unknown>; displayName: string }) {
        hostResults.push({
          correlationId: call.id,
          success: true,
          output: { opened: call.input.name },
        });
        return {
          correlationId: call.id,
          success: true,
          output: { opened: call.input.name },
        };
      },
    },
    signal: new AbortController().signal,
  };
}

describe("LangGraph runtime isolation", () => {
  it("never exposes a client tool to the knowledge agent", async () => {
    const hostResults: HostToolResultRequest[] = [];
    const phases: Array<{ phase: string; summary: string }> = [];
    const result = await runSpotlightGraph(context("介绍下引大济岷", hostResults), {
      model: new FakeToolCallingModel(),
      router: router({
        route: "knowledge",
        confidence: 1,
        reason: "information request",
        requestedToolNames: [],
        explicitActionEvidence: null,
      }),
      checkpointer: new MemorySaver(),
      store: new InMemoryStore(),
      onPhase: (phase, summary) => phases.push({ phase, summary }),
    });
    expect(result.route).toBe("knowledge");
    expect(result.invokedClientTools).toEqual([]);
    expect(hostResults).toEqual([]);
    expect(phases).toContainEqual(
      expect.objectContaining({
        phase: "router_done",
        summary: expect.stringContaining("识别为知识问答"),
      }),
    );
    expect(phases).toContainEqual({
      phase: "knowledge_agent_done",
      summary: "本轮未调用项目知识库、联网搜索或服务端资料工具；回答仅依据模型与当前项目上下文生成。",
    });
  });

  it("reports the real knowledge query, hit count, and source titles", async () => {
    const hostResults: HostToolResultRequest[] = [];
    const runContext = context("介绍下引大济岷", hostResults);
    runContext.project = {
      ...runContext.project,
      knowledgeProvider: {
        id: "yuxi",
        async search({ query }) {
          expect(query).toBe("引大济岷 工程介绍");
          return [
            { title: "引大济岷工程概况", content: "工程概况正文" },
            { title: "工程线路与规模", content: "线路资料" },
          ];
        },
      },
    };
    const phases: Array<{ phase: string; summary: string }> = [];
    await runSpotlightGraph(runContext, {
      model: new FakeToolCallingModel({
        toolCalls: [
          [
            {
              id: "knowledge-call-1",
              name: "project_knowledge_search",
              args: { query: "引大济岷 工程介绍" },
              type: "tool_call",
            },
          ],
          [],
        ],
      }),
      router: router({
        route: "knowledge",
        confidence: 1,
        reason: "information request",
        requestedToolNames: [],
        explicitActionEvidence: null,
      }),
      checkpointer: new MemorySaver(),
      store: new InMemoryStore(),
      onPhase: (phase, summary) => phases.push({ phase, summary }),
    });

    expect(phases).toContainEqual(
      expect.objectContaining({
        phase: "knowledge_agent_start",
        summary: "正在检索项目知识库“yuxi”：“引大济岷 工程介绍”。",
      }),
    );
    expect(phases).toContainEqual(
      expect.objectContaining({
        phase: "knowledge_agent_done",
        summary: expect.stringMatching(/命中 2 条资料.*引大济岷工程概况.*工程线路与规模/u),
      }),
    );
  });

  it("executes the selected client tool through the host bridge", async () => {
    const hostResults: HostToolResultRequest[] = [];
    const phases: Array<{ phase: string; summary: string }> = [];
    const result = await runSpotlightGraph(context("打开钢筋棚加工区室外监控", hostResults), {
      model: new FakeToolCallingModel({
        toolCalls: [
          [
            {
              id: "call-1",
              name: langChainClientToolName(descriptor.name),
              args: { name: "钢筋棚加工区室外" },
              type: "tool_call",
            },
          ],
          [],
        ],
      }),
      router: router({
        route: "action",
        confidence: 0.99,
        reason: "explicit action",
        requestedToolNames: [descriptor.name],
        explicitActionEvidence: "打开",
      }),
      checkpointer: new MemorySaver(),
      store: new InMemoryStore(),
      onPhase: (phase, summary) => phases.push({ phase, summary }),
    });
    expect(result.route).toBe("action");
    expect(result.invokedClientTools).toEqual([descriptor.name]);
    expect(hostResults).toHaveLength(1);
    expect(phases).toContainEqual(
      expect.objectContaining({
        phase: "action_agent_done",
        summary: expect.stringContaining(`“${descriptor.description}”（${descriptor.name}）`),
      }),
    );
  });

  it("persists short-term messages for the same session", async () => {
    const checkpointer = new MemorySaver();
    const store = new InMemoryStore();
    const sessionId = crypto.randomUUID();
    const options = {
      model: new FakeToolCallingModel(),
      router: router({
        route: "knowledge" as const,
        confidence: 1,
        reason: "information request",
        requestedToolNames: [],
        explicitActionEvidence: null,
      }),
      checkpointer,
      store,
    };
    await runSpotlightGraph(context("第一轮问题", [], { sessionId }), options);
    const second = await runSpotlightGraph(context("第二轮问题", [], { sessionId }), options);
    expect(second.assistantReply).toContain("第一轮问题");
    expect(second.assistantReply).toContain("第二轮问题");
  });

  it("does not mutate long-term memory during an ordinary knowledge turn", async () => {
    const store = new InMemoryStore();
    const subjectId = "user-ordinary";
    await runSpotlightGraph(context("介绍下引大济岷", [], { memorySubjectId: subjectId }), {
      model: new FakeToolCallingModel(),
      router: router({
        route: "knowledge",
        confidence: 1,
        reason: "information request",
        requestedToolNames: [],
        explicitActionEvidence: null,
      }),
      checkpointer: new MemorySaver(),
      store,
    });
    expect(await store.search(memoryNamespace("test-project", subjectId))).toEqual([]);
  });

  it("writes and deletes long-term memory only through explicit memory tools", async () => {
    const store = new InMemoryStore();
    const subjectId = "user-memory";
    const baseOptions = {
      router: router({
        route: "knowledge" as const,
        confidence: 1,
        reason: "explicit memory control",
        requestedToolNames: [],
        explicitActionEvidence: null,
      }),
      checkpointer: new MemorySaver(),
      store,
    };
    await runSpotlightGraph(context("记住我偏好简洁回答", [], { memorySubjectId: subjectId }), {
      ...baseOptions,
      model: new FakeToolCallingModel({
        toolCalls: [
          [
            {
              id: "remember-1",
              name: "remember_user_preference",
              args: { key: "answer-style", value: "简洁回答" },
              type: "tool_call",
            },
          ],
          [],
        ],
      }),
    });
    const namespace = memoryNamespace("test-project", subjectId);
    expect((await store.search(namespace)).map((item) => item.key)).toContain("answer-style");

    await runSpotlightGraph(context("忘记我的回答风格偏好", [], { memorySubjectId: subjectId }), {
      ...baseOptions,
      model: new FakeToolCallingModel({
        toolCalls: [
          [
            {
              id: "forget-1",
              name: "forget_user_preference",
              args: { key: "answer-style" },
              type: "tool_call",
            },
          ],
          [],
        ],
      }),
    });
    expect(await store.search(namespace)).toEqual([]);
  });
});
