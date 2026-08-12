import { getWriter, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { SpotlightGraphOptions, SpotlightGraphToolEvent, WorkflowStreamEvent } from "./types.js";

export function emitPhase(
  config: LangGraphRunnableConfig | undefined,
  options: Pick<SpotlightGraphOptions, "onPhase">,
  phase: string,
  summary: string,
): void {
  options.onPhase?.(phase, summary);
  getWriter(config)?.({
    kind: "phase",
    phase,
    summary,
  } satisfies WorkflowStreamEvent);
}

export function emitTool(
  config: LangGraphRunnableConfig | undefined,
  options: Pick<SpotlightGraphOptions, "onTool">,
  event: SpotlightGraphToolEvent,
): void {
  options.onTool?.(event);
  getWriter(config)?.({ kind: "tool", event } satisfies WorkflowStreamEvent);
}
