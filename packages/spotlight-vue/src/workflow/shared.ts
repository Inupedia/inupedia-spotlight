import type { AgentStep } from "../store/spotlightStore.js";

export const COMMON_WORKFLOW_STEPS: AgentStep[] = [
  { id: "1", label: "拆解问题", status: "pending" },
  { id: "2", label: "分析意图", status: "pending" },
  { id: "3", label: "使用工具", status: "pending" },
];

export function buildCommonWorkflowSteps(): AgentStep[] {
  return [...COMMON_WORKFLOW_STEPS];
}

/** @deprecated use buildCommonWorkflowSteps */
export const buildCommonSteps = buildCommonWorkflowSteps;
