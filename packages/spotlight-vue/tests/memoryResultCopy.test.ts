import { describe, expect, it } from "vitest";
import { getSpotlightMemoryResultCopy } from "../src/store/memoryResultCopy.js";

describe("memory result copy", () => {
  it("distinguishes exact and semantic reuse", () => {
    expect(getSpotlightMemoryResultCopy("exact").heading).toContain("相同问题");
    expect(getSpotlightMemoryResultCopy("semantic").heading).toContain(
      "高度相关",
    );
  });

  it("uses the safe exact copy when replay metadata is unavailable", () => {
    expect(getSpotlightMemoryResultCopy()).toEqual(
      getSpotlightMemoryResultCopy("exact"),
    );
  });
});
