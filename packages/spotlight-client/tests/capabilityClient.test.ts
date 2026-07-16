import { afterEach, describe, expect, it, vi } from "vitest";
import { createCapabilityClient } from "../src/capabilities/handshake.js";
import { createFrontendToolRegistry, defineFrontendTool, defineSpotlightProject } from "../src/tools/frontendTool.js";

const accepted = {
  status: "accepted",
  handshakeId: "h1",
  capabilitySnapshotId: "snap1",
  sessionBindingVersion: 1,
  leaseId: "lease1",
  leaseVersion: 1,
  connectionId: "conn1",
  connectionEpoch: 1,
  leaseExpiresAt: "2099-01-01T00:00:00.000Z",
  capabilityChannelUrl: "wss://example.test/channel",
  capabilityChannelToken: "token",
  acceptedTools: [],
  rejectedTools: [],
} as const;

describe("Capability Handshake client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates an offer id when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(7);
        return array;
      },
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(accepted)),
    );
    const tool = defineFrontendTool({
      name: "video.open",
      version: "1",
      description: "Open",
      inputSchema: { type: "object" },
      sideEffect: "ui",
      replayPolicy: "never",
      execute: async () => null,
    });
    const project = defineSpotlightProject({ projectId: "ydjm", tools: [tool] });
    const client = createCapabilityClient({
      endpoint: "https://example.test",
      project,
      registry: createFrontendToolRegistry(project),
      buildInfo: {
        schemaVersion: "spotlight.capability-build-info/1",
        projectId: "ydjm",
        frontendBuildId: "build1",
        artifactVersion: "spotlight.capability-artifact/1",
        artifactDigest: "sha256:a",
        manifestDigest: "sha256:m",
        skillManifestDigest: "sha256:s",
        toolManifestDigest: "sha256:t",
        byteLength: 3,
      },
      openUploadStream: async () => ({
        digest: "sha256:a",
        byteLength: 3,
        contentType: "application/gzip",
        stream: new Blob(["abc"]).stream(),
      }),
      fetch,
    });

    await client.connect({
      sessionId: "s1",
      browserInstanceId: "b1",
      tabInstanceId: "t1",
      openChannel: false,
    });

    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).offerId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("uploads and resumes a cache miss with one stable offer id", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "upload_required", handshakeId: "h1", uploadToken: "up", resumeToken: "resume", artifactDigest: "sha256:a", uploadUrl: "/upload", expiresAt: "2099-01-01T00:00:00.000Z" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "artifact_stored", handshakeId: "h1", artifactDigest: "sha256:a" })))
      .mockResolvedValueOnce(new Response(JSON.stringify(accepted)));
    const tool = defineFrontendTool({ name: "video.open", version: "1", description: "Open", inputSchema: { type: "object" }, sideEffect: "ui", replayPolicy: "never", execute: async () => null });
    const project = defineSpotlightProject({ projectId: "ydjm", tools: [tool] });
    const client = createCapabilityClient({
      endpoint: "https://example.test",
      project,
      registry: createFrontendToolRegistry(project),
      buildInfo: { schemaVersion: "spotlight.capability-build-info/1", projectId: "ydjm", frontendBuildId: "build1", artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 3 },
      openUploadStream: async () => ({ digest: "sha256:a", byteLength: 3, contentType: "application/gzip", stream: new Blob(["abc"]).stream() }),
      fetch,
      createOfferId: () => "offer-stable",
    });

    const result = await client.connect({ sessionId: "s1", browserInstanceId: "b1", tabInstanceId: "t1", openChannel: false });
    expect(result.handshake).toEqual(accepted);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).offerId).toBe("offer-stable");
    const uploadRequest = fetch.mock.calls[1]![1]!;
    expect(uploadRequest.body).toEqual(new Uint8Array([97, 98, 99]));
    expect(uploadRequest).not.toHaveProperty("duplex");
    expect(uploadRequest.headers).not.toHaveProperty("Content-Length");
  });

  it("cancels a pending artifact read when the handshake is aborted", async () => {
    const cancel = vi.fn();
    let markPullStarted!: () => void;
    const pullStarted = new Promise<void>((resolve) => { markPullStarted = resolve; });
    const stream = new ReadableStream<Uint8Array>({
      pull: () => {
        markPullStarted();
        return new Promise<void>(() => undefined);
      },
      cancel,
    }, { highWaterMark: 0 });
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      status: "upload_required",
      handshakeId: "h1",
      uploadToken: "up",
      resumeToken: "resume",
      artifactDigest: "sha256:a",
      uploadUrl: "/upload",
      expiresAt: "2099-01-01T00:00:00.000Z",
    })));
    const project = defineSpotlightProject({ projectId: "abort-upload", tools: [] });
    const client = createCapabilityClient({
      endpoint: "https://example.test",
      project,
      registry: createFrontendToolRegistry(project),
      buildInfo: { schemaVersion: "spotlight.capability-build-info/1", projectId: "abort-upload", frontendBuildId: "build1", artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 3 },
      openUploadStream: async () => ({ digest: "sha256:a", byteLength: 3, contentType: "application/gzip", stream }),
      fetch,
    });
    const controller = new AbortController();
    const reason = new DOMException("Disconnected.", "AbortError");
    const connecting = client.connect({ sessionId: "s1", browserInstanceId: "b1", tabInstanceId: "t1", openChannel: false, signal: controller.signal });

    await pullStarted;
    controller.abort(reason);

    await expect(connecting).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledWith(reason);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("cancels the artifact stream when upload buffering starts pre-aborted", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: "upload_required", handshakeId: "h1", uploadToken: "up", resumeToken: "resume", artifactDigest: "sha256:a", uploadUrl: "/upload", expiresAt: "2099-01-01T00:00:00.000Z" })));
    const project = defineSpotlightProject({ projectId: "pre-abort-upload", tools: [] });
    const client = createCapabilityClient({
      endpoint: "https://example.test",
      project,
      registry: createFrontendToolRegistry(project),
      buildInfo: { schemaVersion: "spotlight.capability-build-info/1", projectId: "pre-abort-upload", frontendBuildId: "build1", artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 3 },
      openUploadStream: async () => ({ digest: "sha256:a", byteLength: 3, contentType: "application/gzip", stream }),
      fetch,
    });
    const controller = new AbortController();
    const reason = new DOMException("Already disconnected.", "AbortError");
    controller.abort(reason);

    await expect(client.connect({ sessionId: "s1", browserInstanceId: "b1", tabInstanceId: "t1", openChannel: false, signal: controller.signal })).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledWith(reason);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
