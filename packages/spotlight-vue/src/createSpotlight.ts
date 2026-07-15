import type { App, InjectionKey, Plugin } from "vue";
import {
  createCapabilityClient,
  createFrontendToolRegistry,
  type CapabilityConnectInputV1,
  type CapabilityConnectResultV1,
  type SpotlightProjectV1,
} from "@inupedia/spotlight-client";
import type { CapabilityBuildInfoV1 } from "@inupedia/spotlight-client/vite";

export interface SpotlightCapabilityRuntimeV1 {
  readonly project: SpotlightProjectV1;
  connect(input: CapabilityConnectInputV1): Promise<CapabilityConnectResultV1>;
  disconnect(sessionId: string): void;
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
  endpoint: string;
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
  const registry = createFrontendToolRegistry(options.project);
  const active = new Map<string, CapabilityConnectResultV1>();
  let pendingBuildInfo: Readonly<CapabilityBuildInfoV1> | undefined;
  let buildModule: Promise<{ capabilityBuildInfo: Readonly<CapabilityBuildInfoV1>; openUploadStream: NonNullable<CreateSpotlightOptionsV1["openUploadStream"]> }> | undefined;
  let capabilityClient: ReturnType<typeof createCapabilityClient> | undefined;
  const loadBuildModule = () => buildModule ??= options.capabilities
    ? Promise.resolve(options.capabilities)
    : options.capabilityBuildInfo && options.openUploadStream
      ? Promise.resolve({ capabilityBuildInfo: options.capabilityBuildInfo, openUploadStream: options.openUploadStream })
      : Promise.reject(new Error("Spotlight capabilities are missing. Pass the virtual:spotlight/capabilities module to createSpotlight()."));
  const runtime: SpotlightPluginV1 = Object.assign(
    {
      project: options.project,
      async connect(input: CapabilityConnectInputV1) {
        const existing = active.get(input.sessionId);
        if (existing) return existing;
        const capabilities = await loadBuildModule();
        capabilityClient ??= createCapabilityClient({
          endpoint: options.endpoint,
          project: options.project,
          registry,
          buildInfo: capabilities.capabilityBuildInfo,
          openUploadStream: capabilities.openUploadStream,
          fetch: options.fetch,
          createWebSocket: options.createWebSocket,
        });
        const connected = await capabilityClient.connect(input);
        active.set(input.sessionId, connected);
        return connected;
      },
      disconnect(sessionId: string) {
        active.get(sessionId)?.channel?.close();
        active.delete(sessionId);
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
        app.provide(SPOTLIGHT_CAPABILITY_RUNTIME_KEY, runtime);
      },
    },
  );
  Object.freeze(runtime);
  return runtime;
}
