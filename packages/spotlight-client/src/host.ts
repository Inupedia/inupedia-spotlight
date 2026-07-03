import type {
  ClientToolDescriptor,
  HostToolEffect,
  HostToolExecutionResult,
  RemoteHostToolCall,
  SpotlightCommandCatalog,
  SpotlightHostToolsManifest,
  SpotlightSkill,
} from "@inupedia/spotlight-protocol";
import type { SpotlightHttp } from "./http.js";

export type SpotlightHostToolHandlerContext = {
  input: Record<string, unknown>;
  call: RemoteHostToolCall;
  hostEffect?: HostToolEffect;
};

export type SpotlightHostTool = {
  name: string;
  displayName?: string;
  description?: string;
  handler: (ctx: SpotlightHostToolHandlerContext) => Promise<unknown>;
};

export type SessionHostToolHandler = (
  call: RemoteHostToolCall,
  ctx: SpotlightHostToolHandlerContext,
) => Promise<HostToolExecutionResult>;

export function buildClientToolsManifest(
  tools: SpotlightHostTool[],
): ClientToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    displayName: tool.displayName,
    description: tool.description,
    executionTarget: "host" as const,
  }));
}

export function resolveHostTools(tools: SpotlightHostTool[]): Map<string, SpotlightHostTool> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function resolveRemoteHostInvocation(
  call: RemoteHostToolCall,
  hostEffect?: HostToolEffect,
): { toolName: string; input: Record<string, unknown> } {
  if (
    hostEffect?.type === "host.tool" &&
    typeof hostEffect.target === "string" &&
    hostEffect.target.trim()
  ) {
    return { toolName: hostEffect.target.trim(), input: call.input };
  }
  return { toolName: call.name, input: call.input };
}

export async function executeHostTool(
  toolMap: Map<string, SpotlightHostTool>,
  call: RemoteHostToolCall,
  options: {
    allowedHostNames: Set<string>;
    hostEffect?: HostToolEffect;
    sessionToolHandler?: SessionHostToolHandler;
  },
): Promise<HostToolExecutionResult> {
  const { toolName, input } = resolveRemoteHostInvocation(
    call,
    options.hostEffect,
  );

  if (!options.allowedHostNames.has(toolName)) {
    return {
      success: false,
      error: `Host tool not in manifest: ${toolName}`,
      errorCode: "HOST_TOOL_NOT_MANIFEST",
      trace: [],
      executionTarget: "host",
    };
  }

  const routedCall: RemoteHostToolCall = { ...call, name: toolName, input };
  const ctx: SpotlightHostToolHandlerContext = {
    input,
    call: routedCall,
    hostEffect: options.hostEffect,
  };

  if (options.sessionToolHandler && toolName === "session.repeatLastAnswer") {
    return options.sessionToolHandler(routedCall, ctx);
  }

  const tool = toolMap.get(toolName);
  if (!tool) {
    return {
      success: false,
      error: `Host tool not registered locally: ${toolName}`,
      errorCode: "UNKNOWN_TOOL",
      trace: [],
      executionTarget: "host",
    };
  }

  try {
    const data = await tool.handler(ctx);
    return {
      success: true,
      data,
      trace: [],
      executionTarget: "host",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: "TOOL_RUN_FAILED",
      trace: [],
      executionTarget: "host",
    };
  }
}

let cachedManifest: SpotlightHostToolsManifest | null = null;
let inflightManifest: Promise<SpotlightHostToolsManifest> | null = null;

export async function fetchHostToolsManifest(
  http: SpotlightHttp,
  signal?: AbortSignal,
): Promise<SpotlightHostToolsManifest> {
  if (cachedManifest) return cachedManifest;
  inflightManifest ??= (async () => {
    const data = await http.getJson<SpotlightHostToolsManifest>(
      "/v1/meta/host-tools",
      signal,
    );
    if (
      typeof data.version !== "string" ||
      !data.version.trim() ||
      !Array.isArray(data.tools)
    ) {
      throw new Error("Spotlight host-tools manifest: invalid response shape");
    }
    cachedManifest = data;
    return data;
  })().finally(() => {
    inflightManifest = null;
  });
  return inflightManifest;
}

