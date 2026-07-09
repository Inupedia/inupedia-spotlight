import { describe, expect, it, vi } from "vitest";
import { createSpotlightHostCore } from "../src/index.js";

describe("createSpotlightHostCore", () => {
  it("registers actions as host tools and executes handlers", async () => {
    const core = createSpotlightHostCore({
      actions: [
        {
          name: "ui.openSettings",
          displayName: "Open settings",
          description: "Open settings panel",
          handler: (input, context) => ({
            input,
            toolName: context.toolName,
          }),
        },
      ],
    });

    expect(core.listTools()).toEqual([
      expect.objectContaining({
        name: "ui.openSettings",
        displayName: "Open settings",
        description: "Open settings panel",
      }),
    ]);

    const result = await core.runTool("ui.openSettings", { tab: "profile" });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: {
          input: { tab: "profile" },
          toolName: "ui.openSettings",
        },
        executionTarget: "host",
      }),
    );
  });

  it("cleans up registered actions with unregister", async () => {
    const core = createSpotlightHostCore();
    const unregister = core.registerAction({
      name: "ui.temp",
      description: "Temporary action",
      handler: () => "ok",
    });

    expect(core.listTools().map((tool) => tool.name)).toEqual(["ui.temp"]);

    unregister();

    expect(core.listTools()).toEqual([]);
    await expect(core.runTool("ui.temp", {})).resolves.toEqual(
      expect.objectContaining({
        success: false,
        errorCode: "UNKNOWN_TOOL",
      }),
    );
  });

  it("aggregates enabled readable context values", () => {
    const core = createSpotlightHostCore({
      readables: [
        {
          id: "route",
          description: "Current route",
          value: () => "dashboard",
        },
        {
          description: "Selection",
          value: { id: 1 },
        },
        {
          id: "disabled",
          description: "Disabled",
          value: "nope",
          available: false,
        },
      ],
    });

    expect(core.getUiContext()).toEqual({
      route: "dashboard",
      Selection: { id: 1 },
    });
  });

  it("filters unavailable actions from the manifest and execution", async () => {
    const core = createSpotlightHostCore({
      actions: [
        {
          name: "ui.hidden",
          description: "Hidden action",
          available: () => false,
          handler: () => "nope",
        },
      ],
    });

    expect(core.listTools()).toEqual([]);
    await expect(core.runTool("ui.hidden", {})).resolves.toEqual(
      expect.objectContaining({
        success: false,
        errorCode: "PRECONDITION_FAILED",
      }),
    );
  });

  it("calls telemetry on success and failure without throwing handler errors", async () => {
    const onToolComplete = vi.fn();
    const core = createSpotlightHostCore({
      onToolComplete,
      actions: [
        {
          name: "ui.ok",
          description: "OK",
          handler: () => "ok",
        },
        {
          name: "ui.fail",
          description: "Fail",
          handler: () => {
            throw new Error("boom");
          },
        },
      ],
    });

    const success = await core.runTool("ui.ok", {});
    const failure = await core.runTool("ui.fail", {});

    expect(success.success).toBe(true);
    expect(failure).toEqual(
      expect.objectContaining({
        success: false,
        error: "boom",
        errorCode: "TOOL_RUN_FAILED",
      }),
    );
    expect(onToolComplete).toHaveBeenCalledTimes(2);
    expect(onToolComplete).toHaveBeenLastCalledWith(
      "ui.fail",
      {},
      expect.objectContaining({ success: false }),
    );
  });

  it("notifies subscribers when the core changes", () => {
    const core = createSpotlightHostCore();
    const subscriber = vi.fn();
    const unsubscribe = core.subscribe(subscriber);

    const unregister = core.registerReadable({
      id: "page",
      description: "Current page",
      value: "home",
    });

    unregister();
    unsubscribe();
    core.registerReadable({
      id: "ignored",
      description: "Ignored",
      value: true,
    });

    expect(subscriber).toHaveBeenCalledTimes(2);
  });
});
