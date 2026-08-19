import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { finalAgentText } from "../src/workflow/state.js";
import {
  fallbackReplyFromEvidence,
  formatEvidenceForPrompt,
} from "../src/workflow/synthesize.js";
import { evidenceFromSource } from "../src/workflow/evidence.js";

describe("finalAgentText", () => {
  it("skips tool results and empty tool-call AI messages", () => {
    expect(
      finalAgentText({
        messages: [
          new HumanMessage("介绍下引大济岷"),
          new AIMessage({ content: "", tool_calls: [{ id: "1", name: "read_file", args: {}, type: "tool_call" }] }),
          new ToolMessage({ content: "SKILL.md", tool_call_id: "1" }),
          new AIMessage("引大济岷是一项跨流域调水工程。"),
        ],
      }),
    ).toBe("引大济岷是一项跨流域调水工程。");
  });

  it("reads a bare AI message from model.invoke", () => {
    expect(finalAgentText(new AIMessage("整理后的回答"))).toBe("整理后的回答");
  });
});

describe("evidence synthesis fallback", () => {
  it("formats untitled Hikari answers without vendor labels", () => {
    expect(
      formatEvidenceForPrompt([
        { content: "引大济岷是一项跨流域调水工程。" },
        {
          title: "引大济岷工程 - 维基百科",
          url: "https://example.com/wiki",
          content: "从大渡河引水补充岷江。",
        },
      ]),
    ).toContain("资料 1");
    expect(
      formatEvidenceForPrompt([
        { content: "引大济岷是一项跨流域调水工程。" },
      ]),
    ).not.toMatch(/Hikari|Tavily|untitled/i);
  });

  it("uses the search answer when the model returns no text", () => {
    const evidence = evidenceFromSource({
      source: "联网搜索",
      items: [
        { content: "引大济岷是一项跨流域调水工程。" },
        { title: "引大济岷工程 - 维基百科", content: "从大渡河引水补充岷江。" },
      ],
      summary: "命中 2 条",
      attempted: true,
      completed: true,
    });
    expect(fallbackReplyFromEvidence(evidence)).toContain(
      "引大济岷是一项跨流域调水工程。",
    );
    expect(fallbackReplyFromEvidence(evidence)).toContain("引大济岷工程 - 维基百科");
  });
});
