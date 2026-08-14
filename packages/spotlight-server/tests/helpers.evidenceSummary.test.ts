import { describe, expect, it } from "vitest";
import { evidenceProgressSummary } from "../src/workflow/helpers.js";

describe("evidenceProgressSummary", () => {
  it("lists source titles as a numbered list", () => {
    expect(
      evidenceProgressSummary("联网搜索", "我想了解下引大济岷", [
        { content: "a", title: "引大济岷工程 - 维基百科" },
        { content: "b", title: "引大济岷，不只是借大渡河水解岷江之困" },
        { content: "c", title: "四川为什么需要引大济岷" },
      ]),
    ).toBe(
      [
        "联网搜索检索“我想了解下引大济岷”命中 3 条资料：",
        "1. 引大济岷工程 - 维基百科",
        "2. 引大济岷，不只是借大渡河水解岷江之困",
        "3. 四川为什么需要引大济岷",
      ].join("\n"),
    );
  });
});
