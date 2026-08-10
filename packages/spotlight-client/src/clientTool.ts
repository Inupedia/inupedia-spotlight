import {
  SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
  type FrontendToolDescriptorV1,
  type FrontendToolManifestV1,
  type JsonSchemaV1,
  type ToolReplayPolicyV1,
  type ToolRiskLevelV1,
  type ToolSideEffectV1,
} from "@inupedia/spotlight-protocol";

export const CLIENT_TOOL_META = Symbol.for("inupedia.spotlight.client-tool");

export interface ClientToolSchemaOverride {
  input: JsonSchemaV1;
  output?: JsonSchemaV1;
}

export interface ClientToolOptions {
  /** Escape hatch for types the build plugin cannot safely infer. */
  schema?: ClientToolSchemaOverride;
  version?: string;
  sideEffect?: ToolSideEffectV1;
  replayPolicy?: ToolReplayPolicyV1;
  riskLevel?: ToolRiskLevelV1;
  requiresConfirmation?: boolean;
  maxOutputBytes?: number;
}

export interface GeneratedClientToolMeta extends ClientToolOptions {
  name: string;
  description: string;
  schema: ClientToolSchemaOverride;
}

export type ClientToolHandler<TInput, TOutput> = (
  input: TInput,
) => TOutput | Promise<TOutput>;

export type ClientTool<TInput = never, TOutput = unknown> =
  ClientToolHandler<TInput, TOutput> & {
    readonly [CLIENT_TOOL_META]: GeneratedClientToolMeta;
  };

function isGeneratedMeta(
  value: ClientToolOptions | GeneratedClientToolMeta | undefined,
): value is GeneratedClientToolMeta {
  return Boolean(
    value &&
      "name" in value &&
      typeof value.name === "string" &&
      "description" in value &&
      typeof value.description === "string" &&
      value.schema?.input,
  );
}

/**
 * Define a browser-side tool. Name, JSDoc and schemas are injected by the
 * Spotlight Vite plugin. Pass `schema` only as an explicit inference escape hatch.
 */
export function defineClientTool<TInput = void, TOutput = void>(
  handler: ClientToolHandler<TInput, TOutput>,
  options?: ClientToolOptions | GeneratedClientToolMeta,
): ClientTool<TInput, TOutput> {
  if (!isGeneratedMeta(options)) {
    throw new Error(
      "defineClientTool() requires build metadata. Add spotlightClientTools() to Vite plugins, or provide code transformed by that plugin.",
    );
  }
  Object.defineProperty(handler, CLIENT_TOOL_META, {
    configurable: false,
    enumerable: false,
    value: Object.freeze(options),
    writable: false,
  });
  return handler as ClientTool<TInput, TOutput>;
}

export function getClientToolDescriptor(
  tool: ClientTool,
): FrontendToolDescriptorV1 {
  const meta = tool[CLIENT_TOOL_META];
  return {
    name: meta.name,
    version: meta.version ?? "1.0.0",
    description: meta.description,
    inputSchema: meta.schema.input,
    outputSchema: meta.schema.output,
    maxOutputBytes: meta.maxOutputBytes,
    sideEffect: meta.sideEffect ?? "ui",
    replayPolicy: meta.replayPolicy ?? "never",
    riskLevel: meta.riskLevel ?? "low",
    requiresConfirmation: meta.requiresConfirmation ?? false,
  };
}

export function createClientToolRegistry(tools: readonly ClientTool[]) {
  const byName = new Map<string, ClientTool>();
  for (const tool of tools) {
    const descriptor = getClientToolDescriptor(tool);
    if (byName.has(descriptor.name)) {
      throw new Error(`Duplicate client tool: ${descriptor.name}`);
    }
    byName.set(descriptor.name, tool);
  }
  return {
    descriptors: [...byName.values()].map(getClientToolDescriptor),
    has(name: string): boolean {
      return byName.has(name);
    },
    async execute(name: string, input: unknown): Promise<unknown> {
      const tool = byName.get(name);
      if (!tool) throw new Error(`Client tool is not registered: ${name}`);
      return (tool as unknown as ClientToolHandler<unknown, unknown>)(input);
    },
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function createClientToolManifest(options: {
  projectId: string;
  frontendBuildId: string;
  tools: readonly ClientTool[];
}): Promise<FrontendToolManifestV1> {
  const registry = createClientToolRegistry(options.tools);
  const tools = [...registry.descriptors].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const unsigned = {
    protocolVersion: SPOTLIGHT_CAPABILITY_PROTOCOL_V1,
    projectId: options.projectId,
    frontendBuildId: options.frontendBuildId,
    tools,
  };
  return {
    ...unsigned,
    manifestDigest: await sha256(stableJson(unsigned)),
  };
}
