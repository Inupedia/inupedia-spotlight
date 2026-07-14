/** Shared Spotlight protocol types (client ↔ spotlight-server). */

export * from "./capabilities.js";

export type ToolExecutionTarget = "runtime" | "host";

export interface HostToolEffect {
  type: string;
  target?: string;
  payload?: Record<string, unknown>;
}

export type AgentToolErrorCode =
  | "UNKNOWN_TOOL"
  | "HOST_TOOL_NOT_MANIFEST"
  | "CIRCULAR_DEPENDENCY"
  | "PREREQUISITE_FAILED"
  | "PRECONDITION_FAILED"
  | "TOOL_RUN_FAILED"
  | "TOOL_TIMEOUT";

export interface ToolTraceEvent {
  phase: "dependency" | "context" | "execution";
  source: "executor" | "spotlight_action" | "spotlight_server";
  type: string;
  tool: string;
  detail?: string;
  at: number;
  elapsedMs: number;
}

export type AgentStepStatus = "pending" | "active" | "done" | "error";

export interface AgentStepToolCall {
  id: string;
  name: string;
  displayName?: string;
  argsText?: string;
  resultText?: string;
  summary?: string;
  errorCode?: string;
  trace?: ToolTraceEvent[];
  status: "pending" | "running" | "done" | "error";
}

export interface AgentStep {
  id: string;
  label: string;
  status: AgentStepStatus;
  content?: string;
  toolCalls?: AgentStepToolCall[];
}

export type SpotlightStepContentChannel =
  | "body"
  | "planning"
  | "answer"
  | "tool"
  | "trace";

/** Host-reported UI context; keep generic for SaaS consumers. */
export type AgentUiContext = Record<string, unknown>;

export type ConversationTurn = {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  purpose?: string;
};

export interface PendingTask {
  id: string;
  type: string;
  pauseReason?: string | null;
  pausedAt?: number | null;
}

export interface SpotlightSessionInvokedSkill {
  skillName: string;
  invokedAt: number;
  args?: string;
}

export interface SpotlightSessionState {
  sessionId?: string;
  activeTaskId?: string | null;
  activeTopic?: string | null;
  pendingTask?: PendingTask | null;
  conversationSummary?: string;
  summarizedTurnCount?: number;
  conversationHistory?: ConversationTurn[];
  lastAssistantReply?: string | null;
  invokedSkills?: SpotlightSessionInvokedSkill[];
  skillPermissionGrants?: string[];
  /** 是否启用 Gate + 文件记忆；默认 true。 */
  memoryEnabled?: boolean;
  /** 多租户命名空间（可选）。 */
  tenantId?: string;
}

export interface SpotlightRuntimeState {
  activeDomain?: string | null;
  activeTarget?: string | null;
  activeAction?: string | null;
  resumableAction?: string | null;
  lastResolvedTarget?: string | null;
  [key: string]: unknown;
}

export interface ClientToolDescriptor {
  name: string;
  displayName?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  executionTarget?: ToolExecutionTarget;
}

export type AssetType =
  | "video_channel"
  | "bim_model"
  | "device"
  | "sensor"
  | "panel"
  | "scene_target";

export type SpotlightSkillResponseStrategy =
  | "direct_answer"
  | "tool_answer"
  | "clarify";

export interface SpotlightSkill {
  name: string;
  displayName?: string;
  description: string;
  whenToUse?: string;
  allowedTools?: string[];
  argumentHint?: string;
  argNames?: string[];
  keywords?: string[];
  responseStrategy?: SpotlightSkillResponseStrategy;
  assetTypes?: AssetType[];
  capabilityExamples?: string[];
  version?: string;
  model?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  paths?: string[];
  executionContext?: "inline" | "fork";
  agent?: string;
  effort?: string;
  hooks?: Record<string, unknown>;
  shell?: string;
  skillPackAppendix?: string;
  skillInstructionBody?: string;
  loadedFrom?: string;
  sourcePath?: string;
  /** Skill 目录（相对项目根或绝对路径），用于 scripts/ 与占位符 */
  skillRoot?: string;
}

