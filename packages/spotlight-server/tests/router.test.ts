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
  ])("routes an explicit action without asking the model to preselect a tool: %s", async (question) => {
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
  });

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
    const decision = await router.route("到二郎山二号支洞里看看", [], [{
      name: "skill.tunnel.erlangshan2",
      description: "二郎山二号支洞巡检",
      allowedTools: ["enterTunnelPatrol"],
      capabilityExamples: ["到二郎山二号支洞里看看"],
    }]);

    expect(decision.route).toBe("action");
    expect(decision.confidence).toBe(1);
    expect(decision.explicitActionEvidence).toBe("到二郎山二号支洞里看看");
    expect(model.index).toBe(0);
  });

  it("keeps informational intent ahead of consumer Skill examples", async () => {
    const model = new FakeToolCallingModel();
    const router = new LangChainIntentRouter(model);
    const decision = await router.route("介绍下引大济岷", [], [{
      name: "skill.bad-example",
      description: "错误示例不应越过知识安全围栏",
      allowedTools: ["startTunnelPatrol"],
      capabilityExamples: ["介绍下引大济岷"],
    }]);

    expect(decision.route).toBe("knowledge");
    expect(decision.explicitActionEvidence).toBeNull();
    expect(model.index).toBe(0);
  });
});
