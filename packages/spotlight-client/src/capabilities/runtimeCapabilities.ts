import type { CapabilityBuildInfoV1 } from "../vite/capabilityBuildTypes.js";

export interface RegisteredCapabilityRuntimeV1 {
  capabilityBuildInfo: Readonly<CapabilityBuildInfoV1>;
  openUploadStream: () => Promise<{ digest: string; byteLength: number; contentType: "application/gzip"; stream: ReadableStream<Uint8Array> }>;
}

interface RuntimeStoreV1 {
  providers: Map<string, RegisteredCapabilityRuntimeV1>;
  listeners: Map<string, Set<(info: Readonly<CapabilityBuildInfoV1>) => void>>;
}

export const CAPABILITY_RUNTIME_SYMBOL_V1 = "inupedia.spotlight.capability-runtime/1";

function store(): RuntimeStoreV1 {
  const root = globalThis as typeof globalThis & { [key: symbol]: RuntimeStoreV1 };
  const key = Symbol.for(CAPABILITY_RUNTIME_SYMBOL_V1);
  return root[key] ??= { providers: new Map(), listeners: new Map() };
}

export function registerCapabilityRuntimeV1(runtime: RegisteredCapabilityRuntimeV1): void {
  const state = store();
  state.providers.set(runtime.capabilityBuildInfo.projectId, runtime);
  for (const listener of state.listeners.get(runtime.capabilityBuildInfo.projectId) ?? []) listener(runtime.capabilityBuildInfo);
}

export function getCapabilityRuntimeV1(projectId: string) {
  const state = store();
  const provider = state.providers.get(projectId);
  if (!provider) return undefined;
  return Object.freeze({
    ...provider,
    subscribe(listener: (info: Readonly<CapabilityBuildInfoV1>) => void) {
      const listeners = state.listeners.get(projectId) ?? new Set();
      listeners.add(listener);
      state.listeners.set(projectId, listeners);
      return () => listeners.delete(listener);
    },
  });
}

export function subscribeCapabilityRuntimeV1(
  projectId: string,
  listener: (info: Readonly<CapabilityBuildInfoV1>) => void,
): () => void {
  const state = store();
  const listeners = state.listeners.get(projectId) ?? new Set();
  listeners.add(listener);
  state.listeners.set(projectId, listeners);
  return () => listeners.delete(listener);
}

export function waitForCapabilityRuntimeV1(
  projectId: string,
  signal?: AbortSignal,
): Promise<RegisteredCapabilityRuntimeV1> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  const existing = getCapabilityRuntimeV1(projectId);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const onAbort = () => { unsubscribe(); reject(signal?.reason ?? new DOMException("Aborted", "AbortError")); };
    const unsubscribe = subscribeCapabilityRuntimeV1(projectId, () => {
      const registered = getCapabilityRuntimeV1(projectId);
      if (!registered) return;
      unsubscribe();
      signal?.removeEventListener("abort", onAbort);
      resolve(registered);
    });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
