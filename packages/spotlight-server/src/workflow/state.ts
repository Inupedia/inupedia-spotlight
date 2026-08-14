import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type {
  EvidenceBundle,
  IntentDecision,
  WorkflowLane,
} from "../contracts.js";
import {
  emptyEvidenceBundle,
  applyEvidenceUpdate,
  resetEvidenceBundle,
} from "./evidence.js";

export const INVOKED_TOOLS_TURN_RESET = "__spotlight_turn_reset__";

export const RuntimeState = Annotation.Root({
  question: Annotation<string>(),
  decision: Annotation<IntentDecision>(),
  lane: Annotation<WorkflowLane>(),
  skipGather: Annotation<boolean>(),
  assistantReply: Annotation<string>(),
  invokedClientTools: Annotation<string[]>({
    reducer: (left, right) => {
      if (right[0] === INVOKED_TOOLS_TURN_RESET) return right.slice(1);
      return [...left, ...right];
    },
    default: () => [],
  }),
  evidenceBundle: Annotation<EvidenceBundle>({
    reducer: applyEvidenceUpdate,
    default: emptyEvidenceBundle,
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

export type RuntimeStateType = typeof RuntimeState.State;

export function messageText(message: BaseMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) =>
      typeof part === "string" ? part : "text" in part ? String(part.text) : "",
    )
    .join("");
}

export function finalAgentText(result: { messages?: BaseMessage[] }): string {
  return messageText(result.messages?.at(-1)).trim();
}

export function compactText(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function initialRuntimeState(
  question: string,
  messages?: BaseMessage[],
): Partial<RuntimeStateType> {
  return {
    question,
    messages: messages ?? [new HumanMessage(question)],
    invokedClientTools: [INVOKED_TOOLS_TURN_RESET],
    assistantReply: "",
    skipGather: false,
    evidenceBundle: resetEvidenceBundle(),
  };
}

export function assistantUpdate(reply: string) {
  return {
    assistantReply: reply,
    messages: [new AIMessage(reply)],
  };
}
