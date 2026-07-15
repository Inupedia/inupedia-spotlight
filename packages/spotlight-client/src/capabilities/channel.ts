import {
  SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
  type CapabilityChannelServerMessageV1,
  type CapabilityHandshakeResultV1,
  type RenewCapabilityLeaseResultV1,
  type ReservedCapabilityConnectionV1,
} from "@inupedia/spotlight-protocol";
import type { FrontendToolRegistryV1 } from "../tools/frontendTool.js";
import { capabilityResponseJson, SpotlightCapabilityError } from "./errors.js";
import { createHostActionExecutor, type CapabilityExecutionFenceV1 } from "./hostActionExecutor.js";

type AcceptedHandshake = Extract<CapabilityHandshakeResultV1, { status: "accepted" }>;

export interface CapabilityChannelV1 {
  open(): void;
  close(): void;
  renew(): Promise<RenewCapabilityLeaseResultV1>;
  reconnect(): Promise<void>;
  fence(): Readonly<CapabilityExecutionFenceV1>;
}

export function createCapabilityChannel(options: {
  endpoint: string;
  handshake: AcceptedHandshake;
  identity: { sessionId: string; browserInstanceId: string; tabInstanceId: string; signal?: AbortSignal };
  registry: FrontendToolRegistryV1;
  fetch: typeof globalThis.fetch;
  createWebSocket?: (url: string) => WebSocket;
}): CapabilityChannelV1 {
  let leaseVersion = options.handshake.leaseVersion;
  let connectionId = options.handshake.connectionId;
  let connectionEpoch = options.handshake.connectionEpoch;
  let channelToken = options.handshake.capabilityChannelToken;
  let socket: WebSocket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let renewal: ReturnType<typeof setInterval> | undefined;
  let renewalPending = false;
  let closed = false;

  const fence = (): CapabilityExecutionFenceV1 => Object.freeze({
    sessionId: options.identity.sessionId,
    capabilitySnapshotId: options.handshake.capabilitySnapshotId,
    leaseId: options.handshake.leaseId,
    leaseVersion,
    connectionId,
    connectionEpoch,
    browserInstanceId: options.identity.browserInstanceId,
    tabInstanceId: options.identity.tabInstanceId,
  });
  const executor = createHostActionExecutor({ registry: options.registry, fence });
  const send = (message: unknown) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message));
  };

  const close = () => {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (renewal) clearInterval(renewal);
    heartbeat = undefined;
    renewal = undefined;
    socket?.close();
    socket = undefined;
  };

  const open = () => {
    if (closed) throw new SpotlightCapabilityError("CAPABILITY_LEASE_FENCED", "Capability channel is closed.");
    socket?.close();
    const create = options.createWebSocket ?? ((url: string) => new WebSocket(url));
    const origin = typeof location === "undefined" ? "http://localhost" : location.origin;
    const base = new URL(options.endpoint.replace(/\/$/, "") + "/", origin);
    const channelPath = options.handshake.capabilityChannelUrl.replace(/^\//, "");
    const url = new URL(channelPath, base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    socket = create(url.toString());
    socket.onopen = () => {
      send({
        type: "client_hello",
        protocolVersion: SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
        capabilityChannelToken: channelToken,
        browserInstanceId: options.identity.browserInstanceId,
        tabInstanceId: options.identity.tabInstanceId,
      });
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => send({ type: "heartbeat", ...fence(), sentAt: new Date().toISOString() }), 5_000);
      if (renewal) clearInterval(renewal);
      renewal = setInterval(() => {
        if (renewalPending) return;
        renewalPending = true;
        void renew().catch(() => close()).finally(() => { renewalPending = false; });
      }, 5_000);
    };
    socket.onmessage = (event) => {
      void (async () => {
        const message = JSON.parse(String(event.data)) as CapabilityChannelServerMessageV1;
        if (message.type === "host_action_request") {
          for (const response of await executor.execute(message)) send(response);
        } else if (message.type === "channel_fenced") {
          close();
        }
      })();
    };
    socket.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (renewal) clearInterval(renewal);
      heartbeat = undefined;
      renewal = undefined;
    };
  };

  const post = async <T>(path: string, body: unknown): Promise<T> =>
    capabilityResponseJson<T>(await options.fetch(`${options.endpoint.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.identity.signal,
    }));

  const renew = async (): Promise<RenewCapabilityLeaseResultV1> => {
    const current = fence();
    const result = await post<RenewCapabilityLeaseResultV1>(
      `/v1/capabilities/leases/${encodeURIComponent(current.leaseId)}/renew`,
      { ...current, expectedLeaseVersion: current.leaseVersion, liveTools: options.registry.liveTools() },
    );
    if (result.status === "revoked") {
      close();
      throw new SpotlightCapabilityError("CAPABILITY_LEASE_REVOKED", result.reason);
    }
    leaseVersion = result.leaseVersion;
    return result;
  };

  return Object.freeze({
    open,
    close,
    fence,
    renew,
    async reconnect() {
      const current = fence();
      const reserved = await post<ReservedCapabilityConnectionV1>(
        `/v1/capabilities/leases/${encodeURIComponent(current.leaseId)}/connections`,
        {
          expectedConnectionId: current.connectionId,
          expectedConnectionEpoch: current.connectionEpoch,
          expectedLeaseVersion: current.leaseVersion,
          browserInstanceId: current.browserInstanceId,
          tabInstanceId: current.tabInstanceId,
        },
      );
      leaseVersion = reserved.leaseVersion;
      connectionId = reserved.connectionId;
      connectionEpoch = reserved.connectionEpoch;
      channelToken = reserved.capabilityChannelToken;
      open();
    },
  });
}
