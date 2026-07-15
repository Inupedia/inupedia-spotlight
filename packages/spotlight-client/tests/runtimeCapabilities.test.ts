import { describe, expect, it } from "vitest";
import { getCapabilityRuntimeV1, registerCapabilityRuntimeV1 } from "../src/capabilities/runtimeCapabilities.js";

describe("Vite capability runtime registry", () => {
  it("registers one build provider per project and notifies subscribers", () => {
    const first = { schemaVersion: "spotlight.capability-build-info/1", projectId: "ydjm", frontendBuildId: "b1", artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 1 } as const;
    const changed: string[] = [];
    registerCapabilityRuntimeV1({ capabilityBuildInfo: first, openUploadStream: async () => { throw new Error("unused"); } });
    const runtime = getCapabilityRuntimeV1("ydjm")!;
    runtime.subscribe((info) => changed.push(info.artifactDigest));
    registerCapabilityRuntimeV1({ capabilityBuildInfo: { ...first, artifactDigest: "sha256:b" }, openUploadStream: async () => { throw new Error("unused"); } });
    expect(changed).toEqual(["sha256:b"]);
  });

  it("rejects pre-aborted waits without retaining a listener", async () => {
    const { waitForCapabilityRuntimeV1 } = await import("../src/capabilities/runtimeCapabilities.js");
    const controller = new AbortController(); controller.abort("stop");
    await expect(waitForCapabilityRuntimeV1("never", controller.signal)).rejects.toBe("stop");
  });
});
