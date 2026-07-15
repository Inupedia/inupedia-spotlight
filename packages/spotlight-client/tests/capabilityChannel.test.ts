import { describe, expect, it, vi } from "vitest";
import { createCapabilityChannel } from "../src/capabilities/channel.js";
import { createFrontendToolRegistry, defineSpotlightProject } from "../src/tools/frontendTool.js";

describe("Capability channel recovery", () => {
  it("reserves a fenced successor connection after an unexpected close", async () => {
    vi.useFakeTimers();
    const sockets: Array<{ readyState: number; onopen: null | (() => void); onmessage: null; onclose: null | (() => void); send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
    const fetch = vi.fn(async () => new Response(JSON.stringify({ leaseId: "l", leaseVersion: 2, connectionId: "c2", connectionEpoch: 2, capabilityChannelToken: "next", tokenExpiresAt: "2099-01-01T00:00:00.000Z" })));
    const channel = createCapabilityChannel({ endpoint: "https://example.test", handshake: { status: "accepted", handshakeId: "h", capabilitySnapshotId: "snap", sessionBindingVersion: 1, leaseId: "l", leaseVersion: 1, connectionId: "c1", connectionEpoch: 1, leaseExpiresAt: "2099-01-01T00:00:00.000Z", capabilityChannelUrl: "/channel", capabilityChannelToken: "token", acceptedTools: [], rejectedTools: [] }, identity: { sessionId: "s", browserInstanceId: "b", tabInstanceId: "t" }, registry: createFrontendToolRegistry(defineSpotlightProject({ projectId: "p", tools: [] })), fetch: fetch as never, createWebSocket: () => { const socket = { readyState: 1, onopen: null, onmessage: null, onclose: null, send: vi.fn(), close: vi.fn() }; sockets.push(socket); return socket as never; } });
    channel.open();
    sockets[0]!.onclose?.();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/connections"), expect.anything());
    expect(channel.fence()).toMatchObject({ connectionId: "c2", connectionEpoch: 2 });
    channel.close(); vi.useRealTimers();
  });

  it("retries reservation failures without CloseEvent and close cancels pending retry", async () => {
    vi.useFakeTimers();
    const sockets: any[] = [];
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error("one"))
      .mockRejectedValueOnce(new Error("two"))
      .mockResolvedValue(new Response(JSON.stringify({ leaseId: "l", leaseVersion: 2, connectionId: "c2", connectionEpoch: 2, capabilityChannelToken: "next", tokenExpiresAt: "2099-01-01T00:00:00.000Z" })));
    const channel = createCapabilityChannel({ endpoint: "https://example.test", handshake: { status: "accepted", handshakeId: "h", capabilitySnapshotId: "snap", sessionBindingVersion: 1, leaseId: "l", leaseVersion: 1, connectionId: "c1", connectionEpoch: 1, leaseExpiresAt: "2099-01-01T00:00:00.000Z", capabilityChannelUrl: "/channel", capabilityChannelToken: "token", acceptedTools: [], rejectedTools: [] }, identity: { sessionId: "s", browserInstanceId: "b", tabInstanceId: "t" }, registry: createFrontendToolRegistry(defineSpotlightProject({ projectId: "p2", tools: [] })), fetch: fetch as never, createWebSocket: () => { const socket = { readyState: 1, onopen: null, onmessage: null, onclose: null, send: vi.fn(), close: vi.fn() }; sockets.push(socket); return socket as never; } });
    channel.open(); sockets[0].onclose();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(channel.fence().connectionId).toBe("c2");
    sockets.at(-1).onclose(); channel.close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("routes transient renewal failure through reconnect and ignores stale revoked renewal", async () => {
    vi.useFakeTimers(); let resolveRenew!: (value: Response) => void;
    const renewalResponse = new Promise<Response>((resolve) => { resolveRenew = resolve; });
    const fetch = vi.fn((url: string) => url.includes("/renew") ? renewalResponse : Promise.resolve(new Response(JSON.stringify({ leaseId: "l", leaseVersion: 2, connectionId: "c2", connectionEpoch: 2, capabilityChannelToken: "next", tokenExpiresAt: "2099-01-01T00:00:00.000Z" }))));
    const sockets: any[]=[];
    const channel=createCapabilityChannel({endpoint:"https://example.test",handshake:{status:"accepted",handshakeId:"h",capabilitySnapshotId:"snap",sessionBindingVersion:1,leaseId:"l",leaseVersion:1,connectionId:"c1",connectionEpoch:1,leaseExpiresAt:"2099-01-01T00:00:00.000Z",capabilityChannelUrl:"/channel",capabilityChannelToken:"token",acceptedTools:[],rejectedTools:[]},identity:{sessionId:"s",browserInstanceId:"b",tabInstanceId:"t"},registry:createFrontendToolRegistry(defineSpotlightProject({projectId:"p3",tools:[]})),fetch:fetch as never,createWebSocket:()=>{const s={readyState:1,onopen:null,onmessage:null,onclose:null,send:vi.fn(),close:vi.fn()};sockets.push(s);return s as never;}});
    channel.open(); const oldRenew=channel.renew(); await channel.reconnect();
    resolveRenew(new Response(JSON.stringify({status:"revoked",reason:"old"})));
    await expect(oldRenew).resolves.toMatchObject({status:"revoked"});
    expect(channel.fence()).toMatchObject({connectionId:"c2",connectionEpoch:2});
    expect(sockets.at(-1).close).not.toHaveBeenCalled(); channel.close(); vi.useRealTimers();
  });
  it("never sends an old socket handler result to its successor", async () => {
    let resolveHandler!: (value:unknown)=>void; const tool=(await import("../src/tools/frontendTool.js")).defineFrontendTool({name:"slow",version:"1",description:"slow",inputSchema:{type:"object"},sideEffect:"none",replayPolicy:"safe",execute:()=>new Promise(done=>{resolveHandler=done;})}); const registry=createFrontendToolRegistry(defineSpotlightProject({projectId:"p4",tools:[tool]})); const sockets:any[]=[]; const fetch=vi.fn(async()=>new Response(JSON.stringify({leaseId:"l",leaseVersion:2,connectionId:"c2",connectionEpoch:2,capabilityChannelToken:"next",tokenExpiresAt:"2099-01-01T00:00:00.000Z"})));
    const channel=createCapabilityChannel({endpoint:"https://x",handshake:{status:"accepted",handshakeId:"h",capabilitySnapshotId:"snap",sessionBindingVersion:1,leaseId:"l",leaseVersion:1,connectionId:"c1",connectionEpoch:1,leaseExpiresAt:"2099-01-01T00:00:00.000Z",capabilityChannelUrl:"/channel",capabilityChannelToken:"t",acceptedTools:[],rejectedTools:[]},identity:{sessionId:"s",browserInstanceId:"b",tabInstanceId:"t"},registry,fetch:fetch as never,createWebSocket:()=>{const s={readyState:1,onopen:null,onmessage:null,onclose:null,send:vi.fn(),close:vi.fn()};sockets.push(s);return s as never;}}); channel.open(); sockets[0].onmessage({data:JSON.stringify({type:"host_action_request",callId:"x",attempt:1,inputDigest:"sha256:i",sessionId:"s",capabilitySnapshotId:"snap",leaseId:"l",leaseVersion:1,connectionId:"c1",connectionEpoch:1,browserInstanceId:"b",tabInstanceId:"t",tool:{target:"browser",registryId:"p4",name:"slow",version:"1"},input:{},deadlineAt:"2099-01-01T00:00:00.000Z",maxAttempts:1})}); await Promise.resolve(); expect(sockets[0].send).toHaveBeenCalledTimes(1); await channel.reconnect(); resolveHandler(true); await Promise.resolve(); await Promise.resolve(); expect(sockets[1].send).not.toHaveBeenCalled(); channel.close();
  });
});
