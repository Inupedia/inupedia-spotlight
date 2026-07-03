import type { ToolExecutionTarget } from "@inupedia/spotlight-protocol";
import type { SpotlightHostTool } from "./host.js";

export type AgentRegistryTool = {
  name: string;
  displayName?: string;
  title?: string;
  description?: string;
};

export type AgentRegistryBridgeDeps = {
  listTools: () => Array<{
    name: string;
    displayName?: string;
    title?: string;
    description?: string;
  }>;
  getToolExecutionTarget: (tool: { name: string }) => ToolExecutionTarget;
  runTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
};

/** Map a host-side agent tool registry to Spotlight host tools for SSE bridge. */
export function bridgeAgentRegistryToHostTools(
  deps: AgentRegistryBridgeDeps,
): SpotlightHostTool[] {
  return deps
    .listTools()
    .filter((tool) => deps.getToolExecutionTarget(tool) === "host")
    .map((tool) => ({
      name: tool.name,
      displayName: tool.displayName ?? tool.title,
      description: tool.description,
      handler: async ({ input }) => {
        const result = await deps.runTool(tool.name, input);
        if (!result.success) {
          throw new Error(result.error ?? `Host tool failed: ${tool.name}`);
        }
        return result.data;
      },
    }));
}
