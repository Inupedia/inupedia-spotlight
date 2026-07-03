import {
  appendStepAttachments,
  appendStepChatItems,
  appendStepFiles,
  appendStepToolCalls,
} from "./pipeline/steps";
import { buildSpotlightHandlerApi } from "./pipeline/api";
import type { HandlerApi } from "./pipeline/types";
import type { SpotlightExecutionEvent } from "./runtime/types";
import type { AgentStep } from "./types";

function createStepLabelLookup(steps: AgentStep[]): Map<string, string> {
  return new Map(steps.map((step) => [step.id, step.label] as const));
}

export function buildSpotlightStoreSink(params: {
  signal: AbortSignal;
  isCurrentRun: () => boolean;
  getSteps: () => AgentStep[];
  replaceSteps: (steps: AgentStep[]) => void;
  setStep: (id: string, status: AgentStep["status"], content?: string) => void;
  typewriterToStep: HandlerApi["typewriterToStep"];
  typewriterAppendToStep: HandlerApi["typewriterAppendToStep"];
  setError: (msg: string) => void;
  setResult: (json: string) => void;
  recordExecutionEvent: (event: SpotlightExecutionEvent) => void;
}): HandlerApi {
  return buildSpotlightHandlerApi({
    getSignal: () => {
      return params.isCurrentRun() ? params.signal : undefined;
    },
    getSteps: params.getSteps,
    setSteps: (steps) => {
      if (!params.isCurrentRun()) return;
      const previousLabels = createStepLabelLookup(params.getSteps());
      params.replaceSteps(steps);
      params.recordExecutionEvent({
        type: "step_sync",
        at: Date.now(),
        steps: steps.map((step) => ({
          id: step.id,
          label: step.label || previousLabels.get(step.id) || step.id,
          status: step.status,
        })),
      });
    },
    setStep: (id, status, content) => {
      if (!params.isCurrentRun()) return;
      params.setStep(id, status, content);
      const step = params.getSteps().find((item) => item.id === id);
      params.recordExecutionEvent({
        type: "step_status",
        at: Date.now(),
        stepId: id,
        label: step?.label ?? null,
        status,
        content: content ?? step?.content,
        channel: "body",
      });
    },
    typewriterToStep: (stepId, fullText, msPerChar) => {
      return params.typewriterToStep(stepId, fullText, msPerChar).then(() => {
        const step = params.getSteps().find((item) => item.id === stepId);
        params.recordExecutionEvent({
          type: "step_content",
          at: Date.now(),
          stepId,
          label: step?.label ?? null,
          mode: "replace",
          content: fullText,
          channel: "body",
        });
      });
    },
    typewriterAppendToStep: (stepId, suffix, msPerChar) => {
      return params
        .typewriterAppendToStep(stepId, suffix, msPerChar)
        .then(() => {
          const step = params.getSteps().find((item) => item.id === stepId);
          params.recordExecutionEvent({
            type: "step_content",
            at: Date.now(),
            stepId,
            label: step?.label ?? null,
            mode: "append",
            content: suffix,
            channel: "body",
          });
        });
    },
    setError: (msg) => {
      if (!params.isCurrentRun()) return;
      params.setError(msg);
    },
    setResult: (json) => {
      if (!params.isCurrentRun()) return;
      params.setResult(json);
    },
    appendAttachmentsToStep: (stepId, attachments) => {
      if (!params.isCurrentRun()) return;
      appendStepAttachments(params.getSteps(), stepId, attachments);
      const step = params.getSteps().find((item) => item.id === stepId);
      params.recordExecutionEvent({
        type: "step_artifact",
        at: Date.now(),
        stepId,
        label: step?.label ?? null,
        artifact: "attachments",
        count: attachments.length,
      });
    },
    appendChatItemsToStep: (stepId, items) => {
      if (!params.isCurrentRun()) return;
      appendStepChatItems(params.getSteps(), stepId, items);
      const step = params.getSteps().find((item) => item.id === stepId);
      params.recordExecutionEvent({
        type: "step_artifact",
        at: Date.now(),
        stepId,
        label: step?.label ?? null,
        artifact: "chat_items",
        count: items.length,
      });
    },
    appendFilesToStep: (stepId, files) => {
      if (!params.isCurrentRun()) return;
      appendStepFiles(params.getSteps(), stepId, files);
      const step = params.getSteps().find((item) => item.id === stepId);
      params.recordExecutionEvent({
        type: "step_artifact",
        at: Date.now(),
        stepId,
        label: step?.label ?? null,
        artifact: "files",
        count: files.length,
      });
    },
    appendToolCallsToStep: (stepId, toolCalls) => {
      if (!params.isCurrentRun()) return;
      appendStepToolCalls(params.getSteps(), stepId, toolCalls);
      const step = params.getSteps().find((item) => item.id === stepId);
      params.recordExecutionEvent({
        type: "step_artifact",
        at: Date.now(),
        stepId,
        label: step?.label ?? null,
        artifact: "tool_calls",
        count: toolCalls.length,
      });
    },
    appendExecutionEvent: (event) => {
      if (!params.isCurrentRun()) return;
      params.recordExecutionEvent(event);
    },
  });
}
