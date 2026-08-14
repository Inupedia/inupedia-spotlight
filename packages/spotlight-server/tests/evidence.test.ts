import { describe, expect, it } from "vitest";
import {
  applyEvidenceUpdate,
  emptyEvidenceBundle,
  evidenceFromSource,
  mergeEvidenceBundles,
  resetEvidenceBundle,
} from "../src/workflow/evidence.js";

describe("evidence bundle merge", () => {
  it("marks no sources as none", () => {
    expect(emptyEvidenceBundle().sufficiency).toBe("none");
  });

  it("keeps enough when both sources return items", () => {
    const merged = mergeEvidenceBundles(
      evidenceFromSource({
        source: "知识库",
        items: [{ content: "a", title: "A" }],
        summary: "知识库命中 1 条",
        attempted: true,
        completed: true,
      }),
      evidenceFromSource({
        source: "联网搜索",
        items: [{ content: "b", title: "B" }],
        summary: "联网搜索命中 1 条",
        attempted: true,
        completed: true,
      }),
    );
    expect(merged.sufficiency).toBe("enough");
    expect(merged.items).toHaveLength(2);
    expect(merged.citations).toEqual(["A", "B"]);
  });

  it("drops checkpointed evidence when the next turn starts", () => {
    const previous = evidenceFromSource({
      source: "联网搜索",
      items: [{ content: "old", title: "介绍下引大济岷" }],
      summary: "联网搜索检索“介绍下引大济岷”命中 1 条资料：介绍下引大济岷。",
      attempted: true,
      completed: true,
    });
    const reset = applyEvidenceUpdate(previous, resetEvidenceBundle());
    expect(reset.items).toEqual([]);
    expect(reset.sourceSummaries).toEqual([]);

    const current = applyEvidenceUpdate(
      reset,
      evidenceFromSource({
        source: "联网搜索",
        items: [{ content: "new", title: "监控点位清单" }],
        summary: "联网搜索检索“目前有哪些监控”命中 1 条资料：监控点位清单。",
        attempted: true,
        completed: true,
      }),
    );
    expect(current.items.map((item) => item.title)).toEqual(["监控点位清单"]);
    expect(current.sourceSummaries.join("\n")).not.toContain("介绍下引大济岷");
  });

  it("omits vendor evidence titles from citations", () => {
    const bundle = evidenceFromSource({
      source: "联网搜索",
      items: [
        { content: "摘要", title: "Hikari answer" },
        { content: "正文", title: "引大济岷工程" },
      ],
      summary: "命中",
      attempted: true,
      completed: true,
    });
    expect(bundle.citations).toEqual(["引大济岷工程"]);
  });

  it("becomes partial when one source fails and another hits", () => {
    const merged = mergeEvidenceBundles(
      evidenceFromSource({
        source: "知识库",
        items: [{ content: "a", title: "A" }],
        summary: "知识库命中 1 条",
        attempted: true,
        completed: true,
      }),
      evidenceFromSource({
        source: "联网搜索",
        summary: "联网搜索失败",
        attempted: true,
        failed: true,
      }),
    );
    expect(merged.sufficiency).toBe("partial");
  });
});
