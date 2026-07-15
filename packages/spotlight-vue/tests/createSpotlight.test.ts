import { describe, expect, it } from "vitest";
import { defineFrontendTool, defineSpotlightProject } from "@inupedia/spotlight-client";
import { createSpotlight } from "../src/createSpotlight.js";

describe("createSpotlight", () => {
  it("keeps active sessions pinned when HMR announces a new build", () => {
    const project = defineSpotlightProject({ projectId: "ydjm", tools: [defineFrontendTool({ name: "video.open", version: "1", description: "Open", inputSchema: { type: "object" }, sideEffect: "ui", replayPolicy: "never", execute: async () => null })] });
    const first = { schemaVersion: "spotlight.capability-build-info/1", projectId: "ydjm", frontendBuildId: "b1", artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 1 } as const;
    const runtime = createSpotlight({ endpoint: "/api", project, capabilityBuildInfo: first, openUploadStream: async () => { throw new Error("unused"); } });
    runtime.notifyBuild({ ...first, frontendBuildId: "b2", artifactDigest: "sha256:b" });
    expect(runtime.pendingBuild()?.artifactDigest).toBe("sha256:b");
  });
});
