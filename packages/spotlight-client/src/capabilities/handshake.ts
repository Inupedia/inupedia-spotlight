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
  /** API key applied to all Capability HTTP requests. */
  apiKey?: string;
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

async function readUploadBody(
  stream: ReadableStream<Uint8Array>,
  byteLength: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error("Capability Artifact upload byte length is invalid.");
  }
  const body = new Uint8Array(byteLength);
  const reader = stream.getReader();
  let offset = 0;
  const abortReason = () => signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("Capability upload aborted.", "AbortError");
  const cancelReader = () => {
    void reader.cancel(abortReason()).catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelReader, { once: true });
  if (signal?.aborted) cancelReader();
  try {
    while (true) {
      if (signal?.aborted) {
        throw abortReason();
      }
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortReason();
      if (done) break;
      if (offset + value.byteLength > byteLength) {
        throw new Error("Capability Artifact upload exceeded its declared byte length.");
      }
      body.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
  if (offset !== byteLength) {
    throw new Error("Capability Artifact upload did not match its declared byte length.");
  }
  return body;
}

export function createCapabilityClient(options: CreateCapabilityClientOptionsV1) {
  const rawFetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const apiKey = options.apiKey?.trim();
  const fetcher: typeof globalThis.fetch = apiKey
    ? (input, init = {}) => {
        const headers = new Headers(init.headers);
        if (!headers.has("X-Spotlight-Api-Key")) {
          headers.set("X-Spotlight-Api-Key", apiKey);
        }
        return rawFetcher(input, { ...init, headers });
      }
    : rawFetcher;
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
        const uploadBody = await readUploadBody(upload.stream, upload.byteLength, input.signal);
        const uploadRequest = {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${handshake.uploadToken}`,
            "Content-Type": upload.contentType,
          },
          body: uploadBody,
          signal: input.signal,
        } as RequestInit;
        const uploadUrl = endpoint(options.endpoint, handshake.uploadUrl);
        let uploadResponse: Response;
        try {
          uploadResponse = await fetcher(uploadUrl, uploadRequest);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(
            `Capability Artifact upload request failed (${uploadUrl}): ${detail}`,
            { cause: error },
          );
        }
        await capabilityResponseJson(uploadResponse);
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
