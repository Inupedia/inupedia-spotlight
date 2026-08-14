import type { ToolSideEffectV1 } from "@inupedia/spotlight-protocol";
import { SPOTLIGHT_PIPELINE_STEP_IDS } from "./constants.js";
import { isInternalKnowledgeSubtool, normalizeToolName } from "./toolDisplay.js";

/** Server knowledge tools are always retrieval, never page mutations. */
const GATHER_TOOL_NAMES = new Set([
  "web_search",
  "project_knowledge_search",
  "knowledge.searchweb",
  "knowledge.answer",
  "knowledge.synthesizeanswer",
]);

/**
 * ChatGPT / Claude / Cursor: retrieve first, then act.
 * `sideEffect === "none"` (getVideoInfo, lists) → 获取信息.
 * `ui` / `external` (playVideoFullscreen, open/close) → 操作页面.
 */
export function resolveToolLane(
  name: string,
  sideEffect?: ToolSideEffectV1,
): "gather" | "act" {
  const normalized = normalizeToolName(name);
  if (GATHER_TOOL_NAMES.has(normalized) || isInternalKnowledgeSubtool(name)) {
    return "gather";
  }
  if (sideEffect === "none") return "gather";
  if (sideEffect === "ui" || sideEffect === "external") return "act";
  if (
    /^(get|list|search|query|count|read|inspect|lookup|find)/iu.test(normalized)
  ) {
    return "gather";
  }
  return "act";
}

export function toolLaneStepId(lane: "gather" | "act"): string {
  return lane === "gather"
    ? SPOTLIGHT_PIPELINE_STEP_IDS.gather
    : SPOTLIGHT_PIPELINE_STEP_IDS.act;
}

export function toolLaneStepLabel(lane: "gather" | "act"): string {
  return lane === "gather" ? "获取信息" : "操作页面";
}