export interface SpotlightCommandCatalogAction {
  domain: string;
  action: string;
  description: string;
}

export interface SpotlightCommandCatalogTarget {
  id: string;
  label: string;
  aliases?: string[];
}

export interface SpotlightCommandCatalogVideoChannel {
  id: string;
  label?: string;
  aliases?: string[];
}

export interface SpotlightCommandActionBinding {
  action: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

export interface SpotlightCommandCatalog {
  actions: SpotlightCommandCatalogAction[];
  targets: SpotlightCommandCatalogTarget[];
  videoChannels?: SpotlightCommandCatalogVideoChannel[];
  domainLabels?: Record<string, string>;
  actionBindings: SpotlightCommandActionBinding[];
  scopes: string[];
  useBundledGuards?: boolean;
}

export interface CreateRunRequest {
  projectId?: string;
  sessionId?: string;
  userQuestion: string;
  uiContext?: AgentUiContext;
  sessionState?: SpotlightSessionState;
  runtimeState?: SpotlightRuntimeState;
  clientTools?: ClientToolDescriptor[];
  clientToolsManifestVersion?: string;
  skills?: SpotlightSkill[];
  commandCatalog?: SpotlightCommandCatalog;
}

export interface CreateRunResponse {
  runId: string;
}

export interface HostToolResultRequest {
  correlationId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  errorCode?: string;
  trace?: ToolTraceEvent[];
}

export interface SpotlightHostToolsManifest {
  version: string;
  tools: Array<{
    name: string;
    displayName?: string;
    description?: string;
    executionTarget?: ToolExecutionTarget;
  }>;
}

export interface RemoteHostToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  displayName: string;
}

export interface HostToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: AgentToolErrorCode;
  trace: ToolTraceEvent[];
  executionTarget: "host";
}

export const SPOTLIGHT_CORE_TOOL_NAMES = {
  skillInvoke: "skill.invoke",
  knowledgeAnswer: "knowledge.answer",
  knowledgeSearchWeb: "knowledge.searchWeb",
} as const;

export {
  SPOTLIGHT_MEMORY_DEFAULT_TTL_SEC,
  type SpotlightMemoryEntry,
  type SpotlightMemoryEntryKind,
  type SpotlightMemoryGateResult,
  type SpotlightMemoryHit,
  type SpotlightMemoryHitSource,
  type SpotlightMemoryInvalidationContext,
  type SpotlightMemoryLookupInput,
  type SpotlightMemoryMiss,
  type SpotlightMemoryPlan,
  type SpotlightMemoryReplayMeta,
  type SpotlightMemoryScope,
  type SpotlightMemoryWriteInput,
  type SpotlightMemoryWriteResult,
} from "./memory.js";

export {
  SPOTLIGHT_LAYOUT,
  SPOTLIGHT_SKILL_FRONTMATTER_KEYS,
  SPOTLIGHT_SKILL_LOAD_LEVELS,
  SPOTLIGHT_SKILLS_SERVICE_SPLIT,
  spotlightSkillsGlobPattern,
  type CapabilitySurface,
  type SpotlightServiceContract,
  type SpotlightSkillFrontmatter,
} from "./standards.js";
export {
  AGENT_SKILLS_LAYOUT,
  INUPEDIA_SHARED_SKILL_FRONTMATTER,
  INUPEDIA_SKILL_EXTENSIONS,
  INUPEDIA_SKILL_LAYOUT,
  INUPEDIA_SKILL_LOAD_MODEL,
  INUPEDIA_SKILL_PLACEHOLDERS,
  INUPEDIA_SKILLS_REFERENCE_MAP,
  INUPEDIA_SKILLS_SERVICE_MODEL,
} from "./inupediaSkillsReference.js";
