import { describe, expect, it } from "vitest";
import { transformSpotlightClientTools } from "../src/vite/spotlightClientTools.js";

describe("spotlightClientTools", () => {
  it("infers export name, JSDoc and schemas", () => {
    const source = `
      import { defineClientTool } from "@inupedia/spotlight-client";
      /** Open the specified video. */
      export const openVideo = defineClientTool(
        async ({ videoId }: { videoId: string }): Promise<void> => {},
      );
    `;
    const result = transformSpotlightClientTools(source, "/app/src/tools/video.ts");
    expect(result?.code).toContain('name:"openVideo"');
    expect(result?.code).toContain('description:"Open the specified video."');
    expect(result?.code).toContain('"videoId":{"type":"string"}');
  });

  it("fails unsupported inferred types with an escape-hatch message", () => {
    const source = `
      import { defineClientTool } from "@inupedia/spotlight-client";
      type VideoInput = { videoId: string };
      /** Open video. */
      export const openVideo = defineClientTool(async (input: VideoInput) => {});
    `;
    expect(() =>
      transformSpotlightClientTools(source, "/app/src/tools/video.ts"),
    ).toThrow(/Add \{ schema:/);
  });

  it("emits explicit risk and replay metadata into the production descriptor", () => {
    const source = `
      import { defineClientTool } from "@inupedia/spotlight-client";
      /** Delete a remote video. */
      export const deleteVideo = defineClientTool(
        async ({ videoId }: { videoId: string }): Promise<void> => {},
        {
          sideEffect: "external",
          replayPolicy: "never",
          riskLevel: "high",
          requiresConfirmation: true,
          maxOutputBytes: 1024,
        },
      );
    `;
    const descriptors: Array<Record<string, unknown>> = [];
    transformSpotlightClientTools(
      source,
      "/app/src/tools/video.ts",
      (descriptor) => descriptors.push(descriptor),
    );
    expect(descriptors).toEqual([
      expect.objectContaining({
        name: "deleteVideo",
        sideEffect: "external",
        replayPolicy: "never",
        riskLevel: "high",
        requiresConfirmation: true,
        maxOutputBytes: 1024,
      }),
    ]);
  });
});
