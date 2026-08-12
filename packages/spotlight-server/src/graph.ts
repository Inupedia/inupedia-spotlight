import type { RunContext, SpotlightRunResult } from "./contracts.js";
import { compileSpotlightWorkflow } from "./workflow/buildGraph.js";
import { initialRuntimeState } from "./workflow/state.js";
import type {
  SpotlightGraphOptions,
  SpotlightGraphToolEvent,
  WorkflowStreamEvent,
} from "./workflow/types.js";

export type { SpotlightGraphOptions, SpotlightGraphToolEvent };

function threadId(context: RunContext): string {
  return `${context.project.projectId}:${context.request.sessionId ?? context.runId}`;
}

export function publicRouteFromLane(
  lane: string | undefined,
  invokedClientTools: string[],
): SpotlightRunResult["route"] {
  if (lane === "clarify") return "clarify";
  if (lane === "action" || invokedClientTools.length > 0) return "action";
  return "knowledge";
}

export function compileSpotlightGraph(
  context: RunContext,
  options: SpotlightGraphOptions,
) {
  return compileSpotlightWorkflow(context, options);
}

export function workflowRunnableConfig(context: RunContext) {
  return {
    configurable: { thread_id: threadId(context) },
    signal: context.signal,
  };
}

export async function runSpotlightGraph(
  context: RunContext,
  options: SpotlightGraphOptions,
): Promise<SpotlightRunResult> {
  const graph = compileSpotlightWorkflow(context, options);
  const result = await graph.invoke(
    initialRuntimeState(context.request.userQuestion),
    workflowRunnableConfig(context),
  );
  return {
    route: publicRouteFromLane(result.lane, result.invokedClientTools ?? []),
    assistantReply: result.assistantReply,
    decision: result.decision,
    invokedClientTools: result.invokedClientTools ?? [],
  };
}

function asWorkflowStreamEvent(value: unknown): WorkflowStreamEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "phase" || record.kind === "tool") {
    return value as WorkflowStreamEvent;
  }
  if (record.custom) return asWorkflowStreamEvent(record.custom);
  return null;
}

export async function* streamSpotlightGraph(
  context: RunContext,
  options: SpotlightGraphOptions,
): AsyncGenerator<WorkflowStreamEvent> {
  const graph = compileSpotlightWorkflow(context, options);
  const runConfig = {
    ...workflowRunnableConfig(context),
    streamMode: ["custom"] as ["custom"],
  };
  const stream = await graph.stream(
    initialRuntimeState(context.request.userQuestion),
    runConfig,
  );
  for await (const chunk of stream) {
    const event = asWorkflowStreamEvent(chunk);
    if (event) yield event;
  }
}

export async function getSpotlightGraphResult(
  context: RunContext,
  options: SpotlightGraphOptions,
): Promise<SpotlightRunResult> {
  const graph = compileSpotlightWorkflow(context, options);
  const snapshot = await graph.getState(workflowRunnableConfig(context));
  const values = snapshot.values;
  return {
    route: publicRouteFromLane(values.lane, values.invokedClientTools ?? []),
    assistantReply: values.assistantReply,
    decision: values.decision,
    invokedClientTools: values.invokedClientTools ?? [],
  };
}
