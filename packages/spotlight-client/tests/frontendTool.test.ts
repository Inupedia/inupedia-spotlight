import { describe, expect, it, vi } from "vitest";

import {
  createFrontendToolRegistry,
  defineFrontendTool,
  defineSpotlightProject,
  projectToolDescriptors,
} from "../src/tools/frontendTool.js";

describe("frontend Tool authoring", () => {
  it("projects JSON descriptors without serializing or invoking handlers", () => {
    const execute = vi.fn();
    const tool = defineFrontendTool({
      name: "video.open",
      version: "1.0.0",
      description: "Open a camera.",
      inputSchema: { type: "object" },
      sideEffect: "ui",
      replayPolicy: "never",
      execute,
    });
    const project = defineSpotlightProject({ projectId: "ydjm", tools: [tool] });

    expect(projectToolDescriptors(project)).toEqual([
      {
        name: "video.open",
        version: "1.0.0",
        description: "Open a camera.",
        inputSchema: { type: "object" },
        sideEffect: "ui",
        replayPolicy: "never",
      },
    ]);
    expect(JSON.stringify(projectToolDescriptors(project))).not.toContain("execute");
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps one liveness-aware local registry per project", () => {
    const tool = defineFrontendTool({
      name: "video.open",
      version: "1.0.0",
      description: "Open a camera.",
      inputSchema: { type: "object" },
      sideEffect: "ui",
      replayPolicy: "never",
      execute: async () => ({ opened: true }),
    });
    const registry = createFrontendToolRegistry(
      defineSpotlightProject({ projectId: "ydjm", tools: [tool] }),
    );

    expect(registry.liveTools()).toEqual([{ name: "video.open", version: "1.0.0" }]);
    registry.setLive("video.open", "1.0.0", false);
    expect(registry.liveTools()).toEqual([]);
    expect(registry.get("video.open", "1.0.0")?.execute).toBe(tool.execute);
  });
});
