import { describe, expect, it } from "vitest";
import {
  parseGatherProcessDisplay,
  stripInternalEvidenceAnswer,
} from "../src/store/pipeline/displayText.js";

describe("parseGatherProcessDisplay", () => {
  it("turns a semicolon dump into a numbered source list", () => {
    expect(
      parseGatherProcessDisplay(
        "联网搜索检索“我想了解下引大济岷”命中 6 条资料：引大济岷工程 - 维基百科；引大济岷，不只是借大渡河水解岷江之困丨省情所长说 - 四川新闻；四川为什么需要引大济岷。 正在依据资料组织回答。",
      ),
    ).toEqual({
      headline: "联网搜索检索“我想了解下引大济岷”命中 6 条资料",
      items: [
        "引大济岷工程 - 维基百科",
        "引大济岷，不只是借大渡河水解岷江之困丨省情所长说 - 四川新闻",
        "四川为什么需要引大济岷",
      ],
      note: "正在依据资料组织回答。",
    });
  });

  it("keeps an already numbered source list", () => {
    expect(
      parseGatherProcessDisplay(
        "联网搜索检索“引大济岷”命中 2 条资料：\n1. 引大济岷工程 - 维基百科\n2. 四川为什么需要引大济岷\n正在依据资料组织回答。",
      ),
    ).toEqual({
      headline: "联网搜索检索“引大济岷”命中 2 条资料",
      items: ["引大济岷工程 - 维基百科", "四川为什么需要引大济岷"],
      note: "正在依据资料组织回答。",
    });
  });
});

describe("stripInternalEvidenceAnswer", () => {
  it("keeps a synthesized answer that mentions Hikari only as a citation label", () => {
    expect(
      stripInternalEvidenceAnswer(
        "Hikari answer：引大济岷是一项跨流域调水工程。工程从大渡河引水补充岷江。",
      ),
    ).toContain("引大济岷是一项跨流域调水工程。");
  });

  it("does not wipe a normal knowledge answer", () => {
    expect(
      stripInternalEvidenceAnswer("引大济岷是一项跨流域调水工程。"),
    ).toBe("引大济岷是一项跨流域调水工程。");
  });
});
