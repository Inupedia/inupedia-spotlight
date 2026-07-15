import { describe, expect, it, vi } from "vitest";
import { defineFrontendTool, defineSpotlightProject, registerCapabilityRuntimeV1 } from "@inupedia/spotlight-client";
import { createSpotlight } from "../src/createSpotlight.js";

describe("createSpotlight", () => {
  it("keeps active sessions pinned when HMR announces a new build", () => {
    const project = defineSpotlightProject({ projectId: "ydjm", tools: [defineFrontendTool({ name: "video.open", version: "1", description: "Open", inputSchema: { type: "object" }, sideEffect: "ui", replayPolicy: "never", execute: async () => null })] });
    const first = { schemaVersion: "spotlight.capability-build-info/1", projectId: "ydjm", frontendBuildId: "b1", artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 1 } as const;
    const runtime = createSpotlight({ endpoint: "/api", project, capabilityBuildInfo: first, openUploadStream: async () => { throw new Error("unused"); } });
    runtime.notifyBuild({ ...first, frontendBuildId: "b2", artifactDigest: "sha256:b" });
    expect(runtime.pendingBuild()?.artifactDigest).toBe("sha256:b");
  });

  it("waits for a virtual runtime registered after plugin install", async () => {
    const project = defineSpotlightProject({ projectId: "late-project", tools: [] });
    const accepted = { status: "accepted", handshakeId: "h", capabilitySnapshotId: "snap", sessionBindingVersion: 1, leaseId: "l", leaseVersion: 1, connectionId: "c", connectionEpoch: 1, leaseExpiresAt: "2099-01-01T00:00:00.000Z", capabilityChannelUrl: "/channel", capabilityChannelToken: "token", acceptedTools: [], rejectedTools: [] } as const;
    const runtime = createSpotlight({ endpoint: "/api", project, fetch: async () => new Response(JSON.stringify(accepted)) });
    runtime.install?.({ provide() {} } as never);
    const connecting = runtime.connect({ sessionId: "s", browserInstanceId: "b", tabInstanceId: "t", openChannel: false });
    const info = { schemaVersion: "spotlight.capability-build-info/1", projectId: "late-project", frontendBuildId: "b1", artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 1 } as const;
    registerCapabilityRuntimeV1({ capabilityBuildInfo: info, openUploadStream: async () => { throw new Error("unused"); } });
    await expect(connecting).resolves.toMatchObject({ handshake: accepted });
    registerCapabilityRuntimeV1({ capabilityBuildInfo: { ...info, artifactDigest: "sha256:b" }, openUploadStream: async () => { throw new Error("unused"); } });
    expect(runtime.pendingBuild()?.artifactDigest).toBe("sha256:b");
  });

  it("deduplicates concurrent session connects and clears failed in-flight state", async () => {
    const project = defineSpotlightProject({ projectId: "dedupe-project", tools: [] });
    const info = { schemaVersion: "spotlight.capability-build-info/1", projectId: "dedupe-project", frontendBuildId: "b1", artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 1 } as const;
    registerCapabilityRuntimeV1({ capabilityBuildInfo: info, openUploadStream: async () => { throw new Error("unused"); } });
    const accepted = { status: "accepted", handshakeId: "h", capabilitySnapshotId: "snap", sessionBindingVersion: 1, leaseId: "l", leaseVersion: 1, connectionId: "c", connectionEpoch: 1, leaseExpiresAt: "2099-01-01T00:00:00.000Z", capabilityChannelUrl: "/channel", capabilityChannelToken: "token", acceptedTools: [], rejectedTools: [] } as const;
    const fetch = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValue(new Response(JSON.stringify(accepted)));
    const runtime = createSpotlight({ endpoint: "/api", project, fetch });
    const input = { sessionId: "s", browserInstanceId: "b", tabInstanceId: "t", openChannel: false } as const;
    const first = runtime.connect(input); const duplicate = runtime.connect(input);
    await expect(Promise.allSettled([first, duplicate])).resolves.toMatchObject([{ status: "rejected" }, { status: "rejected" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(runtime.connect(input)).resolves.toMatchObject({ handshake: accepted });
    expect(fetch).toHaveBeenCalledTimes(2);
    runtime.notifyBuild({ ...info, artifactDigest: "sha256:new" });
    expect(runtime.pendingBuild()?.artifactDigest).toBe("sha256:new");
    runtime.dispose();
    registerCapabilityRuntimeV1({ capabilityBuildInfo: { ...info, artifactDigest: "sha256:after-dispose" }, openUploadStream: async () => { throw new Error("unused"); } });
    expect(runtime.pendingBuild()?.artifactDigest).toBe("sha256:new");
  });
  it("disconnect aborts an in-flight connect and prevents late activation", async () => {
    const project=defineSpotlightProject({projectId:"abort-project",tools:[]}); const info={schemaVersion:"spotlight.capability-build-info/1",projectId:"abort-project",frontendBuildId:"b",artifactVersion:"spotlight.capability-artifact/1",artifactDigest:"sha256:a",manifestDigest:"sha256:m",skillManifestDigest:"sha256:s",toolManifestDigest:"sha256:t",byteLength:1} as const; registerCapabilityRuntimeV1({capabilityBuildInfo:info,openUploadStream:async()=>{throw new Error("unused")}});
    let resolve!: (value:Response)=>void; const fetch=vi.fn(()=>new Promise<Response>(done=>{resolve=done;})); const runtime=createSpotlight({endpoint:"/api",project,fetch:fetch as never}); const pending=runtime.connect({sessionId:"s",browserInstanceId:"b",tabInstanceId:"t",openChannel:false}); await Promise.resolve(); await Promise.resolve(); runtime.disconnect("s"); resolve(new Response(JSON.stringify({status:"accepted",handshakeId:"h",capabilitySnapshotId:"snap",sessionBindingVersion:1,leaseId:"l",leaseVersion:1,connectionId:"c",connectionEpoch:1,leaseExpiresAt:"2099-01-01T00:00:00.000Z",capabilityChannelUrl:"/channel",capabilityChannelToken:"token",acceptedTools:[],rejectedTools:[]})));
    await expect(pending).rejects.toMatchObject({name:"AbortError"});
  });
});
