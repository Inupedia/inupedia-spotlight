export type { SpotlightClientConfig } from "./http.js";
export {
  appendProjectQuery,
  buildJsonHeaders,
  createSpotlightHttp,
  normalizeServerUrl,
  resolveSpotlightClientConfig,
  type SpotlightHttp,
} from "./http.js";
export {
  buildClientToolsManifest,
  createSpotlightHostAdapter,
  executeHostTool,
  fetchDefaultCommandCatalog,
  fetchHostToolsManifest,
  mergeCommandCatalogs,
  resetHostToolsManifestCacheForTests,
  resolveHostTools,
  serializeSkillsForRemote,
  type SessionHostToolHandler,
  type SpotlightHostAdapter,
  type SpotlightHostTool,
  type SpotlightHostToolHandlerContext,
} from "./host.js";
export {
  createSpotlightHostCore,
  type SpotlightActionContext,
  type SpotlightFrontendAction,
  type SpotlightHostCore,
  type SpotlightHostCoreEvent,
  type SpotlightHostCoreOptions,
  type SpotlightHostCoreSubscriber,
  type SpotlightReadableContext,
} from "./hostCore.js";
export {
  bridgeAgentRegistryToHostTools,
  type AgentRegistryBridgeDeps,
  type AgentRegistryTool,
} from "./registryBridge.js";
export {
  defineToolsFromAgentRegistry,
  type AgentRegistryHostTools,
} from "./defineToolsFromRegistry.js";
export {
  registerTool,
  getTool,
  listTools,
  listLoopTools,
  getToolsByPrefix,
  clearTools,
  createToolInputSchema,
  createLooseObjectSchema,
  getToolTitle,
  getToolAvailabilityCheck,
  getToolRequirements,
  getToolContextHint,
  getToolPreflight,
  getToolInvoker,
  getToolExecutionMode,
  getToolExecutionTarget,
  getToolExposeToLoop,
  getToolTimeoutMs,
  getToolRecovery,
  getToolResultSummarizer,
  getToolHostEffectBuilder,
  type AgentTool,
  type ToolContextHint,
  type ToolExecutionMode,
  type ToolInputSchema,
  type ToolPreflightContext,
  type ToolPreflightResult,
  type ToolRecoveryConfig,
} from "./agentRegistry.js";
export {
  createAgentExecutor,
  type AgentExecutorContext,
  type AgentExecutorNavigation,
  type CreateAgentExecutorOptions,
  type ToolResult,
  type ToolTraceEvent,
} from "./agentExecutor.js";
export {
  defineAgentTool,
  hostEffect,
  type AgentToolDef,
  type HostEffectConfig,
  type ToolFieldSchema,
} from "./defineAgentTool.js";
export {
  agent,
  Agent,
  loadAgentCapabilities,
  registerAgentCapability,
  registerExportedAgentCapabilities,
  getAgentCapabilityMeta,
  type AgentCapabilityMeta,
  type AgentCapabilityHandler,
  type AgentCapabilityDecorator,
} from "./agentCapability.js";
export { createContextualAction } from "./contextualAction.js";
export {
  buildAgentServiceHost,
  type BuildAgentServiceHostOptions,
} from "./defineAgentService.js";
export {
  validateSkillFrontmatter,
  describeCapabilitySurface,
  SPOTLIGHT_LAYOUT,
  SPOTLIGHT_SKILL_LOAD_LEVELS,
  spotlightSkillsGlobPattern,
  type SkillValidationResult,
  type SpotlightSkillFrontmatter,
} from "./skillServiceStandard.js";
export {
  substituteSkillPlaceholders,
  executeInlineShellInMarkdown,
  prepareSkillMarkdownContent,
} from "./skillPrompt.js";
export {
  registerSkillScriptTool,
  type RegisterSkillScriptToolOptions,
  type SkillScriptRunner,
} from "./skillScriptTool.js";
export {
  joinSkillScriptPath,
  type SkillScriptRunResult,
} from "./skillScriptPath.js";
export type { AgentDef } from "./agentDecoratorTypes.js";
export {
  createFrontendToolRegistry,
  defineFrontendTool,
  defineSpotlightProject,
  projectToolDescriptors,
  type FrontendToolDefinitionV1,
  type FrontendToolHandlerContextV1,
  type FrontendToolRegistryV1,
  type SpotlightProjectV1,
} from "./tools/frontendTool.js";
export {
  createCapabilityClient,
  type CapabilityConnectInputV1,
  type CapabilityConnectResultV1,
  type CreateCapabilityClientOptionsV1,
} from "./capabilities/handshake.js";
export {
  createCapabilityChannel,
  type CapabilityChannelV1,
} from "./capabilities/channel.js";
export {
  createHostActionExecutor,
  type CapabilityExecutionFenceV1,
} from "./capabilities/hostActionExecutor.js";
export { SpotlightCapabilityError } from "./capabilities/errors.js";
export {
  getCapabilityRuntimeV1,
  registerCapabilityRuntimeV1,
  subscribeCapabilityRuntimeV1,
  waitForCapabilityRuntimeV1,
  type RegisteredCapabilityRuntimeV1,
} from "./capabilities/runtimeCapabilities.js";
