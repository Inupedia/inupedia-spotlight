import type { AgentStepToolCall } from "../types.js";

export const INTERNAL_KNOWLEDGE_SUBTOOLS = new Set([
  "list_kbs",
  "query_kb",
  "ls",
  "list_directory",
  "open_kb_document",
  "find_kb_document",
  "get_mindmap",
]);

export function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

export function isInternalKnowledgeSubtool(name: string): boolean {
  return INTERNAL_KNOWLEDGE_SUBTOOLS.has(normalizeToolName(name));
}

export function isLoopVisibleToolCall(name: string): boolean {
  return !isInternalKnowledgeSubtool(name);
}

/** 仅这些 knowledge 工具的结果可写入「回答」区；searchWeb 为内部证据。 */
export function isUserFacingKnowledgeTool(name: string): boolean {
  const normalized = normalizeToolName(name);
  return (
    normalized === "knowledge.answer" ||
    normalized === "knowledge.synthesizeanswer" ||
    normalized === "project_knowledge_search"
  );
}

export function isInternalKnowledgeEvidenceTool(name: string): boolean {
  return normalizeToolName(name) === "knowledge.searchweb";
}

function mergeToolCallState(
  prev: AgentStepToolCall,
  next: AgentStepToolCall,
): AgentStepToolCall {
  return {
    ...prev,
    ...next,
    argsText: next.argsText ?? prev.argsText,
    resultText: next.resultText ?? prev.resultText,
    summary: next.summary ?? prev.summary,
    status:
      next.status === "done" || next.status === "error"
        ? next.status
        : prev.status,
  };
}

export function dedupeToolCallsByName(
  calls: AgentStepToolCall[],
): AgentStepToolCall[] {
  const visibleById = new Map<string, AgentStepToolCall>();
  const visibleOrder: string[] = [];
  const internalByName = new Map<string, AgentStepToolCall>();

  for (const call of calls) {
    if (isInternalKnowledgeSubtool(call.name)) {
      const key = normalizeToolName(call.name);
      const prev = internalByName.get(key);
      internalByName.set(key, prev ? mergeToolCallState(prev, call) : call);
      continue;
    }

    const prev = visibleById.get(call.id);
    if (prev) {
      visibleById.set(call.id, mergeToolCallState(prev, call));
      continue;
    }
    visibleById.set(call.id, call);
    visibleOrder.push(call.id);
  }

  return [
    ...visibleOrder.map((id) => visibleById.get(id)!),
    ...internalByName.values(),
  ];
}

export function partitionToolCalls(calls: AgentStepToolCall[]): {
  visible: AgentStepToolCall[];
  nestedKnowledge: AgentStepToolCall[];
} {
  const deduped = dedupeToolCallsByName(calls);
  const visible: AgentStepToolCall[] = [];
  const nestedKnowledge: AgentStepToolCall[] = [];
  for (const call of deduped) {
    if (isInternalKnowledgeSubtool(call.name)) {
      nestedKnowledge.push(call);
    } else {
      visible.push(call);
    }
  }
  return { visible, nestedKnowledge };
}
