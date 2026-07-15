import type {
  FrontendToolDescriptorV1,
  HostActionFenceV2,
} from "@inupedia/spotlight-protocol";

export interface FrontendToolHandlerContextV1 {
  projectId: string;
  sessionId: string;
  callId: string;
  attempt: number;
  fence: Readonly<HostActionFenceV2>;
  idempotencyKey?: string;
  signal: AbortSignal;
}

export interface FrontendToolDefinitionV1<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput = unknown,
> extends FrontendToolDescriptorV1 {
  execute: (
    input: TInput,
    context: FrontendToolHandlerContextV1,
  ) => TOutput | Promise<TOutput>;
}

/** Heterogeneous project registry erases handler generics only at the collection boundary. */
export type AnyFrontendToolDefinitionV1 = FrontendToolDefinitionV1<any, any>;

export interface SpotlightProjectV1 {
  readonly projectId: string;
  readonly skillRoots?: readonly string[];
  readonly tools: readonly AnyFrontendToolDefinitionV1[];
}

export function defineFrontendTool<
  TInput extends Record<string, unknown>,
  TOutput = unknown,
>(definition: FrontendToolDefinitionV1<TInput, TOutput>): FrontendToolDefinitionV1<TInput, TOutput> {
  if (typeof definition.execute !== "function") {
    throw new TypeError("Frontend Tool execute must be a function.");
  }
  return Object.freeze({ ...definition });
}

export function defineSpotlightProject(input: {
  projectId: string;
  skillRoots?: readonly string[];
  tools: readonly AnyFrontendToolDefinitionV1[];
}): SpotlightProjectV1 {
  const projectId = input.projectId.trim();
  if (!projectId) throw new TypeError("Spotlight projectId must be non-empty.");
  const identities = new Set<string>();
  for (const tool of input.tools) {
    const identity = `${tool.name}@${tool.version}`;
    if (identities.has(identity)) throw new TypeError(`Duplicate Frontend Tool: ${identity}`);
    identities.add(identity);
  }
  return Object.freeze({
    projectId,
    ...(input.skillRoots
      ? { skillRoots: Object.freeze([...input.skillRoots]) }
      : {}),
    tools: Object.freeze([...input.tools]),
  });
}

export function projectToolDescriptors(
  project: Pick<SpotlightProjectV1, "tools">,
): FrontendToolDescriptorV1[] {
  return project.tools.map(({ execute: _execute, ...descriptor }) =>
    JSON.parse(JSON.stringify(descriptor)) as FrontendToolDescriptorV1,
  );
}

export interface FrontendToolRegistryV1 {
  readonly projectId: string;
  get(name: string, version: string): AnyFrontendToolDefinitionV1 | undefined;
  setLive(name: string, version: string, live: boolean): void;
  liveTools(): Array<{ name: string; version: string }>;
  descriptors(): FrontendToolDescriptorV1[];
}

export function createFrontendToolRegistry(project: SpotlightProjectV1): FrontendToolRegistryV1 {
  const definitions = new Map<string, AnyFrontendToolDefinitionV1>(
    project.tools.map((tool) => [`${tool.name}@${tool.version}`, tool] as const),
  );
  const live = new Set(definitions.keys());
  const key = (name: string, version: string) => `${name}@${version}`;
  return Object.freeze({
    projectId: project.projectId,
    get: (name: string, version: string) => definitions.get(key(name, version)),
    setLive(name: string, version: string, value: boolean) {
      const identity = key(name, version);
      if (!definitions.has(identity)) throw new TypeError(`Unknown Frontend Tool: ${identity}`);
      if (value) live.add(identity);
      else live.delete(identity);
    },
    liveTools: () => [...live].sort().map((identity) => {
      const tool = definitions.get(identity)!;
      return { name: tool.name, version: tool.version };
    }),
    descriptors: () => projectToolDescriptors(project),
  });
}
