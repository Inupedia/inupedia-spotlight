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
import { emptyEvidenceBundle, mergeEvidenceBundles } from "./evidence.js";

export const RuntimeState = Annotation.Root({
  question: Annotation<string>(),
  decision: Annotation<IntentDecision>(),
  lane: Annotation<WorkflowLane>(),
  skipGather: Annotation<boolean>(),
  assistantReply: Annotation<string>(),
  invokedClientTools: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  evidenceBundle: Annotation<EvidenceBundle>({
    reducer: (left, right) => {
      if (!right.items.length && !right.attemptedSources.length) return left;
      if (!left.items.length && !left.attemptedSources.length) return right;
      return mergeEvidenceBundles(left, right);
    },
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
    invokedClientTools: [],
    assistantReply: "",
    skipGather: false,
    evidenceBundle: emptyEvidenceBundle(),
  };
}

export function assistantUpdate(reply: string) {
  return {
    assistantReply: reply,
    messages: [new AIMessage(reply)],
  };
}
