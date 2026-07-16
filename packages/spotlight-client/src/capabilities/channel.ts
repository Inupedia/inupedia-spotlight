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
  let renewalPendingGeneration: number | undefined;
  let renewPending: Promise<RenewCapabilityLeaseResultV1> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;
  let generation = 0;
  let reservationSerial = 0;
  let closed = false;
  let mutationTail: Promise<void> = Promise.resolve();
  const lifecycle = new AbortController();
  let reserveAndOpen!: () => Promise<void>;
  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    const delay = Math.min(250 * 2 ** reconnectAttempt, 5_000);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void reserveAndOpen().catch((error: unknown) => {
        if (
          error instanceof SpotlightCapabilityError &&
          ["HOST_OFFLINE", "CAPABILITY_LEASE_REVOKED", "CAPABILITY_LEASE_FENCED"].includes(error.code)
        ) {
          close();
          return;
        }
        scheduleReconnect();
      });
    }, delay);
  };

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

  const close = () => {
    closed = true;
    lifecycle.abort(new DOMException("Capability channel closed.", "AbortError"));
    if (heartbeat) clearInterval(heartbeat);
    if (renewal) clearInterval(renewal);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    heartbeat = undefined;
    renewal = undefined;
    if (socket) socket.onclose = null;
    socket?.close();
    socket = undefined;
  };

  const open = () => {
    if (closed) throw new SpotlightCapabilityError("CAPABILITY_LEASE_FENCED", "Capability channel is closed.");
    if (socket) socket.onclose = null;
    socket?.close();
    const create = options.createWebSocket ?? ((url: string) => new WebSocket(url));
    const origin = typeof location === "undefined" ? "http://localhost" : location.origin;
    const base = new URL(options.endpoint.replace(/\/$/, "") + "/", origin);
    const channelPath = options.handshake.capabilityChannelUrl.replace(/^\//, "");
    const url = new URL(channelPath, base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const localSocket = create(url.toString());
    const localGeneration = ++generation;
    socket = localSocket;
    const sendLocal = (message: unknown) => { if (!closed && socket === localSocket && generation === localGeneration && localSocket.readyState === 1) localSocket.send(JSON.stringify(message)); };
    localSocket.onopen = () => {
      if (socket !== localSocket || generation !== localGeneration || closed) return;
      reconnectAttempt = 0;
      sendLocal({
        type: "client_hello",
        protocolVersion: SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
        capabilityChannelToken: channelToken,
        browserInstanceId: options.identity.browserInstanceId,
        tabInstanceId: options.identity.tabInstanceId,
      });
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => sendLocal({ type: "heartbeat", ...fence(), sentAt: new Date().toISOString() }), 5_000);
      if (renewal) clearInterval(renewal);
      renewal = setInterval(() => {
        if (renewalPendingGeneration === localGeneration) return;
        renewalPendingGeneration = localGeneration;
        void renew().catch(scheduleReconnect).finally(() => { if (renewalPendingGeneration === localGeneration) renewalPendingGeneration = undefined; });
      }, 5_000);
    };
    localSocket.onmessage = (event) => {
      if (socket !== localSocket || generation !== localGeneration || closed) return;
      void (async () => {
        const message = JSON.parse(String(event.data)) as CapabilityChannelServerMessageV1;
        if (message.type === "host_action_request") {
          await executor.executeStreaming(message, sendLocal);
        } else if (message.type === "channel_fenced") {
          close();
        }
      })();
    };
    localSocket.onclose = () => {
      if (socket !== localSocket || generation !== localGeneration || closed) return;
      if (heartbeat) clearInterval(heartbeat);
      if (renewal) clearInterval(renewal);
      heartbeat = undefined;
      renewal = undefined;
      scheduleReconnect();
    };
  };

  const post = async <T>(path: string, body: unknown): Promise<T> =>
    capabilityResponseJson<T>(await options.fetch(`${options.endpoint.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: lifecycle.signal,
    }));

  const mutate = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = mutationTail.then(operation, operation);
    mutationTail = task.then(() => undefined, () => undefined);
    return task;
  };

  const performRenew = (): Promise<RenewCapabilityLeaseResultV1> => mutate(async () => {
    const current = fence();
    const startedGeneration = generation;
    const result = await post<RenewCapabilityLeaseResultV1>(
      `/v1/capabilities/leases/${encodeURIComponent(current.leaseId)}/renew`,
      { ...current, expectedLeaseVersion: current.leaseVersion, liveTools: options.registry.liveTools() },
    );
    if (startedGeneration !== generation || closed) return result;
    if (result.status === "revoked") {
      close();
      throw new SpotlightCapabilityError("CAPABILITY_LEASE_REVOKED", result.reason);
    }
    leaseVersion = result.leaseVersion;
    return result;
  });
  const renew = (): Promise<RenewCapabilityLeaseResultV1> => {
    if (renewPending) return renewPending;
    const task = performRenew();
    renewPending = task;
    const clear = () => {
      if (renewPending === task) renewPending = undefined;
    };
    void task.then(clear, clear);
    return task;
  };

  reserveAndOpen = () => mutate(async () => {
    const current = fence();
    const startedGeneration = generation;
    const serial = ++reservationSerial;
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
    if (closed || startedGeneration !== generation || serial !== reservationSerial) return;
    leaseVersion = reserved.leaseVersion;
    connectionId = reserved.connectionId;
    connectionEpoch = reserved.connectionEpoch;
    channelToken = reserved.capabilityChannelToken;
    open();
  });

  return Object.freeze({
    open,
    close,
    fence,
    renew,
    reconnect: reserveAndOpen,
  });
}
