import { describe, expect, it, vi } from "vitest";
import { createHostActionExecutor } from "../src/capabilities/hostActionExecutor.js";
import { createFrontendToolRegistry, defineFrontendTool, defineSpotlightProject } from "../src/tools/frontendTool.js";

describe("fenced host action executor", () => {
  it("rejects stale connections before invoking a handler", async () => {
    const execute = vi.fn();
    const tool = defineFrontendTool({ name: "video.open", version: "1", description: "Open", inputSchema: { type: "object" }, sideEffect: "ui", replayPolicy: "never", execute });
    const registry = createFrontendToolRegistry(defineSpotlightProject({ projectId: "ydjm", tools: [tool] }));
    const executor = createHostActionExecutor({ registry, fence: { sessionId: "s", capabilitySnapshotId: "snap", leaseId: "l", leaseVersion: 2, connectionId: "c", connectionEpoch: 3, browserInstanceId: "b", tabInstanceId: "t" } });
    const messages = await executor.execute({ type: "host_action_request", callId: "call", attempt: 1, inputDigest: "sha256:i", sessionId: "s", capabilitySnapshotId: "snap", leaseId: "l", leaseVersion: 1, connectionId: "old", connectionEpoch: 2, browserInstanceId: "b", tabInstanceId: "t", tool: { target: "browser", registryId: "ydjm", name: "video.open", version: "1" }, input: {}, deadlineAt: "2099-01-01T00:00:00.000Z", maxAttempts: 1 });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: "host_action_nack", error: { code: "CAPABILITY_LEASE_FENCED" } });
    expect(execute).not.toHaveBeenCalled();
  });
});
