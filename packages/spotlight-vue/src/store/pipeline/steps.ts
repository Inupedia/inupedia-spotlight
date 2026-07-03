import type {
  AgentStep,
  AgentStepAttachment,
  AgentStepChatItem,
  AgentStepFile,
  AgentStepToolCall,
  SpotlightArtifact,
} from "../types";

function findStep(steps: AgentStep[], stepId: string): AgentStep | undefined {
  return steps.find((step) => step.id === stepId);
}

export function findActiveStep(steps: AgentStep[]): AgentStep | undefined {
  return steps.find((step) => step.status === "active");
}

export function preserveSteps(
  previousSteps: AgentStep[],
  nextSteps: AgentStep[],
): AgentStep[] {
  const preserved = new Map(
    previousSteps.map((step) => [step.id, step] as const),
  );
  return nextSteps.map((step) => {
    const prev = preserved.get(step.id);
    return prev
      ? { ...step, status: prev.status, content: prev.content }
      : step;
  });
}

export function setStepState(
  steps: AgentStep[],
  stepId: string,
  status: AgentStep["status"],
  content?: string,
): boolean {
  const step = findStep(steps, stepId);
  if (!step) return false;
  step.status = status;
  if (content !== undefined) {
    step.content = content;
  }
  return true;
}

export function appendStepContent(
  steps: AgentStep[],
  stepId: string,
  chunk: string,
): boolean {
  const step = findStep(steps, stepId);
  if (!step) return false;
  step.content = (step.content ?? "") + chunk;
  return true;
}

export function appendStepChatItems(
  steps: AgentStep[],
  stepId: string,
  items: AgentStepChatItem[],
): boolean {
  const step = findStep(steps, stepId);
  if (!step || items.length === 0) return false;

  const existing = step.chatItems ?? [];
  const next = [...existing];
  let changed = false;

  for (const item of items) {
    if (item.type === "text") {
      const last = next[next.length - 1];
      if (last?.type === "text") {
        if (item.text) {
          last.text += item.text;
          changed = true;
        }
        continue;
      }
      next.push(item);
      changed = true;
      continue;
    }

    const index = next.findIndex(
      (current) =>
        current.type === "tool" && current.toolCall.id === item.toolCall.id,
    );
    if (index === -1) {
      next.push(item);
      changed = true;
      continue;
    }

    const previous = next[index];
    if (previous.type !== "tool") continue;
    const merged: AgentStepChatItem = {
      id: previous.id,
      type: "tool",
      toolCall: {
        ...previous.toolCall,
        ...item.toolCall,
        argsText: item.toolCall.argsText ?? previous.toolCall.argsText,
        resultText: item.toolCall.resultText ?? previous.toolCall.resultText,
      },
    };
    if (JSON.stringify(merged) !== JSON.stringify(previous)) {
      next[index] = merged;
      changed = true;
    }
  }

  if (!changed) return false;
  step.chatItems = next;
  return true;
}

export function appendStepAttachments(
  steps: AgentStep[],
  stepId: string,
  attachments: AgentStepAttachment[],
): boolean {
  const step = findStep(steps, stepId);
  if (!step || attachments.length === 0) return false;

  const existing = step.attachments ?? [];
  const existingIds = new Set(existing.map((item) => item.id));
  const next = attachments.filter((item) => !existingIds.has(item.id));
  if (next.length === 0) return false;

  step.attachments = [...existing, ...next];
  return true;
}

export function appendStepFiles(
  steps: AgentStep[],
  stepId: string,
  files: AgentStepFile[],
): boolean {
  const step = findStep(steps, stepId);
  if (!step || files.length === 0) return false;

  const existing = step.files ?? [];
  const existingIds = new Set(existing.map((item) => item.id));
  const next = files.filter((item) => !existingIds.has(item.id));
  if (next.length === 0) return false;

  step.files = [...existing, ...next];
  return true;
}

export function appendStepArtifacts(
  steps: AgentStep[],
  stepId: string,
  artifacts: SpotlightArtifact[],
): boolean {
  const step = findStep(steps, stepId);
  if (!step || artifacts.length === 0) return false;

  const existing = step.artifacts ?? [];
  const existingIds = new Set(existing.map((item) => item.id));
  const next = artifacts.filter((item) => !existingIds.has(item.id));
  if (next.length === 0) return false;

  step.artifacts = [...existing, ...next];
  return true;
}

export function appendStepToolCalls(
  steps: AgentStep[],
  stepId: string,
  toolCalls: AgentStepToolCall[],
): boolean {
  const step = findStep(steps, stepId);
  if (!step || toolCalls.length === 0) return false;

  const existing = step.toolCalls ?? [];
  const indexById = new Map(existing.map((item, index) => [item.id, index]));
  const next = [...existing];
  let changed = false;

  for (const toolCall of toolCalls) {
    const index = indexById.get(toolCall.id);
    if (index == null) {
      next.push(toolCall);
      changed = true;
      continue;
    }

    const previous = next[index];
    const merged = {
      ...previous,
      ...toolCall,
      argsText: toolCall.argsText ?? previous.argsText,
      resultText: toolCall.resultText ?? previous.resultText,
    };

    if (JSON.stringify(merged) !== JSON.stringify(previous)) {
      next[index] = merged;
      changed = true;
    }
  }

  if (!changed) return false;
  step.toolCalls = next;
  return true;
}
