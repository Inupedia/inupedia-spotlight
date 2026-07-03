import { defineToolsFromAgentRegistry } from "@inupedia/spotlight-client";
import type { AgentRegistryBridgeDeps } from "@inupedia/spotlight-client";
import type {
  AgentUiContext,
  SpotlightCommandCatalog,
  SpotlightCommandCatalogVideoChannel,
  SpotlightSkill,
} from "@inupedia/spotlight-protocol";
import type { RemoteHostToolCall } from "@inupedia/spotlight-protocol";
import type { SessionHostToolHandler } from "@inupedia/spotlight-client";
import type { SpotlightHostRegistration } from "../resolveConfig.js";
import type { SpotlightQuickPanelActions } from "../config.js";
import type { SpotlightUiPrompts } from "../remote/meta.js";
import type { HandlerApi } from "../store/pipeline/types.js";
import type { ToolResult } from "../types/toolResult.js";
import {
  wireSkillExecution,
  type SpotlightSkillExecutionOptions,
} from "./skillExecution.js";
import { loadBundledSkillsFromGlob } from "../skills/index.js";
import {
  createOperateExecutor,
  type OperateWorkflowDefinition,
} from "../workflow/operate.js";
import {
  createRunSessionHostTool,
  createSessionControlExecutor,
  type SessionControlHooksFactory,
  type SessionControlWorkflowHooks,
} from "../workflow/sessionControl.js";
import { mergeSpotlightSkills } from "./mergeSkills.js";
import {
  normalizeSkillsOption,
  type SpotlightHostSkillsOption,
} from "./normalizeSkills.js";

export type SpotlightHostSkillsInput = {
  /**
   * Vite glob map of SKILL.md raw markdown under `.inupedia/skills/`.
   * Use import.meta.glob with eager + ?raw at module top level.
   */
  bundled?: Record<string, string>;
  /** Inline skills from `registerSpotlightSkill` or a custom list. */
  inline?: SpotlightSkill[] | (() => SpotlightSkill[]);
};

export type DefineSpotlightHostOptions = AgentRegistryBridgeDeps & {
  /** Vite glob map, or `{ bundled, inline }`. Pass glob Record directly as shorthand. */
  skills?: SpotlightHostSkillsOption;
  /** Host extensions for session continue/stop. Pass factory to receive operate executor. */
  sessionControl?:
    | SessionControlWorkflowHooks
    | SessionControlHooksFactory;
  /** Domain operate workflow definition (tunnel patrol, panels, etc.). */
  operate?: OperateWorkflowDefinition;
  getUiContext?: () => AgentUiContext;
  catalogOverlay?: () => SpotlightCommandCatalog | null | undefined;
  videoChannels?: SpotlightCommandCatalogVideoChannel[];
  onVideoChannelsLoaded?: (
    channels: SpotlightCommandCatalogVideoChannel[],
  ) => void;
  uiPromptsFallback?: SpotlightUiPrompts;
  quickPanelActions?: SpotlightQuickPanelActions;
  getSuggestedQuestions?: SpotlightHostRegistration["getSuggestedQuestions"];
  /** 宿主 skill 脚本执行（注册 skill.runScript；浏览器需自建 runScript） */
  skillExecution?: SpotlightSkillExecutionOptions;
};

export type SpotlightHostFactory = () => SpotlightHostRegistration;

function resolveInlineSkills(
  inline: SpotlightHostSkillsInput["inline"],
): SpotlightSkill[] {
  if (!inline) return [];
  return typeof inline === "function" ? inline() : inline;
}

function resolveSkillsPool(skills?: SpotlightHostSkillsInput): SpotlightSkill[] {
  if (!skills) return [];
  const inline = resolveInlineSkills(skills.inline);
  const bundled = skills.bundled
    ? loadBundledSkillsFromGlob(skills.bundled)
    : [];
  return mergeSpotlightSkills(inline, bundled);
}

/**
 * One-call host registration: agent registry → tools bridge, skills merge, optional workflows.
 *
 * @example
 * ```ts
 * import '@/service/agent/tools';
 *
 * export default defineSpotlightHost({
 *   listTools,
 *   getToolExecutionTarget,
 *   runTool,
 *   skills: { bundled: skillModules, inline: listSpotlightSkills },
 *   sessionControl: mySessionHooks,
 *   getUiContext: () => getAgentUiContext(),
 * });
 * ```
 */
export function defineSpotlightHost(
  options: DefineSpotlightHostOptions,
): SpotlightHostFactory {
  const { tools, runHostTool } = defineToolsFromAgentRegistry({
    listTools: options.listTools,
    getToolExecutionTarget: options.getToolExecutionTarget,
    runTool: options.runTool,
  });

  const executeOperate = options.operate
    ? createOperateExecutor(options.operate)
    : undefined;

  let runSessionHostTool:
    | ((
        call: RemoteHostToolCall,
        api: HandlerApi,
      ) => Promise<Awaited<ReturnType<SessionHostToolHandler>>>)
    | undefined;

  if (options.sessionControl) {
    const sessionHooks =
      typeof options.sessionControl === "function"
        ? options.operate && executeOperate
          ? options.sessionControl(executeOperate)
          : (() => {
              throw new Error(
                "Spotlight host: sessionControl factory requires `operate` definition",
              );
            })()
        : options.sessionControl;
    runSessionHostTool = createRunSessionHostTool(
      createSessionControlExecutor(sessionHooks),
    );
  }

  const skillsInput = normalizeSkillsOption(options.skills);

  if (options.skillExecution && skillsInput) {
    wireSkillExecution(options.skillExecution, () =>
      resolveSkillsPool(skillsInput),
    );
  }

  return () => ({
    tools,
    runHostTool: runHostTool as (
      name: string,
      input: Record<string, unknown>,
    ) => Promise<ToolResult<unknown>>,
    runSessionHostTool,
    executeOperateWorkflow: executeOperate,
    skills: skillsInput ? () => resolveSkillsPool(skillsInput) : undefined,
    getUiContext: options.getUiContext,
    catalogOverlay: options.catalogOverlay,
    videoChannels: options.videoChannels,
    onVideoChannelsLoaded: options.onVideoChannelsLoaded,
    uiPromptsFallback: options.uiPromptsFallback,
    quickPanelActions: options.quickPanelActions,
    getSuggestedQuestions: options.getSuggestedQuestions,
  });
}
