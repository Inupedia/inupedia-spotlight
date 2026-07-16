import {
  SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
  type CapabilityHandshakeResultV1,
  type CapabilityOfferV1,
} from "@inupedia/spotlight-protocol";
import type { CapabilityBuildInfoV1 } from "../vite/capabilityBuildTypes.js";
import type { FrontendToolRegistryV1, SpotlightProjectV1 } from "../tools/frontendTool.js";
import { createCapabilityChannel, type CapabilityChannelV1 } from "./channel.js";
import { capabilityResponseJson } from "./errors.js";
import { createRuntimeId } from "../runtimeId.js";

export interface CapabilityConnectInputV1 {
  sessionId: string;
  browserInstanceId: string;
  tabInstanceId: string;
  signal?: AbortSignal;
  openChannel?: boolean;
}

export interface CapabilityConnectResultV1 {
  handshake: Extract<CapabilityHandshakeResultV1, { status: "accepted" }>;
  channel?: CapabilityChannelV1;
}

export interface CreateCapabilityClientOptionsV1 {
  endpoint: string;
  project: SpotlightProjectV1;
  registry: FrontendToolRegistryV1;
  buildInfo: Readonly<CapabilityBuildInfoV1>;
  openUploadStream: () => Promise<{
    digest: string;
    byteLength: number;
    contentType: "application/gzip";
    stream: ReadableStream<Uint8Array>;
  }>;
  fetch?: typeof globalThis.fetch;
  createOfferId?: () => string;
  createWebSocket?: (url: string) => WebSocket;
}

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

export function createCapabilityClient(options: CreateCapabilityClientOptionsV1) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const offerIds = new Map<string, string>();
  const offerIdFor = (key: string) => {
    const existing = offerIds.get(key);
    if (existing) return existing;
    const created = options.createOfferId?.() ?? createRuntimeId();
    offerIds.set(key, created);
    return created;
  };

  async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return capabilityResponseJson<T>(await fetcher(endpoint(options.endpoint, path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }));
  }

  return Object.freeze({
    async connect(input: CapabilityConnectInputV1): Promise<CapabilityConnectResultV1> {
      const key = [input.sessionId, options.buildInfo.frontendBuildId, options.buildInfo.artifactDigest, input.browserInstanceId, input.tabInstanceId].join("\u0000");
      const offer: CapabilityOfferV1 = {
        protocolVersion: SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
        offerId: offerIdFor(key),
        projectId: options.project.projectId,
        sessionId: input.sessionId,
        frontendBuildId: options.buildInfo.frontendBuildId,
        browserInstanceId: input.browserInstanceId,
        tabInstanceId: input.tabInstanceId,
        capabilityArtifact: {
          digest: options.buildInfo.artifactDigest,
          manifestDigest: options.buildInfo.manifestDigest,
          skillManifestDigest: options.buildInfo.skillManifestDigest,
          toolManifestDigest: options.buildInfo.toolManifestDigest,
          byteLength: options.buildInfo.byteLength,
        },
        liveTools: options.registry.liveTools(),
      };
      let handshake = await post<CapabilityHandshakeResultV1>("/v1/capabilities/handshakes", offer, input.signal);
      if (handshake.status === "upload_required") {
        const upload = await options.openUploadStream();
        const uploadRequest = {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${handshake.uploadToken}`,
            "Content-Type": upload.contentType,
            "Content-Length": String(upload.byteLength),
          },
          body: upload.stream,
          signal: input.signal,
          duplex: "half",
        } as RequestInit;
        await capabilityResponseJson(await fetcher(endpoint(options.endpoint, handshake.uploadUrl), uploadRequest));
        handshake = await post<CapabilityHandshakeResultV1>(
          `/v1/capabilities/handshakes/${encodeURIComponent(handshake.handshakeId)}/resume`,
          { resumeToken: handshake.resumeToken },
          input.signal,
        );
      }
      if (handshake.status !== "accepted") throw new Error("Capability Handshake did not reach a terminal accepted state.");
      const channel = input.openChannel === false ? undefined : createCapabilityChannel({
        endpoint: options.endpoint,
        handshake,
        identity: input,
        registry: options.registry,
        fetch: fetcher,
        createWebSocket: options.createWebSocket,
      });
      if (channel) channel.open();
      return { handshake, ...(channel ? { channel } : {}) };
    },
  });
}
