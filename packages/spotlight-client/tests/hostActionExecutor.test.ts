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

  it("nacks schema-invalid input before ACK and validates returned output", async () => {
    const execute = vi.fn(async () => ({ opened: "yes" }));
    const tool = defineFrontendTool({
      name: "video.open", version: "1", description: "Open",
      inputSchema: { type: "object", required: ["channelId"], properties: { channelId: { type: "string" } }, additionalProperties: false },
      outputSchema: { type: "object", required: ["opened"], properties: { opened: { type: "boolean" } } },
      sideEffect: "ui", replayPolicy: "never", execute,
    });
    const registry = createFrontendToolRegistry(defineSpotlightProject({ projectId: "ydjm", tools: [tool] }));
    const fence = { sessionId: "s", capabilitySnapshotId: "snap", leaseId: "l", leaseVersion: 1, connectionId: "c", connectionEpoch: 1, browserInstanceId: "b", tabInstanceId: "t" };
    const executor = createHostActionExecutor({ registry, fence });
    const base = { type: "host_action_request", callId: "call", attempt: 1, inputDigest: "sha256:i", ...fence, tool: { target: "browser", registryId: "ydjm", name: "video.open", version: "1" }, deadlineAt: "2099-01-01T00:00:00.000Z", maxAttempts: 1 } as const;
    expect(await executor.execute({ ...base, input: {} })).toMatchObject([{ type: "host_action_nack", error: { code: "TOOL_INPUT_INVALID" } }]);
    expect(execute).not.toHaveBeenCalled();
    expect(await executor.execute({ ...base, input: { channelId: "c1" } })).toMatchObject([
      { type: "host_action_ack" },
      { type: "host_action_result", outcome: "threw", error: { code: "TOOL_OUTPUT_INVALID" } },
    ]);
  });

  it("emits ACK before handler completion and races the deadline", async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    const execute = vi.fn(() => new Promise((done) => { resolve = done; }));
    const tool = defineFrontendTool({ name: "video.open", version: "1", description: "Open", inputSchema: { type: "object" }, sideEffect: "ui", replayPolicy: "never", execute });
    const registry = createFrontendToolRegistry(defineSpotlightProject({ projectId: "ydjm-stream", tools: [tool] }));
    const fence = { sessionId: "s", capabilitySnapshotId: "snap", leaseId: "l", leaseVersion: 1, connectionId: "c", connectionEpoch: 1, browserInstanceId: "b", tabInstanceId: "t" };
    const request = { type: "host_action_request", callId: "call", attempt: 1, inputDigest: "sha256:i", ...fence, tool: { target: "browser", registryId: "ydjm", name: "video.open", version: "1" }, input: {}, deadlineAt: new Date(Date.now() + 1000).toISOString(), maxAttempts: 1 } as const;
    const emitted: any[] = [];
    const running = createHostActionExecutor({ registry, fence }).executeStreaming(request, (message) => emitted.push(message));
    await Promise.resolve();
    expect(emitted).toMatchObject([{ type: "host_action_ack" }]);
    await vi.advanceTimersByTimeAsync(1001);
    await expect(running).resolves.toBeUndefined();
    expect(emitted.at(-1)).toMatchObject({ type: "host_action_result", outcome: "threw", error: { code: "UNKNOWN_OUTCOME" } });
    resolve({ late: true });
    vi.useRealTimers();
  });
  it("nacks invalid deadlines before ACK and does not truncate very long deadlines", async () => {
    vi.useFakeTimers(); let resolve!: (value: unknown)=>void; const execute=vi.fn(()=>new Promise((done)=>{resolve=done;}));
    const tool=defineFrontendTool({name:"long.tool",version:"1",description:"long",inputSchema:{type:"object"},sideEffect:"none",replayPolicy:"safe",execute}); const registry=createFrontendToolRegistry(defineSpotlightProject({projectId:"long",tools:[tool]})); const fence={sessionId:"s",capabilitySnapshotId:"snap",leaseId:"l",leaseVersion:1,connectionId:"c",connectionEpoch:1,browserInstanceId:"b",tabInstanceId:"t"}; const base={type:"host_action_request",callId:"x",attempt:1,inputDigest:"sha256:i",...fence,tool:{target:"browser",registryId:"long",name:"long.tool",version:"1"},input:{},maxAttempts:1} as const; const executor=createHostActionExecutor({registry,fence});
    expect(await executor.execute({...base,deadlineAt:"invalid"})).toMatchObject([{type:"host_action_nack",error:{code:"HOST_ACTION_TIMEOUT"}}]); expect(execute).not.toHaveBeenCalled();
    const emitted:any[]=[]; const running=executor.executeStreaming({...base,deadlineAt:new Date(Date.now()+0x7fffffff+10_000).toISOString()},m=>emitted.push(m)); await vi.advanceTimersByTimeAsync(0x7fffffff); expect(emitted).toHaveLength(1); resolve(true); await running; expect(emitted.at(-1)).toMatchObject({outcome:"returned"}); vi.useRealTimers();
  });

  it("uses structural JSON equality for enum objects", async () => {
    const execute=vi.fn(async()=>true); const tool=defineFrontendTool({name:"enum.tool",version:"1",description:"enum",inputSchema:{type:"object",properties:{choice:{enum:[{a:1,b:[2]}]}},required:["choice"]},sideEffect:"none",replayPolicy:"safe",execute});
    const registry=createFrontendToolRegistry(defineSpotlightProject({projectId:"enum",tools:[tool]})); const fence={sessionId:"s",capabilitySnapshotId:"snap",leaseId:"l",leaseVersion:1,connectionId:"c",connectionEpoch:1,browserInstanceId:"b",tabInstanceId:"t"};
    const messages=await createHostActionExecutor({registry,fence}).execute({type:"host_action_request",callId:"x",attempt:1,inputDigest:"sha256:i",...fence,tool:{target:"browser",registryId:"enum",name:"enum.tool",version:"1"},input:{choice:{b:[2],a:1}},deadlineAt:"2099-01-01T00:00:00.000Z",maxAttempts:1});
    expect(messages.at(-1)).toMatchObject({outcome:"returned"});
  });
});
