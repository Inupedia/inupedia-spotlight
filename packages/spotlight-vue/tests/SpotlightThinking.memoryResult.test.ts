import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import SpotlightThinking from "../src/components/SpotlightThinking.vue";

describe("SpotlightThinking memory result", () => {
  it("renders a completed reuse as an answer-first result instead of a fake execution timeline", async () => {
    const app = createSSRApp({
      render: () =>
        h(SpotlightThinking, {
          centered: true,
          steps: [
            {
              id: "1",
              label: "问题拆解",
              status: "done",
              content: "已命中项目记忆。",
            },
            {
              id: "2",
              label: "意图识别",
              status: "done",
              content: "识别为项目记忆复用。",
            },
            {
              id: "3",
              label: "执行工具与回答",
              status: "done",
              content: "这是历史验证过的回答。",
            },
          ],
          memoryReplay: {
            source: "exact",
            entryId: "memory-1",
            kind: "qa_answer",
          },
          memoryDecision: {
            action: "reuse",
            reasonCode: "exact_verified_answer",
            confidence: 1,
            memoryIds: ["memory-1"],
            canForceRefresh: true,
          },
        }),
    });

    const html = await renderToString(app);

    expect(html).toContain("项目记忆已回答");
    expect(html).toContain("来自项目记忆");
    expect(html).toContain("这是历史验证过的回答。");
    expect(html).toContain("重新查询最新资料");
    expect(html).not.toContain("执行状态概览");
    expect(html).not.toContain("问题拆解");
    expect(html).not.toContain("意图识别");
  });
});
