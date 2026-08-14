import {
  inferKnowledgeSource,
  prefersProjectKnowledgeBase,
  resolveGatherSources,
} from "../src/knowledgeSource.js";

describe("knowledge source intent", () => {
  it("prefers web search for public introductions and news", () => {
    expect(inferKnowledgeSource("介绍下引大济岷")).toBe("web");
    expect(inferKnowledgeSource("最近有什么公开新闻")).toBe("web");
    expect(prefersProjectKnowledgeBase("项目是什么")).toBe(false);
  });

  it("prefers the project knowledge base for in-product facts", () => {
    expect(inferKnowledgeSource("这个模块是什么意思")).toBe("knowledge");
    expect(inferKnowledgeSource("知识库里进度指标含义")).toBe("knowledge");
  });

  it("does not fan out to Yuxi when web search is available", () => {
    expect(
      resolveGatherSources({
        question: "介绍下引大济岷",
        lane: "knowledge",
        hasKnowledge: true,
        hasWeb: true,
        hasServer: false,
      }),
    ).toEqual({ knowledge: false, web: true, server: false });
  });

  it("falls back to Yuxi when web search is not configured", () => {
    expect(
      resolveGatherSources({
        question: "介绍下引大济岷",
        lane: "knowledge",
        hasKnowledge: true,
        hasWeb: false,
        hasServer: false,
      }),
    ).toEqual({ knowledge: true, web: false, server: false });
  });

  it("uses the knowledge base for knowledge-then-action even if the question looks public", () => {
    expect(
      resolveGatherSources({
        question: "介绍下引大济岷",
        lane: "knowledge_then_action",
        knowledgeSource: "web",
        hasKnowledge: true,
        hasWeb: true,
        hasServer: false,
      }),
    ).toEqual({ knowledge: true, web: false, server: false });
  });
});
