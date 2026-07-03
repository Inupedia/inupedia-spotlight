import {
  createAgentExecutor,
  type CreateAgentExecutorOptions,
} from "./agentExecutor.js";
import {
  getToolExecutionTarget,
  listTools,
} from "./agentRegistry.js";

export type BuildAgentServiceHostOptions = CreateAgentExecutorOptions;

/**
 * Wire registry + executor for Spotlight host (`listTools`, `getToolExecutionTarget`, `runTool`).
 * Tools register via side-effect import before first invocation.
 */
export function buildAgentServiceHost(options: BuildAgentServiceHostOptions) {
  const runTool = createAgentExecutor(options);
  return {
    listTools,
    getToolExecutionTarget,
    runTool,
  };
}
