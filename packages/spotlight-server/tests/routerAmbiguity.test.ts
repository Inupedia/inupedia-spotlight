import { FakeToolCallingModel } from "langchain";
import { describe, expect, it } from "vitest";
import {
  hasUnresolvedExplicitActionTarget,
  LangChainIntentRouter,
} from "../src/router.js";

describe("referential action routing", () => {
  it("clarifies a target-required action when the target is only an unresolved pronoun", async () => {
    expect(hasUnresolvedExplicitActionTarget("打开那个", "打开")).toBe(true);
    expect(hasUnresolvedExplicitActionTarget("打开", "打开")).toBe(true);

    const router = new LangChainIntentRouter(new FakeToolCallingModel());
    const decision = await router.route("打开那个", [], []);

    expect(decision.route).toBe("clarify");
    expect(decision.requestedToolNames).toEqual([]);
  });

  it("does not force clarification when conversational context can resolve the reference", () => {
    expect(
      hasUnresolvedExplicitActionTarget("打开那个", "打开", {
        isReferential: true,
        lastAssistantReply: "刚才展示的是图书《活着》。",
      }),
    ).toBe(false);
  });
});
