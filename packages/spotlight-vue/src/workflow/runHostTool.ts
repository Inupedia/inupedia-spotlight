import { getSpotlightConfig } from "../plugin.js";
import type { ToolResult } from "../types/toolResult.js";

/** Run a registered host tool from workflow handlers (wired via `host.runHostTool`). */
export async function runHostTool(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult<unknown>> {
  const run = getSpotlightConfig().runHostTool;
  if (!run) {
    throw new Error(
      "Spotlight config: runHostTool is required for host-side workflows",
    );
  }
  return run(name, input);
}
