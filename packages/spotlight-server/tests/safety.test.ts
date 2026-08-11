import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import { actionToolAllowlist, applyIntentSafetyFence, memoryControlMode } from "../src/index.js";

const actionTool: FrontendToolDescriptorV1 = {
  name: "panel.playVideoMonitoringFullscreenByName",
  version: "1.0.0",
  description: "按名称打开视频监控",
  inputSchema: { type: "object" },
  sideEffect: "ui",
  replayPolicy: "never",
  riskLevel: "low",
};

describe("intent safety fence", () => {
  it.each(Array.from({ length: 20 }, (_, index) => index))(
    "routes an introduction request to knowledge consistently (%s)",
    () => {
      const decision = applyIntentSafetyFence("介绍下引大济岷", {
        route: "action",
        confidence: 0.98,
        reason: "bad model output",
        requestedToolNames: [actionTool.name],
        explicitActionEvidence: "开始",
      });
      expect(decision.route).toBe("knowledge");
      expect(actionToolAllowlist([actionTool], decision)).toEqual([]);
    },
  );

  it("allows an explicit low-risk UI action", () => {
    const decision = applyIntentSafetyFence("打开钢筋棚加工区室外监控", {
      route: "action",
      confidence: 0.98,
      reason: "explicit UI action",
      requestedToolNames: [actionTool.name],
      explicitActionEvidence: null,
    });
    expect(decision.route).toBe("action");
    expect(actionToolAllowlist([actionTool], decision)).toEqual([actionTool]);
  });

  it.each(["返回项目主场景", "继续隧洞巡检", "开启人员定位专注模式"])(
    "recognizes every supported action verb: %s",
    (question) => {
      const decision = applyIntentSafetyFence(question, {
        route: "action",
        confidence: 0.99,
        reason: "explicit UI action",
        requestedToolNames: [actionTool.name],
        explicitActionEvidence: null,
      });
      expect(decision.route).toBe("action");
      expect(decision.explicitActionEvidence).not.toBeNull();
    },
  );

  it("fails closed when the model selects action without action evidence", () => {
    const decision = applyIntentSafetyFence("钢筋棚加工区室外监控", {
      route: "action",
      confidence: 0.99,
      reason: "target only",
      requestedToolNames: [actionTool.name],
      explicitActionEvidence: null,
    });
    expect(decision.route).toBe("clarify");
    expect(actionToolAllowlist([actionTool], decision)).toEqual([]);
  });

  it("keeps explicit memory control out of the client action route", () => {
    const decision = applyIntentSafetyFence("记住我喜欢简洁回答", {
      route: "action",
      confidence: 0.99,
      reason: "bad model output",
      requestedToolNames: [actionTool.name],
      explicitActionEvidence: null,
    });
    expect(decision.route).toBe("knowledge");
    expect(actionToolAllowlist([actionTool], decision)).toEqual([]);
    expect(memoryControlMode("忘记我的偏好")).toBe("forget");
  });
});
