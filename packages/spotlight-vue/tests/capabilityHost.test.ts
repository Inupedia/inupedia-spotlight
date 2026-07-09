import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import {
  defineSpotlightCapabilityHost,
  useSpotlightAction,
  useSpotlightReadable,
} from "../src/index.js";
import { createSpotlightHostCore } from "@inupedia/spotlight-client";

describe("spotlight-vue capability host adapter", () => {
  it("registers readable context for the current Vue scope and cleans up on dispose", () => {
    const core = createSpotlightHostCore();
    const scope = effectScope();

    scope.run(() => {
      useSpotlightReadable(
        {
          id: "route",
          description: "Current route",
          value: "dashboard",
        },
        { core },
      );
    });

    expect(core.getUiContext()).toEqual({ route: "dashboard" });

    scope.stop();

    expect(core.getUiContext()).toEqual({});
  });

  it("registers actions for the current Vue scope and cleans up on dispose", async () => {
    const core = createSpotlightHostCore();
    const scope = effectScope();

    scope.run(() => {
      useSpotlightAction(
        {
          name: "ui.toast",
          description: "Show toast",
          handler: ({ message }) => message,
        },
        { core },
      );
    });

    expect(core.listTools().map((tool) => tool.name)).toEqual(["ui.toast"]);
    await expect(core.runTool("ui.toast", { message: "hi" })).resolves.toEqual(
      expect.objectContaining({ success: true, data: "hi" }),
    );

    scope.stop();

    expect(core.listTools()).toEqual([]);
  });

  it("composes capabilities, readables, workflows, metadata, and telemetry", async () => {
    const onToolComplete = vi.fn();
    const operate = { steps: [] } as never;
    const sessionControl = { continue: vi.fn() } as never;
    const host = defineSpotlightCapabilityHost({
      actions: [
        {
          name: "ui.openSettings",
          description: "Open settings",
          handler: () => "opened",
        },
      ],
      readables: [
        {
          id: "page",
          description: "Current page",
          value: "settings",
        },
      ],
      workflows: {
        operate,
        sessionControl,
      },
      metadata: {
        videoChannels: [{ id: "cam-1", label: "Camera 1" }],
        quickPanelActions: () => ({ triggerProgressAction: vi.fn() }),
      },
      telemetry: {
        onToolComplete,
      },
    })();

    expect(host.tools?.().map((tool) => tool.name)).toEqual(["ui.openSettings"]);
    expect(host.getUiContext?.()).toEqual({ page: "settings" });
    expect(host.videoChannels).toEqual([{ id: "cam-1", label: "Camera 1" }]);
    expect(host.quickPanelActions).toEqual(
      expect.objectContaining({ triggerProgressAction: expect.any(Function) }),
    );
    expect(host.executeOperateWorkflow).toBeTypeOf("function");
    await expect(host.runHostTool?.("ui.openSettings", {})).resolves.toEqual(
      expect.objectContaining({ success: true, data: "opened" }),
    );
    expect(onToolComplete).toHaveBeenCalledOnce();
  });
});
