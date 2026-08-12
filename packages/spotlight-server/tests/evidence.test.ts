import { describe, expect, it } from "vitest";
import {
  emptyEvidenceBundle,
  evidenceFromSource,
  mergeEvidenceBundles,
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
