import { createClientToolManifest } from "@inupedia/spotlight-client";
import type {
  HostToolEffect,
  HostToolExecutionResult,
  RemoteHostToolCall,
} from "@inupedia/spotlight-protocol";
import { getSpotlightClientTools, getSpotlightConfig } from "../plugin.js";
import type { HandlerApi } from "../store/pipeline/types.js";
import type { ToolResult } from "../types/toolResult.js";

export type RemoteToolCall = RemoteHostToolCall;

export async function ensureHostToolsManifest(signal?: AbortSignal) {
  void signal;
  const config = getSpotlightConfig();
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const frontendBuildId =
    config.frontendBuildId?.trim() || env?.VITE_BUILD_SHA?.trim() || "development";
  const manifest = await createClientToolManifest({
    projectId: config.projectId,
    frontendBuildId,
    tools: typeof config.tools === "function" ? config.tools() : config.tools,
  });
  return manifest;
}

export async function executeRemoteHostTool(
  call: RemoteToolCall,
  api: HandlerApi,
  options: { allowedHostNames: Set<string>; hostEffect?: HostToolEffect },
): Promise<ToolResult<unknown>> {
  const registry = getSpotlightClientTools();

  if (!options.allowedHostNames.has(call.name) || !registry.has(call.name)) {
    return {
      success: false,
      error: `Client tool is not registered: ${call.name}`,
      errorCode: "UNKNOWN_TOOL",
      trace: [],
      executionTarget: "host",
    };
  }
  try {
    const data = await registry.execute(call.name, call.input);
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

export type { HostToolExecutionResult };
