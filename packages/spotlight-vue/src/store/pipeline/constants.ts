import type { AgentStep } from "../types";

export const SPOTLIGHT_PIPELINE_STEP_IDS = {
  breakdown: "1",
  intent: "2",
  tool: "3",
  analysis: "4",
} as const;

export const SPOTLIGHT_PIPELINE_STEP_LABELS = {
  breakdown: "拆解问题",
  intent: "分析意图",
  tool: "使用工具",
  analysis: "数据分析",
  qa: "知识问答",
} as const;

export function createBreakdownActiveStep(): AgentStep {
  return {
    id: SPOTLIGHT_PIPELINE_STEP_IDS.breakdown,
    label: SPOTLIGHT_PIPELINE_STEP_LABELS.breakdown,
    status: "active",
  };
}

export function createIntentActiveStep(): AgentStep {
  return {
    id: SPOTLIGHT_PIPELINE_STEP_IDS.intent,
    label: SPOTLIGHT_PIPELINE_STEP_LABELS.intent,
    status: "active",
  };
}

export function createQaActiveStep(): AgentStep {
  return {
    id: SPOTLIGHT_PIPELINE_STEP_IDS.tool,
    label: SPOTLIGHT_PIPELINE_STEP_LABELS.qa,
    status: "active",
  };
}
