import type { AgentStep } from "../types";

function getStepById(
  steps: AgentStep[],
  stepId: string,
): AgentStep | undefined {
  return steps.find((step) => step.id === stepId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function typewriterToStepContent(
  steps: AgentStep[],
  stepId: string,
  fullText: string,
  msPerChar = 24,
  shouldContinue?: () => boolean,
): Promise<void> {
  if (shouldContinue && !shouldContinue()) return;
  const step = getStepById(steps, stepId);
  if (!step) return;
  step.content = "";
  for (let i = 0; i <= fullText.length; i++) {
    if (shouldContinue && !shouldContinue()) return;
    step.content = fullText.slice(0, i);
    if (i < fullText.length) {
      await sleep(msPerChar);
    }
  }
}

export async function typewriterAppendToStepContent(
  steps: AgentStep[],
  stepId: string,
  suffix: string,
  msPerChar = 24,
  shouldContinue?: () => boolean,
): Promise<void> {
  if (shouldContinue && !shouldContinue()) return;
  const step = getStepById(steps, stepId);
  if (!step) return;
  const base = step.content ?? "";
  for (let i = 0; i <= suffix.length; i++) {
    if (shouldContinue && !shouldContinue()) return;
    step.content = base + suffix.slice(0, i);
    if (i < suffix.length) {
      await sleep(msPerChar);
    }
  }
}