export function resetHostToolsManifestCacheForTests(): void {
  cachedManifest = null;
  inflightManifest = null;
}

export async function fetchDefaultCommandCatalog(
  http: SpotlightHttp,
  signal?: AbortSignal,
): Promise<SpotlightCommandCatalog> {
  const data = await http.getJson<{ catalog?: SpotlightCommandCatalog }>(
    http.appendProjectQuery("/v1/meta/default-command-catalog"),
    signal,
  );
  if (!data.catalog) {
    throw new Error("default-command-catalog: missing catalog");
  }
  return data.catalog;
}

function actionKey(action: { domain: string; action: string }): string {
  return `${action.domain}\0${action.action}`;
}

export function mergeCommandCatalogs(
  base: SpotlightCommandCatalog,
  overlay: SpotlightCommandCatalog | undefined | null,
): SpotlightCommandCatalog {
  if (!overlay) return base;

  const actions = new Map<string, SpotlightCommandCatalog["actions"][number]>();
  for (const a of base.actions) actions.set(actionKey(a), a);
  for (const a of overlay.actions ?? []) actions.set(actionKey(a), a);

  const targets = new Map<string, SpotlightCommandCatalog["targets"][number]>();
  for (const t of base.targets) targets.set(t.id, t);
  for (const t of overlay.targets ?? []) targets.set(t.id, t);

  const video = new Map<
    string,
    NonNullable<SpotlightCommandCatalog["videoChannels"]>[number]
  >();
  for (const v of base.videoChannels ?? []) video.set(v.id, v);
  for (const v of overlay.videoChannels ?? []) video.set(v.id, v);

  const bindings = new Map<
    string,
    SpotlightCommandCatalog["actionBindings"][number]
  >();
  for (const b of base.actionBindings) bindings.set(b.action, b);
  for (const b of overlay.actionBindings ?? []) bindings.set(b.action, b);

  const scopes = [...new Set([...base.scopes, ...(overlay.scopes ?? [])])];
  const domainLabels = { ...base.domainLabels, ...overlay.domainLabels };
  const useBundledGuards =
    overlay.useBundledGuards !== undefined
      ? overlay.useBundledGuards
      : base.useBundledGuards;

  const merged: SpotlightCommandCatalog = {
    actions: [...actions.values()],
    targets: [...targets.values()],
    actionBindings: [...bindings.values()],
    scopes,
    domainLabels:
      Object.keys(domainLabels).length > 0 ? domainLabels : undefined,
    useBundledGuards,
  };

  if (video.size > 0) {
    merged.videoChannels = [...video.values()];
  }

  return merged;
}

/** Strip skill bodies before create-run; server loads via skill.invoke. */
export function serializeSkillsForRemote(skills: SpotlightSkill[]): SpotlightSkill[] {
  return skills.map(
    ({
      skillInstructionBody: _body,
      skillPackAppendix: _appendix,
      loadedFrom: _loadedFrom,
      sourcePath: _sourcePath,
      ...meta
    }) => meta,
  );
}

export function createSpotlightHostAdapter(options: {
  tools: SpotlightHostTool[] | (() => SpotlightHostTool[]);
}) {
  const resolveTools = (): SpotlightHostTool[] =>
    typeof options.tools === "function" ? options.tools() : options.tools;

  return {
    getClientToolDescriptors(): ClientToolDescriptor[] {
      return buildClientToolsManifest(resolveTools());
    },
    getToolMap(): Map<string, SpotlightHostTool> {
      return resolveHostTools(resolveTools());
    },
    executeHostTool(
      call: RemoteHostToolCall,
      execOptions: {
        allowedHostNames: Set<string>;
        hostEffect?: HostToolEffect;
        sessionToolHandler?: SessionHostToolHandler;
      },
    ): Promise<HostToolExecutionResult> {
      return executeHostTool(this.getToolMap(), call, execOptions);
    },
  };
}

export type SpotlightHostAdapter = ReturnType<typeof createSpotlightHostAdapter>;
