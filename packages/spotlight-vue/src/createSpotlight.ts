import type { App, InjectionKey, Plugin } from "vue";
import {
  createCapabilityClient,
  createFrontendToolRegistry,
  subscribeCapabilityRuntimeV1,
  waitForCapabilityRuntimeV1,
  type CapabilityConnectInputV1,
  type CapabilityConnectResultV1,
  type SpotlightClientConfig,
  type SpotlightProjectV1,
} from "@inupedia/spotlight-client";
import type { CapabilityBuildInfoV1 } from "@inupedia/spotlight-client/vite";

export interface SpotlightCapabilityRuntimeV1 {
  readonly project: SpotlightProjectV1;
  connect(input: CapabilityConnectInputV1): Promise<CapabilityConnectResultV1>;
  disconnect(sessionId: string): void;
  dispose(): void;
  pendingBuild(): Readonly<CapabilityBuildInfoV1> | undefined;
  notifyBuild(buildInfo: Readonly<CapabilityBuildInfoV1>): void;
}

export const SPOTLIGHT_CAPABILITY_RUNTIME_KEY: InjectionKey<SpotlightCapabilityRuntimeV1> =
  Symbol("spotlight-capability-runtime");
let installedCapabilityRuntime: SpotlightCapabilityRuntimeV1 | undefined;

export function getSpotlightCapabilityRuntime(): SpotlightCapabilityRuntimeV1 | undefined {
  return installedCapabilityRuntime;
}

export interface CreateSpotlightOptionsV1 {
  /** Reuse the same config as SpotlightVue so endpoint and auth cannot drift. */
  config?: Pick<SpotlightClientConfig, "serverUrl" | "apiKey">;
  /** @deprecated Prefer config.serverUrl. */
  endpoint?: string;
  /** @deprecated Prefer config.apiKey. */
  apiKey?: string;
  project: SpotlightProjectV1;
  capabilities?: {
    capabilityBuildInfo: Readonly<CapabilityBuildInfoV1>;
    openUploadStream: NonNullable<CreateSpotlightOptionsV1["openUploadStream"]>;
  };
  capabilityBuildInfo?: Readonly<CapabilityBuildInfoV1>;
  openUploadStream?: () => Promise<{
    digest: string;
    byteLength: number;
    contentType: "application/gzip";
    stream: ReadableStream<Uint8Array>;
  }>;
  fetch?: typeof globalThis.fetch;
  createWebSocket?: (url: string) => WebSocket;
}

export type SpotlightPluginV1 = Plugin & SpotlightCapabilityRuntimeV1;

export function createSpotlight(options: CreateSpotlightOptionsV1): SpotlightPluginV1 {
  const endpoint = options.config?.serverUrl?.trim() || options.endpoint?.trim();
  if (!endpoint) throw new Error("createSpotlight: config.serverUrl or endpoint is required");
  const apiKey = options.config?.apiKey?.trim() || options.apiKey?.trim() || undefined;
  const registry = createFrontendToolRegistry(options.project);
  const active = new Map<string, CapabilityConnectResultV1>();
  const connecting = new Map<string, { promise: Promise<CapabilityConnectResultV1>; controller: AbortController; cleanup: () => void }>();
  let pendingBuildInfo: Readonly<CapabilityBuildInfoV1> | undefined;
  let buildModule: Promise<{ capabilityBuildInfo: Readonly<CapabilityBuildInfoV1>; openUploadStream: NonNullable<CreateSpotlightOptionsV1["openUploadStream"]> }> | undefined;
  let capabilityClient: ReturnType<typeof createCapabilityClient> | undefined;
  let unsubscribeBuild: (() => void) | undefined;
  const loadBuildModule = (signal?: AbortSignal) => {
    if (buildModule) return buildModule;
    if (options.capabilities) return buildModule = Promise.resolve(options.capabilities);
    if (options.capabilityBuildInfo && options.openUploadStream) return buildModule = Promise.resolve({ capabilityBuildInfo: options.capabilityBuildInfo, openUploadStream: options.openUploadStream });
    return waitForCapabilityRuntimeV1(options.project.projectId, signal);
  };
  const runtime: SpotlightPluginV1 = Object.assign(
    {
      project: options.project,
      async connect(input: CapabilityConnectInputV1) {
        const pending = connecting.get(input.sessionId);
        if (pending) return pending.promise;
        const controller = new AbortController();
        const abortFromCaller = () => controller.abort(input.signal?.reason);
        if (input.signal?.aborted) controller.abort(input.signal.reason);
        else input.signal?.addEventListener("abort", abortFromCaller, { once: true });
        const cleanup = () => input.signal?.removeEventListener("abort", abortFromCaller);
        const attempt = (async () => {
        const existing = active.get(input.sessionId);
        if (existing) {
          if (!existing.channel) return existing;
          try {
            await existing.channel.renew();
            return existing;
          } catch {
            if (active.get(input.sessionId) === existing) {
              existing.channel.close();
              active.delete(input.sessionId);
              // Offer ids are scoped to a Capability client. A dead lease must
              // start a fresh idempotency scope instead of replaying its terminal
              // Handshake response forever.
              capabilityClient = undefined;
            }
          }
        }
        const capabilities = await loadBuildModule(controller.signal);
        capabilityClient ??= createCapabilityClient({
          endpoint,
          apiKey,
          project: options.project,
          registry,
          buildInfo: capabilities.capabilityBuildInfo,
          openUploadStream: capabilities.openUploadStream,
          fetch: options.fetch,
          createWebSocket: options.createWebSocket,
        });
        const connected = await capabilityClient.connect({ ...input, signal: controller.signal });
        if (controller.signal.aborted) { connected.channel?.close(); throw new DOMException("Capability connect aborted.", "AbortError"); }
        active.set(input.sessionId, connected);
        return connected;
        })();
        connecting.set(input.sessionId, { promise: attempt, controller, cleanup });
        try { return await attempt; } finally { const current=connecting.get(input.sessionId); if(current?.promise===attempt){current.cleanup();connecting.delete(input.sessionId);} }
      },
      disconnect(sessionId: string) {
        connecting.get(sessionId)?.controller.abort(new DOMException("Capability connect disconnected.", "AbortError"));
        active.get(sessionId)?.channel?.close();
        active.delete(sessionId);
      },
      dispose() {
        for (const connected of active.values()) connected.channel?.close();
        active.clear(); for(const entry of connecting.values()){entry.controller.abort(new DOMException("Spotlight disposed.","AbortError"));entry.cleanup();} connecting.clear(); unsubscribeBuild?.(); unsubscribeBuild = undefined;
        if (installedCapabilityRuntime === runtime) installedCapabilityRuntime = undefined;
      },
      pendingBuild: () => pendingBuildInfo,
      notifyBuild(buildInfo: Readonly<CapabilityBuildInfoV1>) {
        if (active.size > 0 || buildInfo.artifactDigest !== options.capabilityBuildInfo?.artifactDigest) {
          pendingBuildInfo = Object.freeze({ ...buildInfo });
        } else {
          buildModule = undefined;
          capabilityClient = undefined;
        }
      },
      install(app: App) {
        installedCapabilityRuntime = runtime;
        unsubscribeBuild?.();
        unsubscribeBuild = subscribeCapabilityRuntimeV1(options.project.projectId, (info) => runtime.notifyBuild(info));
        app.provide(SPOTLIGHT_CAPABILITY_RUNTIME_KEY, runtime);
      },
    },
  );
  Object.freeze(runtime);
  return runtime;
}
