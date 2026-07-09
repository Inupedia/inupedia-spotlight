import {
  buildAgentServiceHost,
  createSpotlightHostCore,
  loadAgentCapabilities,
  type BuildAgentServiceHostOptions,
  type SpotlightFrontendAction,
  type SpotlightHostCore,
  type SpotlightHostCoreOptions,
  type SpotlightReadableContext,
} from "@inupedia/spotlight-client";
import type {
  SpotlightCommandCatalog,
  SpotlightCommandCatalogVideoChannel,
} from "@inupedia/spotlight-protocol";
import type { SpotlightHostRegistration } from "../resolveConfig.js";
import type { SpotlightQuickPanelActions } from "../config.js";
import type { SpotlightUiPrompts } from "../remote/meta.js";
import type { OperateWorkflowDefinition } from "../workflow/operate.js";
import {
  createOperateExecutor,
} from "../workflow/operate.js";
import {
  createRunSessionHostTool,
  createSessionControlExecutor,
  type SessionControlHooksFactory,
  type SessionControlWorkflowHooks,
} from "../workflow/sessionControl.js";
import {
  normalizeSkillsOption,
  type SpotlightHostSkillsOption,
} from "./normalizeSkills.js";
import { loadBundledSkillsFromGlob } from "../skills/index.js";
import { mergeSpotlightSkills } from "./mergeSkills.js";
import type { SpotlightSkill } from "@inupedia/spotlight-protocol";
import type { RemoteHostToolCall } from "@inupedia/spotlight-protocol";
import type { SessionHostToolHandler } from "@inupedia/spotlight-client";
import type { HandlerApi } from "../store/pipeline/types.js";
import type { ToolResult } from "../types/toolResult.js";

type CapabilityModules = Record<string, unknown>;

export type DefineSpotlightCapabilityHostOptions = {
  core?: SpotlightHostCore;
  capabilities?: {
    modules?: CapabilityModules;
    exclude?: RegExp;
    executor?: Omit<BuildAgentServiceHostOptions, "onToolComplete" | "getContext"> &
      Partial<Pick<BuildAgentServiceHostOptions, "getContext">>;
  };
  actions?: SpotlightFrontendAction[];
  readables?: SpotlightReadableContext[];
  skills?: SpotlightHostSkillsOption;
  workflows?: {
    operate?: OperateWorkflowDefinition;
    sessionControl?: SessionControlWorkflowHooks | SessionControlHooksFactory;
  };
  metadata?: {
    uiPromptsFallback?: SpotlightUiPrompts;
    catalogOverlay?: () => SpotlightCommandCatalog | null | undefined;
    videoChannels?: SpotlightCommandCatalogVideoChannel[];
    onVideoChannelsLoaded?: (
      channels: SpotlightCommandCatalogVideoChannel[],
    ) => void;
    quickPanelActions?: SpotlightQuickPanelActions | (() => SpotlightQuickPanelActions);
    getSuggestedQuestions?: SpotlightHostRegistration["getSuggestedQuestions"];
  };
  telemetry?: {
    onToolComplete?: SpotlightHostCoreOptions["onToolComplete"];
  };
};

function resolveInlineSkills(
  inline: SpotlightSkill[] | (() => SpotlightSkill[]) | undefined,
): SpotlightSkill[] {
  if (!inline) return [];
  return typeof inline === "function" ? inline() : inline;
}

function resolveSkillsPool(skills?: ReturnType<typeof normalizeSkillsOption>): SpotlightSkill[] {
  if (!skills) return [];
  const inline = resolveInlineSkills(skills.inline);
  const bundled = skills.bundled
    ? loadBundledSkillsFromGlob(skills.bundled)
    : [];
  return mergeSpotlightSkills(inline, bundled);
}

export function defineSpotlightCapabilityHost(
  options: DefineSpotlightCapabilityHostOptions,
): () => SpotlightHostRegistration {
  const core =
    options.core ??
    createSpotlightHostCore({
      actions: options.actions,
      readables: options.readables,
      onToolComplete: options.telemetry?.onToolComplete,
    });

  if (options.core) {
    for (const action of options.actions ?? []) core.registerAction(action);
    for (const readable of options.readables ?? []) core.registerReadable(readable);
  }

  if (options.capabilities?.modules) {
    loadAgentCapabilities(options.capabilities.modules, {
      exclude: options.capabilities.exclude,
    });
  }

  const capabilityHost = options.capabilities
    ? buildAgentServiceHost({
        ...options.capabilities.executor,
        getContext:
          options.capabilities.executor?.getContext ??
          (() => core.getUiContext()),
        onToolComplete: options.telemetry?.onToolComplete,
      })
    : null;

  const executeOperate = options.workflows?.operate
    ? createOperateExecutor(options.workflows.operate)
    : undefined;

  let runSessionHostTool:
    | ((
        call: RemoteHostToolCall,
        api: HandlerApi,
      ) => Promise<Awaited<ReturnType<SessionHostToolHandler>>>)
    | undefined;

  if (options.workflows?.sessionControl) {
    const sessionHooks =
      typeof options.workflows.sessionControl === "function"
        ? options.workflows.operate && executeOperate
          ? options.workflows.sessionControl(executeOperate)
          : (() => {
              throw new Error(
                "Spotlight capability host: sessionControl factory requires `operate` definition",
              );
            })()
        : options.workflows.sessionControl;
    runSessionHostTool = createRunSessionHostTool(
      createSessionControlExecutor(sessionHooks),
    );
  }

  const skillsInput = normalizeSkillsOption(options.skills);

  const resolveCapabilityTools = () =>
    capabilityHost
      ?.listTools()
      .filter((tool) => capabilityHost.getToolExecutionTarget(tool) === "host")
      .map((tool) => ({
        name: tool.name,
        displayName: tool.displayName ?? tool.title,
        description: tool.description,
        handler: async ({ input }: { input: Record<string, unknown> }) => {
          const result = await capabilityHost.runTool(tool.name, input);
          if (!result.success) {
            throw new Error(result.error ?? `Host tool failed: ${tool.name}`);
          }
          return result.data;
        },
      })) ?? [];

  return () => {
    const quickPanelActions =
      typeof options.metadata?.quickPanelActions === "function"
        ? options.metadata.quickPanelActions()
        : options.metadata?.quickPanelActions;

    return {
      tools: () => [...core.listTools(), ...resolveCapabilityTools()],
      runHostTool: async (name, input): Promise<ToolResult<unknown>> => {
        if (core.listTools().some((tool) => tool.name === name)) {
          return core.runTool(name, input) as Promise<ToolResult<unknown>>;
        }
        if (capabilityHost) {
          return capabilityHost.runTool(name, input) as Promise<ToolResult<unknown>>;
        }
        return {
          success: false,
          errorCode: "UNKNOWN_TOOL",
          error: `未知 Host tool: ${name}`,
          executionTarget: "host",
          trace: [],
        };
      },
      runSessionHostTool,
      executeOperateWorkflow: executeOperate,
      skills: skillsInput ? () => resolveSkillsPool(skillsInput) : undefined,
      getUiContext: () => core.getUiContext(),
      catalogOverlay: options.metadata?.catalogOverlay,
      videoChannels: options.metadata?.videoChannels,
      onVideoChannelsLoaded: options.metadata?.onVideoChannelsLoaded,
      uiPromptsFallback: options.metadata?.uiPromptsFallback,
      quickPanelActions,
      getSuggestedQuestions: options.metadata?.getSuggestedQuestions,
    };
  };
}
