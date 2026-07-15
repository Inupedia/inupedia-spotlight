import { createHash } from "node:crypto";

import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import { describe, expect, it } from "vitest";

import { buildToolManifestV1 } from "../src/node/capabilities/toolManifest.js";

function tool(
  name: string,
  version: string,
  overrides: Partial<FrontendToolDescriptorV1> = {},
): FrontendToolDescriptorV1 {
  return {
    name,
    version,
    description: `Execute ${name}`,
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string" },
      },
      required: ["channelId"],
    },
    sideEffect: "ui",
    replayPolicy: "never",
    ...overrides,
  };
}

function expectArtifactError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("buildToolManifestV1", () => {
  it("rejects a non-array Tool collection with a stable error", () => {
    expectArtifactError(
      () => buildToolManifestV1(null as never),
      "ARTIFACT_TOOL_INVALID",
    );
  });

  it("sorts tools by name and version without mutating the caller", () => {
    const tools = [tool("video.open", "2.0.0"), tool("camera.get", "1.0.0"), tool("video.open", "1.0.0")];

    const result = buildToolManifestV1(tools);

    expect(result.manifest.schemaVersion).toBe("spotlight.tool-manifest/1");
    expect(result.manifest.tools.map(({ name, version }) => `${name}@${version}`)).toEqual([
      "camera.get@1.0.0",
      "video.open@1.0.0",
      "video.open@2.0.0",
    ]);
    expect(tools.map(({ name, version }) => `${name}@${version}`)).toEqual([
      "video.open@2.0.0",
      "camera.get@1.0.0",
      "video.open@1.0.0",
    ]);
  });

  it("is independent of descriptor and nested schema insertion order", () => {
    const first = tool("video.open", "1.0.0", {
      inputSchema: {
        required: ["channelId"],
        properties: { channelId: { type: "string", minLength: 1 } },
        type: "object",
      },
      outputSchema: { type: "object", properties: { opened: { type: "boolean" } } },
      maxOutputBytes: 4096,
      requiresConfirmation: true,
    });
    const second = {
      requiresConfirmation: true,
      maxOutputBytes: 4096,
      outputSchema: { properties: { opened: { type: "boolean" } }, type: "object" },
      replayPolicy: "never",
      sideEffect: "ui",
      inputSchema: {
        type: "object",
        properties: { channelId: { minLength: 1, type: "string" } },
        required: ["channelId"],
      },
      description: "Execute video.open",
      version: "1.0.0",
      name: "video.open",
    } satisfies FrontendToolDescriptorV1;

    expect(buildToolManifestV1([first])).toEqual(buildToolManifestV1([second]));
  });

  it("preserves absent optional fields without inventing defaults", () => {
    const result = buildToolManifestV1([tool("video.open", "1.0.0")]);
    const descriptor = result.manifest.tools[0];

    expect(descriptor).not.toHaveProperty("outputSchema");
    expect(descriptor).not.toHaveProperty("maxOutputBytes");
    expect(descriptor).not.toHaveProperty("riskLevel");
    expect(descriptor).not.toHaveProperty("requiresConfirmation");
  });

  it("hashes the exact canonical bytes", () => {
    const result = buildToolManifestV1([tool("video.open", "1.0.0")]);
    const expected = createHash("sha256").update(result.bytes).digest("hex");
    expect(result.digest).toBe(`sha256:${expected}`);
  });

  it("rejects duplicate tool identities", () => {
    expectArtifactError(
      () => buildToolManifestV1([tool("video.open", "1.0.0"), tool("video.open", "1.0.0")]),
      "ARTIFACT_TOOL_DUPLICATE",
    );
  });

  it.each([
    ["empty name", tool("", "1.0.0")],
    ["empty version", tool("video.open", "")],
  ])("rejects %s", (_label, descriptor) => {
    expectArtifactError(
      () => buildToolManifestV1([descriptor]),
      "ARTIFACT_TOOL_INVALID",
    );
  });

  it("rejects handler-like functions instead of silently omitting them", () => {
    const descriptor = {
      ...tool("video.open", "1.0.0"),
      invoke: async () => undefined,
    } as unknown as FrontendToolDescriptorV1;

    expectArtifactError(
      () => buildToolManifestV1([descriptor]),
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
    );
  });

  it.each([
    ["null descriptor", null],
    ["empty description", { ...tool("video.open", "1.0.0"), description: "" }],
    ["array input schema", { ...tool("video.open", "1.0.0"), inputSchema: [] }],
    ["array output schema", { ...tool("video.open", "1.0.0"), outputSchema: [] }],
    ["invalid output limit", { ...tool("video.open", "1.0.0"), maxOutputBytes: 0 }],
    ["invalid side effect", { ...tool("video.open", "1.0.0"), sideEffect: "filesystem" }],
    ["invalid replay policy", { ...tool("video.open", "1.0.0"), replayPolicy: "always" }],
    ["invalid risk level", { ...tool("video.open", "1.0.0"), riskLevel: "critical" }],
    [
      "invalid confirmation flag",
      { ...tool("video.open", "1.0.0"), requiresConfirmation: "yes" },
    ],
    ["unknown serializable field", { ...tool("video.open", "1.0.0"), handlerId: "camera" }],
  ])("rejects malformed runtime descriptors: %s", (_label, descriptor) => {
    expectArtifactError(
      () =>
        buildToolManifestV1([
          descriptor as unknown as FrontendToolDescriptorV1,
        ]),
      "ARTIFACT_TOOL_INVALID",
    );
  });
});
