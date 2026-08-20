import {
  formatObservedState,
  observedStatePromptBlock,
} from "../src/workflow/observedState.js";
import { buildKnowledgeSynthesizeMessages } from "../src/workflow/synthesize.js";
import { emptyEvidenceBundle } from "../src/workflow/evidence.js";

describe("observed page state", () => {
  it("renders a stable, sorted view so identical pages produce identical prompts", () => {
    const a = formatObservedState({
      selectedTunnelId: 7,
      route: "/tunnel",
      activeTab: "monitoring",
    });
    const b = formatObservedState({
      activeTab: "monitoring",
      route: "/tunnel",
      selectedTunnelId: 7,
    });

    expect(a).toBe(b);
    expect(a).toBe(
      ["activeTab: monitoring", "route: /tunnel", "selectedTunnelId: 7"].join(
        "\n",
      ),
    );
  });

  it("drops empty values instead of feeding the model noise", () => {
    expect(
      formatObservedState({
        route: "/tunnel",
        selected: null,
        notes: "   ",
        empty: {},
      }),
    ).toBe("route: /tunnel");
  });

  it("produces nothing when the host reported no context", () => {
    expect(observedStatePromptBlock(undefined)).toBe("");
    expect(observedStatePromptBlock({})).toBe("");
  });

  it("tells the synthesizer to trust the measurement over the conversation", () => {
    const block = observedStatePromptBlock({ activeVideoChannel: "1号洞口" });
    const [system] = buildKnowledgeSynthesizeMessages({
      question: "当前在放哪个监控",
      evidence: emptyEvidenceBundle(),
      sessionPrompt: "",
      projectPrompt: "",
      memoryContext: "",
      observedPrompt: block,
    });

    expect(String(system.content)).toContain("activeVideoChannel: 1号洞口");
    expect(String(system.content)).toContain("Observed page state");
  });
});
