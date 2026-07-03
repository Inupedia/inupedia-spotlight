import {
  fetchHostToolsManifest,
  type SessionHostToolHandler,
} from "@inupedia/spotlight-client";
import type {
  HostToolEffect,
  HostToolExecutionResult,
  RemoteHostToolCall,
} from "@inupedia/spotlight-protocol";
import { getSpotlightConfig, getSpotlightHostAdapter } from "../plugin.js";
import { getSpotlightHttp } from "../plugin.js";
import type { HandlerApi } from "../store/pipeline/types.js";
import type { ToolResult } from "../types/toolResult.js";

export type RemoteToolCall = RemoteHostToolCall;

export async function ensureHostToolsManifest(signal?: AbortSignal) {
  return fetchHostToolsManifest(getSpotlightHttp(), signal);
}

export async function executeRemoteHostTool(
  call: RemoteToolCall,
  api: HandlerApi,
  options: { allowedHostNames: Set<string>; hostEffect?: HostToolEffect },
): Promise<ToolResult<unknown>> {
  const adapter = getSpotlightHostAdapter();
  const config = getSpotlightConfig();
  const sessionToolHandler: SessionHostToolHandler | undefined =
    config.runSessionHostTool
      ? async (sessionCall, _ctx) =>
          config.runSessionHostTool!(sessionCall, api)
      : undefined;

  const result = await adapter.executeHostTool(call, {
    allowedHostNames: options.allowedHostNames,
    hostEffect: options.hostEffect,
    sessionToolHandler,
  });

  return {
    success: result.success,
    data: result.data,
    error: result.error,
    errorCode: result.errorCode,
    trace: result.trace,
    executionTarget: "host",
  };
}

export type { HostToolExecutionResult };
