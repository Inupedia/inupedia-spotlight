import type {
  AgentUiContext,
  SpotlightCommandCatalog,
  SpotlightCommandCatalogVideoChannel,
  SpotlightSkill,
} from "@inupedia/spotlight-protocol";
import type {
  SessionHostToolHandler,
  SpotlightClientConfig,
  SpotlightHostTool,
} from "@inupedia/spotlight-client";
import type { RemoteHostToolCall } from "@inupedia/spotlight-protocol";
import type { HandlerApi } from "./store/pipeline/types.js";
import type { SpotlightUiPrompts } from "./remote/meta.js";
import type { ToolResult } from "./types/toolResult.js";
import type { SpotlightConfigInput } from "./resolveConfig.js";
import { resolveSpotlightConfig } from "./resolveConfig.js";

export type { SpotlightConfigInput } from "./resolveConfig.js";

export type SpotlightHostServicesRegistration = Partial<
  Pick<
    SpotlightConfig,
    | "tools"
    | "getUiContext"
    | "catalogOverlay"
    | "videoChannels"
    | "onVideoChannelsLoaded"
    | "uiPromptsFallback"
    | "runSessionHostTool"
    | "runHostTool"
    | "quickPanelActions"
    | "getSuggestedQuestions"
  >
>;

export type SpotlightConfig = SpotlightClientConfig & {
  /** Host-side tools the server may invoke via SSE bridge. */
  tools: SpotlightHostTool[] | (() => SpotlightHostTool[]);
  /** Skills sent on each create-run (metadata only; bodies loaded server-side). */
  skills?: SpotlightSkill[] | (() => SpotlightSkill[]);
  /** Preferred: host resolves bundled + inline skills per run. */
  getSkillsForRun?: () => SpotlightSkill[];
  /** Optional dynamic catalog overlay (e.g. live video channels). */
  catalogOverlay?: () => SpotlightCommandCatalog | null | undefined;
  /** Optional static video channel metadata for catalog merge / meta fallback. */
  videoChannels?: SpotlightCommandCatalogVideoChannel[];
  /** Called when video channel meta is loaded from server or fallback. */
  onVideoChannelsLoaded?: (
    channels: SpotlightCommandCatalogVideoChannel[],
  ) => void;
  /** Bundled ui-prompts when server meta is unavailable. */
  uiPromptsFallback?: SpotlightUiPrompts;
  /** Per-run UI context reported to server. */
  getUiContext?: () => AgentUiContext;
  /** Host handler for session.* tools (e.g. repeatLastAnswer). */
  runSessionHostTool?: (
    call: RemoteHostToolCall,
    api: HandlerApi,
  ) => Promise<Awaited<ReturnType<SessionHostToolHandler>>>;
  /** Host-side tool runner for domain workflows (e.g. operate). */
  runHostTool?: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<ToolResult<unknown>>;
  /** Optional legacy quick actions wired into handler API. */
  quickPanelActions?: SpotlightQuickPanelActions;
  /** Override suggested question chips (defaults use server ui-prompts). */
  getSuggestedQuestions?: (params: {
    sceneLevel: number | null | undefined;
    smallTab?: string | null;
    activeTarget?: string | null;
  }) => string[];
  /** Host operate domain executor (usually from defineSpotlightHost). */
  executeOperateWorkflow?: (
    ctx: import("./store/pipeline/types.js").SpotlightContext,
    api: HandlerApi,
  ) => Promise<void>;
};

export type SpotlightQuickPanelActions = {
  triggerProgressAction?: () => Promise<ToolResult<void>>;
  triggerSimulationProgressAction?: () => Promise<ToolResult<void>>;
};

/** Validate and normalize host config (supports `services` / `skills` registration). */
export function defineSpotlightConfig(
  input: SpotlightConfigInput | SpotlightConfig,
): SpotlightConfig {
  const config =
    "host" in input ||
    "services" in input ||
    "skills" in input
      ? resolveSpotlightConfig(input as SpotlightConfigInput)
      : (input as SpotlightConfig);
  if (!config.projectId?.trim()) {
    throw new Error("Spotlight config: projectId is required");
  }
  if (!config.serverUrl?.trim()) {
    throw new Error("Spotlight config: serverUrl is required");
  }
  if (!config.tools) {
    throw new Error("Spotlight config: tools are required (via services or tools)");
  }
  if (typeof config.tools !== "function") {
    const tools = config.tools;
    if (!Array.isArray(tools) || tools.length === 0) {
      throw new Error("Spotlight config: at least one host tool is required");
    }
  }
  return config;
}

export const SPOTLIGHT_CONFIG_KEY = Symbol("spotlight-config");

import type { SpotlightAvatarConfig } from "./avatar/config.js";

export type SpotlightVuePluginOptions = {
  config: SpotlightConfigInput | SpotlightConfig;
  /** Mount command panel + thinking UI (default: true). */
  enabled?: boolean;
  /** Enable digital-human overlay, ⌘/Ctrl+L, and answer TTS (default: false). */
  avatarEnabled?: boolean;
  /** Avatar copy + Spine asset paths (when avatarEnabled). */
  avatar?: SpotlightAvatarConfig;
};
