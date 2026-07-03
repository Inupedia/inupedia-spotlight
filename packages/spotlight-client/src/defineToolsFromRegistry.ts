import { bridgeAgentRegistryToHostTools } from "./registryBridge.js";
import type { AgentRegistryBridgeDeps } from "./registryBridge.js";
import type { SpotlightHostTool } from "./host.js";

export type AgentRegistryHostTools = {
  tools: () => SpotlightHostTool[];
  runHostTool: AgentRegistryBridgeDeps["runTool"];
};

/**
 * Map an agent tool registry to Spotlight host tools + a shared `runHostTool` runner.
 *
 * @example
 * ```ts
 * const { tools, runHostTool } = defineToolsFromAgentRegistry({
 *   listTools,
 *   getToolExecutionTarget,
 *   runTool,
 * });
 * ```
 */
export function defineToolsFromAgentRegistry(
  registry: AgentRegistryBridgeDeps,
): AgentRegistryHostTools {
  return {
    tools: () => bridgeAgentRegistryToHostTools(registry),
    runHostTool: registry.runTool,
  };
}
