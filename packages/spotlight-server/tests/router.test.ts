import { FakeToolCallingModel } from "langchain";
import { LangChainIntentRouter } from "../src/index.js";

describe("LangChain intent router", () => {
  it("does not invoke the model for deterministic information intent", async () => {
    const model = new FakeToolCallingModel({
      structuredResponse: {
        route: "action",
        confidence: 1,
        reason: "wrong",
        requestedToolNames: ["startTunnelPatrol"],
      },
    });
    const router = new LangChainIntentRouter(model);
    for (let index = 0; index < 20; index += 1) {
      const decision = await router.route("介绍下引大济岷", []);
      expect(decision.route).toBe("knowledge");
      expect(decision.requestedToolNames).toEqual([]);
    }
    expect(model.index).toBe(0);
  });

  it.each([
    "返回项目主场景",
    "查看水工建筑物中场景",
    "切换主场景到工程总览",
    "进入二郎山二号支洞巡检",
  ])(
    "routes an explicit action without asking the model to preselect a tool: %s",
    async (question) => {
      const model = new FakeToolCallingModel({
        structuredResponse: {
          route: "clarify",
          confidence: 0,
          reason: "unstable model output",
          requestedToolNames: [],
        },
      });
      const router = new LangChainIntentRouter(model);
      const decision = await router.route(question, []);
      expect(decision.route).toBe("action");
      expect(decision.confidence).toBe(1);
      expect(decision.requestedToolNames).toEqual([]);
      expect(decision.explicitActionEvidence).not.toBeNull();
      expect(model.index).toBe(0);
    },
  );

  it("routes an exact consumer Skill capability example without generic action wording", async () => {
    const model = new FakeToolCallingModel({
      structuredResponse: {
        route: "clarify",
        confidence: 0,
        reason: "unstable model output",
        requestedToolNames: [],
      },
    });
    const router = new LangChainIntentRouter(model);
    const decision = await router.route(
      "到二郎山二号支洞里看看",
      [],
      [
        {
          name: "skill.tunnel.erlangshan2",
          description: "二郎山二号支洞巡检",
          allowedTools: ["enterTunnelPatrol"],
          capabilityExamples: ["到二郎山二号支洞里看看"],
        },
      ],
    );

    expect(decision.route).toBe("action");
    expect(decision.confidence).toBe(1);
    expect(decision.explicitActionEvidence).toBe("到二郎山二号支洞里看看");
    expect(model.index).toBe(0);
  });

  it("keeps informational intent ahead of consumer Skill examples", async () => {
    const model = new FakeToolCallingModel();
    const router = new LangChainIntentRouter(model);
    const decision = await router.route(
      "介绍下引大济岷",
      [],
      [
        {
          name: "skill.bad-example",
          description: "错误示例不应越过知识安全围栏",
          allowedTools: ["startTunnelPatrol"],
          capabilityExamples: ["介绍下引大济岷"],
        },
      ],
    );

    expect(decision.route).toBe("knowledge");
    expect(decision.explicitActionEvidence).toBeNull();
    expect(model.index).toBe(0);
  });

  it("routes an informational Skill example only to its read-only client tool", async () => {
    const model = new FakeToolCallingModel();
    const router = new LangChainIntentRouter(model);
    const decision = await router.route(
      "摄像头具体涉及了哪些场景",
      [
        {
          name: "getVideoInfo",
          version: "1.0.0",
          description: "查询摄像头覆盖场景",
          inputSchema: { type: "object", properties: {} },
          sideEffect: "none",
          replayPolicy: "safe",
          riskLevel: "low",
        },
      ],
      [
        {
          name: "skill.monitoring",
          description: "查询摄像头或打开监控",
          allowedTools: ["getVideoInfo"],
          capabilityExamples: ["摄像头具体涉及了哪些场景"],
        },
      ],
    );

    expect(decision.route).toBe("action");
    expect(decision.requestedToolNames).toEqual(["getVideoInfo"]);
    expect(decision.matchedSkillNames).toEqual(["skill.monitoring"]);
    expect(model.index).toBe(0);
  });

  it("uses structured output to narrow a multi-tool Skill to one registered tool", async () => {
    const model = new FakeToolCallingModel({
      structuredResponse: {
        toolName: "selectQualityYear",
        toolInput: { year: "2024" },
      },
    });
    const router = new LangChainIntentRouter(model);
    const tool = (name: string, description: string) => ({
      name,
      version: "1.0.0",
      description,
      inputSchema: { type: "object" as const, properties: {} },
      sideEffect: "ui" as const,
      replayPolicy: "never" as const,
      riskLevel: "low" as const,
    });
    const decision = await router.route(
      "查看2024年质量数据",
      [
        tool("selectQualitySegment", "切换质量标段"),
        tool("selectQualityYear", "切换质量年份"),
      ],
      [
        {
          name: "skill.progress.filters",
          description: "质量筛选",
          allowedTools: ["selectQualitySegment", "selectQualityYear"],
          capabilityExamples: ["查看2024年质量数据"],
        },
      ],
    );

    expect(decision.route).toBe("action");
    expect(decision.requestedToolNames).toEqual(["selectQualityYear"]);
    expect(decision.requestedToolInput).toEqual({ year: "2024" });
    expect(decision.matchedSkillNames).toEqual(["skill.progress.filters"]);
    expect(model.index).toBe(0);
  });

  it("prefers an exact Skill tool example without asking the model to guess", async () => {
    const model = new FakeToolCallingModel({
      structuredResponse: {
        toolName: "enterTunnelPatrol",
        toolInput: {},
      },
    });
    const router = new LangChainIntentRouter(model);
    const tool = (name: string, description: string) => ({
      name,
      version: "1.0.0",
      description,
      inputSchema: { type: "object" as const, properties: {} },
      sideEffect: "ui" as const,
      replayPolicy: "never" as const,
      riskLevel: "low" as const,
    });
    const decision = await router.route(
      "开始洞内巡检",
      [
        tool("enterTunnelPatrol", "进入巡检视图"),
        tool("startTunnelPatrol", "开始播放巡检"),
      ],
      [
        {
          name: "skill.tunnel.erlangshan2",
          description: "隧洞巡检",
          allowedTools: ["enterTunnelPatrol", "startTunnelPatrol"],
          toolExamples: [
            { example: "开始洞内巡检", toolName: "startTunnelPatrol" },
          ],
        },
      ],
    );

    expect(decision.requestedToolNames).toEqual(["startTunnelPatrol"]);
    expect(decision.requestedToolInput).toEqual({});
    expect(model.index).toBe(0);
  });
});
