import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  contextEditingMiddleware,
  summarizationMiddleware,
} from "langchain";

/** LangChain agent middleware for long multi-turn conversations. */
export function conversationMemoryMiddleware(model: BaseChatModel) {
  return [
    summarizationMiddleware({
      model,
      trigger: { messages: 14 },
      keep: { messages: 6 },
    }),
    contextEditingMiddleware(),
  ];
}
