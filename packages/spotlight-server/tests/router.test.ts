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
});
