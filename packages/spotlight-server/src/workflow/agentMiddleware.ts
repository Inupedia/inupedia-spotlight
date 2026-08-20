import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  contextEditingMiddleware,
  createMiddleware,
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

/**
 * Re-read the page before every model call inside the agent loop.
 *
 * The browser piggybacks a fresh observation on each host tool result, so by the
 * time the agent decides its next step this returns what the page looks like
 * *after* the previous step — not the stale snapshot taken when the run started.
 */
export function observationMiddleware(readObservedPrompt: () => string) {
  return createMiddleware({
    name: "SpotlightObservation",
    wrapModelCall: async (request, handler) => {
      const observed = readObservedPrompt();
      if (!observed) return handler(request);
      const systemPrompt = [request.systemPrompt, observed]
        .filter((block) => typeof block === "string" && block.trim())
        .join("\n\n");
      return handler({ ...request, systemPrompt });
    },
  });
}
