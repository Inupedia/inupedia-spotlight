import type { ToolResult } from "../../types/toolResult.js";
import { getSpotlightConfig } from "../../plugin.js";
import { postSpotlightJson } from "../../remote/serverJson.js";
import type {
  AgentStep,
  AgentStepAttachment,
  AgentStepChatItem,
  AgentStepFile,
  AgentStepToolCall,
} from "../types.js";
import {
  appendStepArtifacts,
  appendStepAttachments,
  appendStepChatItems,
  appendStepContent,
  appendStepFiles,
  appendStepToolCalls,
} from "./steps.js";
import type { HandlerApi, StreamToolSummaryParams } from "./types.js";
import type { SpotlightExecutionEvent } from "../runtime/types.js";

type CreateHandlerApiOptions = {
  getSignal: () => AbortSignal | undefined;
  getSteps: () => AgentStep[];
  setSteps: (steps: AgentStep[]) => void;
  setStep: (id: string, status: AgentStep["status"], content?: string) => void;
  typewriterToStep: (
    stepId: string,
    fullText: string,
    msPerChar?: number,
  ) => Promise<void>;
  typewriterAppendToStep: (
    stepId: string,
    suffix: string,
    msPerChar?: number,
  ) => Promise<void>;
  triggerProgressAction: () => Promise<ToolResult<void>>;
  triggerSimulationProgressAction: () => Promise<ToolResult<void>>;
  setError: (msg: string) => void;
  setResult: (json: string) => void;
  appendAttachmentsToStep: (
    stepId: string,
    attachments: AgentStepAttachment[],
  ) => void;
  appendChatItemsToStep: (stepId: string, items: AgentStepChatItem[]) => void;
  appendFilesToStep: (stepId: string, files: AgentStepFile[]) => void;
  appendToolCallsToStep: (
    stepId: string,
    toolCalls: AgentStepToolCall[],
  ) => void;
  appendExecutionEvent?: (event: SpotlightExecutionEvent) => void;
};

type SpotlightHandlerApiBindings = Pick<
  HandlerApi,
  | "getSteps"
  | "getSignal"
  | "setSteps"
  | "setStep"
  | "typewriterToStep"
  | "typewriterAppendToStep"
  | "setError"
  | "setResult"
  | "appendAttachmentsToStep"
  | "appendChatItemsToStep"
  | "appendFilesToStep"
  | "appendToolCallsToStep"
  | "appendExecutionEvent"
>;

function noopQuickAction(): Promise<ToolResult<void>> {
  return Promise.resolve({ success: true, trace: [] });
}

function resolveQuickPanelActions() {
  const actions = getSpotlightConfig().quickPanelActions;
  return {
    triggerProgressAction:
      actions?.triggerProgressAction ?? noopQuickAction,
    triggerSimulationProgressAction:
      actions?.triggerSimulationProgressAction ?? noopQuickAction,
  };
}

function paintYield(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function localFallbackSummary(params: StreamToolSummaryParams): string {
  return params.kind === "tool"
    ? `将执行「${params.subLabel}」（${params.intentLabel}）。`
    : `将根据「${params.intentLabel}」直接作答。`;
}

async function streamToolSummary(
  params: StreamToolSummaryParams,
  getSignal: () => AbortSignal | undefined,
  getSteps: () => AgentStep[],
): Promise<string> {
  const { stepId } = params;
  let text: string;

  try {
    const data = await postSpotlightJson<{ text?: unknown }>(
      "/v1/tool-summary",
      {
        intentLabel: params.intentLabel,
        subLabel: params.subLabel,
        kind: params.kind,
      },
      getSignal(),
    );
    text =
      typeof data.text === "string" && data.text.trim()
        ? data.text.trim()
        : localFallbackSummary(params);
  } catch {
    text = localFallbackSummary(params);
  }

  for (let i = 0; i < text.length; i += 12) {
    appendStepContent(getSteps(), stepId, text.slice(i, i + 12));
    await paintYield();
  }
  return text;
}

function createSpotlightHandlerApi(
  options: CreateHandlerApiOptions,
): HandlerApi {
  return {
    getSignal: options.getSignal,
    getSteps: options.getSteps,
    setSteps: options.setSteps,
    setStep: options.setStep,
    typewriterToStep: options.typewriterToStep,
    typewriterAppendToStep: options.typewriterAppendToStep,
    triggerProgressAction: options.triggerProgressAction,
    triggerSimulationProgressAction: options.triggerSimulationProgressAction,
    setError: options.setError,
    setResult: options.setResult,
    appendChunkToStep: (stepId, chunk) => {
      appendStepContent(options.getSteps(), stepId, chunk);
    },
    appendAttachmentsToStep: (stepId, attachments) => {
      appendStepAttachments(options.getSteps(), stepId, attachments);
    },
    appendChatItemsToStep: (stepId, items) => {
      appendStepChatItems(options.getSteps(), stepId, items);
    },
    appendFilesToStep: (stepId, files) => {
      appendStepFiles(options.getSteps(), stepId, files);
    },
    appendArtifactsToStep: (stepId, artifacts) => {
      appendStepArtifacts(options.getSteps(), stepId, artifacts);
    },
    appendToolCallsToStep: (stepId, toolCalls) => {
      appendStepToolCalls(options.getSteps(), stepId, toolCalls);
    },
    appendExecutionEvent: options.appendExecutionEvent,
    streamToolSummary: (params) =>
      streamToolSummary(params, options.getSignal, options.getSteps),
  };
}

export function buildSpotlightHandlerApi(
  bindings: SpotlightHandlerApiBindings,
): HandlerApi {
  return createSpotlightHandlerApi({
    ...bindings,
    ...resolveQuickPanelActions(),
  });
}
