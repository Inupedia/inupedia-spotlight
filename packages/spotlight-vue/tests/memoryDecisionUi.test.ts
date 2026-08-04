import { ref } from "vue";
import { describe, expect, it } from "vitest";
import { useSpotlightPanelUi } from "../src/composables/useSpotlightPanelUi.js";

describe("memory decision UI", () => {
  it("shows an explicit reuse label", () => {
    const ui = useSpotlightPanelUi({
      pipelinePhase: ref("done"),
      loading: ref(false),
      memoryDecision: ref({
        action: "reuse",
        reasonCode: "exact_verified_answer",
        confidence: 1,
        memoryIds: ["mem-1"],
        canForceRefresh: true,
      }),
    });
    expect(ui.badgeLabel.value).toBe("已复用项目记忆");
  });

  it("distinguishes refreshed answers from cache reuse", () => {
    const ui = useSpotlightPanelUi({
      pipelinePhase: ref("done"),
      loading: ref(false),
      memoryDecision: ref({
        action: "refresh",
        reasonCode: "source_version_changed",
        confidence: 0,
        memoryIds: [],
        canForceRefresh: false,
      }),
    });
    expect(ui.badgeLabel.value).toBe("已重新验证资料");
  });
});
