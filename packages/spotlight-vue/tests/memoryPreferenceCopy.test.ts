import { describe, expect, it } from "vitest";
import {
  getSpotlightMemoryPreferenceCopy,
  SPOTLIGHT_MEMORY_PREFERENCE_LABEL,
} from "../src/store/memoryPreferenceCopy.js";

describe("memory preference copy", () => {
  it("labels the control by its read-memory behavior", () => {
    expect(SPOTLIGHT_MEMORY_PREFERENCE_LABEL).toBe("使用记忆");
  });

  it("explains that disabling reads does not disable knowledge accumulation", () => {
    const enabled = getSpotlightMemoryPreferenceCopy(true);
    const disabled = getSpotlightMemoryPreferenceCopy(false);

    expect(enabled.title).toContain("回答会参考历史记忆");
    expect(disabled.title).toContain("回答不参考历史记忆");
    expect(enabled.ariaLabel).toContain("仍允许系统积累项目知识");
    expect(disabled.ariaLabel).toContain("仍允许系统积累项目知识");
  });
});
