import { describe, expect, it } from "vitest";
import {
  createClientToolManifest,
  createClientToolRegistry,
  defineClientTool,
} from "../src/clientTool.js";

const schema = {
  input: {
    type: "object",
    properties: { videoId: { type: "string" } },
    required: ["videoId"],
    additionalProperties: false,
  },
  output: { type: "null" },
};

describe("client tools", () => {
  it("registers and executes a build-described browser tool", async () => {
    const openVideo = defineClientTool(
      async ({ videoId }: { videoId: string }) => `opened:${videoId}`,
      { name: "openVideo", description: "Open a video", schema },
    );
    const registry = createClientToolRegistry([openVideo]);
    expect(registry.descriptors[0]?.name).toBe("openVideo");
    await expect(registry.execute("openVideo", { videoId: "camera-1" })).resolves.toBe(
      "opened:camera-1",
    );
  });

  it("builds a deterministic build-pinned manifest", async () => {
    const tool = defineClientTool(async () => undefined, {
      name: "closePanel",
      description: "Close panel",
      schema: {
        input: { type: "object", properties: {}, additionalProperties: false },
        output: { type: "null" },
      },
    });
    const first = await createClientToolManifest({
      projectId: "ydjm",
      frontendBuildId: "build-1",
      tools: [tool],
    });
    const second = await createClientToolManifest({
      projectId: "ydjm",
      frontendBuildId: "build-1",
      tools: [tool],
    });
    expect(first.manifestDigest).toMatch(/^sha256:/);
    expect(second.manifestDigest).toBe(first.manifestDigest);
    expect(JSON.parse(JSON.stringify(first)).manifestDigest).toBe(
      first.manifestDigest,
    );
  });
});
