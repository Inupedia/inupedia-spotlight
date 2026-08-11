import type {
  HostToolEffect,
  SpotlightMemoryDecision,
} from "@inupedia/spotlight-protocol";
import { useAgentSessionStore } from "../session/agentSession.js";
import { useSpotlightMemoryPreferenceStore } from "../store/memoryPreferenceStore.js";
import { useSpotlightRuntimeStore } from "../store/runtimeStore.js";
import { SPOTLIGHT_PIPELINE_STEP_IDS } from "../store/pipeline/constants.js";
import {
  composeToolStepContent,
  isLoopPlanningChunk,
  splitIntentStepContent,
  splitToolStepContent,
} from "../store/pipeline/displayText.js";
import type { HandlerApi } from "../store/pipeline/types.js";
import type { AgentStep, AgentStepToolCall } from "../store/types.js";
import type { SpotlightExecutionEvent } from "../store/runtime/types.js";
import { getSpotlightConfig } from "../plugin.js";
import {
  ensureHostToolsManifest,
  executeRemoteHostTool,
} from "./hostToolRunner.js";
import {
  buildSpotlightJsonHeaders,
  getSpotlightProjectId,
  getSpotlightServerBase,
} from "./httpConfig.js";
import { ensureSpotlightMeta } from "./meta.js";
import type { SpotlightPipelineRunOutcome } from "./types.js";

const activeRunBySignal = new WeakMap<AbortSignal, string>();

type RemoteRunEvent =
  | SpotlightExecutionEvent
  | {
      type: "host_action_request";
      at: number;
      iteration: number;
      request: {
        correlationId: string;
        call: {
          id: string;
          name: string;
          input: Record<string, unknown>;
          displayName: string;
        };
        hostEffect?: HostToolEffect;
      };
    }
  | {
      type: "run_completed";
      at: number;
      runId: string;
      turnId: string;
      assistantReply: string | null;
      commandName: string | null;
      stopReason: string;
      failureClass: string | null;
      elapsedMs: number;
      memoryReplay?: {
        source: "exact" | "semantic" | "session";
        entryId: string;
        replayedAt: number;
        kind: string;
      };
      memoryDecision?: SpotlightMemoryDecision;
      sessionPatch?: Partial<
        import("@inupedia/spotlight-protocol").SpotlightSessionState
      >;
    }
  | {
      type: "memory_decision";
      at: number;
      turnId: string;
      decision: SpotlightMemoryDecision;
    }
  | {
      type: "run_error";
      at: number;
      runId: string;
      error: string;
    }
  | {
      type: "ping";
      at: number;
    }
  | {
      type: "skill_permission_request";
      at: number;
      skillName: string;
      displayName?: string;
      reason: string;
      source: "model" | "user-slash";
    }
  | {
      type: "fork_progress";
      at: number;
      agentId: string;
      iteration: number;
      phase: "plan" | "tool_execution" | "respond";
      summary: string;
    }
  | {
      type: "assistant_response";
      at: number;
      iteration: number;
      content: string;
    }
  | {
      type: "agent_memory_updated";
      at: number;
      projectId: string;
      tenantId?: string;
      action: "remember" | "forget";
      slug?: string;
      reason?: string;
    };

function isTelemetryEvent(
  event: RemoteRunEvent,
): event is SpotlightExecutionEvent {
  return (
    event.type !== "host_action_request" &&
    event.type !== "run_completed" &&
    event.type !== "run_error" &&
    event.type !== "ping" &&
    event.type !== "memory_decision"
  );
}

function ensureStep(api: HandlerApi, id: string, label: string): AgentStep {
  const existing = api.getSteps().find((step) => step.id === id);
  if (existing) return existing;
  const next: AgentStep = { id, label, status: "pending" };
  api.setSteps([...api.getSteps(), next]);
  return next;
}

function paintYield(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function formatHostToolResultText(
  result: Extract<RemoteRunEvent, { type: "tool_result" }>["result"],
): string {
  const summary = result.summary?.trim();
  if (
    summary &&
    summary.length > 48 &&
    !summary.startsWith("{") &&
    !summary.startsWith("[")
  ) {
    return summary;
  }
  if (result.output != null && typeof result.output === "object") {
    try {
      const payload = JSON.stringify(result.output, null, 2);
      if (payload && payload !== "{}") return payload;
    } catch {
      // fall through
    }
  }
  return summary || "";
}

function buildToolResultCall(
  event: Extract<RemoteRunEvent, { type: "tool_result" }>,
): AgentStepToolCall {
  const resultText = formatHostToolResultText(event.result);
  return {
    id: event.result.call.id,
    name: event.result.call.name,
    displayName: event.result.call.displayName,
    argsText: JSON.stringify(event.result.call.input ?? {}, null, 2),
    resultText,
    summary: event.result.summary,
    errorCode: event.result.errorCode,
    trace: event.result.trace,
    status: event.result.success ? "done" : "error",
  };
}

function toolCallFromRemote(
  event: Extract<RemoteRunEvent, { type: "tool_start" }>,
): AgentStepToolCall {
  return {
    id: event.call.id,
    name: event.call.name,
    displayName: event.call.displayName,
    argsText: JSON.stringify(event.call.input ?? {}, null, 2),
    status: "running",
  };
}

function toolCallFromHostAction(
  call: Extract<
    RemoteRunEvent,
    { type: "host_action_request" }
  >["request"]["call"],
  result: Awaited<ReturnType<typeof executeRemoteHostTool>>,
): AgentStepToolCall {
  const resultText = result.success
    ? "前端操作已执行。"
    : result.error || "前端操作执行失败。";
  return {
    id: call.id,
    name: call.name,
    displayName: call.displayName,
    argsText: JSON.stringify(call.input ?? {}, null, 2),
    resultText,
    summary: resultText,
    errorCode: result.errorCode,
    trace: result.trace,
    status: result.success ? "done" : "error",
  };
}

function isPureHostOperation(callName: string): boolean {
  return (
    callName.startsWith("panel.") ||
    callName.startsWith("navigate.") ||
    callName.startsWith("session.")
  );
}

function settlePureHostOperationStep(
  api: HandlerApi,
  event: Extract<RemoteRunEvent, { type: "host_action_request" }>,
  result: Awaited<ReturnType<typeof executeRemoteHostTool>>,
) {
  if (!isPureHostOperation(event.request.call.name)) return;
  ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool, "执行工具与回答");
  const toolCall = toolCallFromHostAction(event.request.call, result);
  api.appendToolCallsToStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, [toolCall]);
  api.setStep(
    SPOTLIGHT_PIPELINE_STEP_IDS.tool,
    result.success ? "done" : "error",
    toolCall.resultText,
  );
}

function ensureToolStepActive(api: HandlerApi, stepId: string) {
  if (stepId !== SPOTLIGHT_PIPELINE_STEP_IDS.tool) return;
  const step = api.getSteps().find((item) => item.id === stepId);
  if (!step || step.status === "active" || step.status === "done") return;
  api.setStep(stepId, "active", step.content);
}

function toolStepLabel(
  stepId: string,
  label: string | null | undefined,
): string {
  if (label) return label;
  return stepId === SPOTLIGHT_PIPELINE_STEP_IDS.tool
    ? "执行工具与回答"
    : stepId;
}

async function applyRemoteEvent(api: HandlerApi, event: RemoteRunEvent) {
  if (event.type === "ping") return;

  if (event.type === "step_sync") {
    api.setSteps(
      event.steps.map((step) => ({
        id: step.id,
        label: step.label,
        status: step.status,
        content: api.getSteps().find((item) => item.id === step.id)?.content,
      })),
    );
  } else if (event.type === "step_status") {
    ensureStep(api, event.stepId, event.label ?? event.stepId);
    api.setStep(event.stepId, event.status, event.content);
  } else if (event.type === "step_content") {
    let stepId = event.stepId;
    let content = event.content;

    // 兼容旧服务端：loop 规划摘要误写入 intent 步骤时，重定向到 tool 步骤。
    if (
      stepId === SPOTLIGHT_PIPELINE_STEP_IDS.intent &&
      isLoopPlanningChunk(content)
    ) {
      stepId = SPOTLIGHT_PIPELINE_STEP_IDS.tool;
    } else if (
      stepId === SPOTLIGHT_PIPELINE_STEP_IDS.intent &&
      event.mode === "replace"
    ) {
      const { intent, misplacedPlanning } = splitIntentStepContent(content);
      content = intent;
      if (misplacedPlanning.trim()) {
        ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool, "执行工具与回答");
        api.appendChunkToStep(
          SPOTLIGHT_PIPELINE_STEP_IDS.tool,
          misplacedPlanning,
        );
      }
    }

    ensureStep(api, stepId, toolStepLabel(stepId, event.label));
    if (event.mode === "replace") {
      api.setStep(
        stepId,
        api.getSteps().find((step) => step.id === stepId)?.status ?? "active",
        content,
      );
    } else {
      ensureToolStepActive(api, stepId);
      api.appendChunkToStep(stepId, content);
      await paintYield();
    }
  } else if (event.type === "step_artifact") {
    ensureStep(api, event.stepId, toolStepLabel(event.stepId, event.label));
    ensureToolStepActive(api, event.stepId);
    if (event.artifact === "tool_calls" && event.toolCalls?.length) {
      api.appendToolCallsToStep(event.stepId, event.toolCalls);
    } else if (event.artifact === "attachments" && event.attachments?.length) {
      api.appendAttachmentsToStep(event.stepId, event.attachments);
    } else if (event.artifact === "files" && event.files?.length) {
      api.appendFilesToStep(event.stepId, event.files);
    } else if (event.artifact === "artifacts" && event.artifacts?.length) {
      api.appendArtifactsToStep(event.stepId, event.artifacts);
    } else if (event.artifact === "chat_items" && event.chatItems?.length) {
      api.appendChatItemsToStep(event.stepId, event.chatItems);
    }
  } else if (event.type === "tool_start") {
    ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool, "执行工具与回答");
    ensureToolStepActive(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool);
    api.appendToolCallsToStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, [
      toolCallFromRemote(event),
    ]);
  } else if (event.type === "tool_progress") {
    ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool, "执行工具与回答");
    ensureToolStepActive(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool);
    api.appendToolCallsToStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, [
      {
        id: event.call.id,
        name: event.call.name,
        displayName: event.call.displayName,
        argsText: JSON.stringify(event.call.input ?? {}, null, 2),
        summary: event.summary,
        status: "running",
      },
    ]);
  } else if (event.type === "tool_result") {
    ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool, "执行工具与回答");
    ensureToolStepActive(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool);
    api.appendToolCallsToStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, [
      buildToolResultCall(event),
    ]);
    if (event.result.attachments?.length) {
      api.appendAttachmentsToStep(
        SPOTLIGHT_PIPELINE_STEP_IDS.tool,
        event.result.attachments,
      );
    }
    if (event.result.files?.length) {
      api.appendFilesToStep(
        SPOTLIGHT_PIPELINE_STEP_IDS.tool,
        event.result.files,
      );
    }
    if (event.result.toolCalls?.length) {
      api.appendToolCallsToStep(
        SPOTLIGHT_PIPELINE_STEP_IDS.tool,
        event.result.toolCalls,
      );
    }
  } else if (event.type === "skill_permission_request") {
    const { useSpotlightStore } = await import("../store/spotlightStore.js");
    useSpotlightStore().setPendingSkillPermission({
      skillName: event.skillName,
      displayName: event.displayName,
      reason: event.reason,
      source: event.source,
      at: event.at,
    });
  } else if (event.type === "fork_progress") {
    ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool, "执行工具与回答");
    api.appendChunkToStep(
      SPOTLIGHT_PIPELINE_STEP_IDS.tool,
      `\n[fork ${event.agentId}] 第 ${event.iteration} 轮 · ${event.phase}：${event.summary}\n`,
    );
  } else if (event.type === "turn_transition") {
    if (event.phase === "memory_replay") {
      ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.breakdown, "问题拆解");
      api.setStep(
        SPOTLIGHT_PIPELINE_STEP_IDS.breakdown,
        "done",
        event.summary ?? "Memory 缓存命中，跳过 LLM 规划。",
      );
    }
  } else if (event.type === "memory_decision") {
    ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.breakdown, "问题拆解");
    const labels: Record<SpotlightMemoryDecision["action"], string> = {
      reuse: "已复用项目记忆",
      augment: "正在结合历史项目结论",
      refresh: "资料可能变化，正在重新验证",
      ignore: "未发现可直接使用的项目记忆",
    };
    api.setStep(
      SPOTLIGHT_PIPELINE_STEP_IDS.breakdown,
      event.decision.action === "reuse" ? "done" : "active",
      labels[event.decision.action],
    );
  } else if (event.type === "assistant_response") {
    ensureStep(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool, "执行工具与回答");
    const step = api
      .getSteps()
      .find((item) => item.id === SPOTLIGHT_PIPELINE_STEP_IDS.tool);
    const { planning, answer } = splitToolStepContent(step?.content ?? "");
    const finalAnswer = event.content.trim();
    const streamedAnswer = answer.trim();
    if (
      streamedAnswer &&
      finalAnswer &&
      (streamedAnswer === finalAnswer ||
        finalAnswer.startsWith(
          streamedAnswer.slice(0, Math.min(streamedAnswer.length, 80)),
        ))
    ) {
      api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "done");
    } else {
      api.setStep(
        SPOTLIGHT_PIPELINE_STEP_IDS.tool,
        "done",
        composeToolStepContent(planning, finalAnswer),
      );
    }
  }

  if (isTelemetryEvent(event)) {
    api.appendExecutionEvent?.(event);
  }
}

async function postHostResult(params: {
  runId: string;
  correlationId: string;
  result: Awaited<ReturnType<typeof executeRemoteHostTool>>;
  signal?: AbortSignal;
}) {
  await fetch(
    `${getSpotlightServerBase()}/v1/runs/${encodeURIComponent(params.runId)}/host-results`,
    {
      method: "POST",
      headers: buildSpotlightJsonHeaders(),
      body: JSON.stringify({
        correlationId: params.correlationId,
        success: params.result.success,
        output: params.result.data,
        error: params.result.error,
        errorCode: params.result.errorCode,
        trace: params.result.trace,
      }),
      signal: params.signal,
    },
  );
}

function parseSseChunk(buffer: string): {
  events: RemoteRunEvent[];
  rest: string;
} {
  const frames = buffer.split(/\n\n/u);
  const rest = frames.pop() ?? "";
  const events = frames.flatMap((frame) => {
    const dataLine = frame
      .split(/\n/u)
      .find((line) => line.startsWith("data: "));
    if (!dataLine) return [];
    try {
      return [JSON.parse(dataLine.slice(6)) as RemoteRunEvent];
    } catch {
      return [];
    }
  });
  return { events, rest };
}

export async function warmupSpotlightRemoteContext(
  signal?: AbortSignal,
): Promise<void> {
  await Promise.allSettled([
    ensureHostToolsManifest(signal),
    ensureSpotlightMeta(signal),
  ]);
}

async function buildRemotePayload(
  userQuestion: string,
  signal?: AbortSignal,
  options?: { forceMemoryRefresh?: boolean },
) {
  const session = useAgentSessionStore();
  const runtime = useSpotlightRuntimeStore();
  const memoryPreference = useSpotlightMemoryPreferenceStore();
  const hostManifest = await ensureHostToolsManifest(signal);
  return {
    hostManifest,
    payload: {
      projectId: getSpotlightProjectId(),
      sessionId: session.sessionId,
      memorySubjectId: getSpotlightConfig().getMemorySubjectId?.() ?? undefined,
      userQuestion,
      memoryRefreshRequested: options?.forceMemoryRefresh === true,
      uiContext: getSpotlightConfig().getUiContext?.() ?? {},
      sessionState: {
        sessionId: session.sessionId,
        activeTaskId: session.activeTaskId,
        activeTopic: session.activeTopic,
        pendingTask: session.pendingTask,
        conversationSummary: session.conversationSummary,
        summarizedTurnCount: session.summarizedTurnCount,
        conversationHistory: session.conversationHistory,
        lastAssistantReply: session.getLastAssistantContent(),
        invokedSkills: session.invokedSkills,
        skillPermissionGrants: session.skillPermissionGrants,
        memoryReadEnabled: memoryPreference.enabled,
        memoryWriteEnabled: true,
      },
      runtimeState: {
        activeDomain: runtime.activeDomain,
        activeTarget: runtime.activeTarget,
        activeAction: runtime.activeAction,
        resumableAction: runtime.resumableAction,
        lastResolvedTarget: runtime.lastResolvedTarget,
      },
      clientToolsManifestVersion: hostManifest.manifestDigest,
      clientToolManifest: hostManifest,
      frontendBuildId: hostManifest.frontendBuildId,
      manifestDigest: hostManifest.manifestDigest,
    },
  };
}

export async function runRemoteSpotlightPipeline(
  userQuestion: string,
  api: HandlerApi,
  options?: { forceMemoryRefresh?: boolean },
): Promise<SpotlightPipelineRunOutcome> {
  const base = getSpotlightServerBase();
  const signal = api.getSignal();
  const { payload, hostManifest } = await buildRemotePayload(
    userQuestion,
    signal,
    options,
  );
  const allowedHostNames = new Set(hostManifest.tools.map((t) => t.name));
  const createResponse = await fetch(`${base}/v1/runs`, {
    method: "POST",
    headers: buildSpotlightJsonHeaders(),
    body: JSON.stringify(payload),
    signal,
  });
  if (!createResponse.ok) {
    const text = await createResponse.text().catch(() => "");
    throw new Error(
      `Spotlight 后端创建 run 失败：${createResponse.status} ${text}`,
    );
  }
  const { runId } = (await createResponse.json()) as { runId: string };
  if (signal) {
    activeRunBySignal.set(signal, runId);
    signal.addEventListener(
      "abort",
      () => {
        void cancelRemoteSpotlightRun(runId);
      },
      { once: true },
    );
  }
  const eventsResponse = await fetch(
    `${base}/v1/runs/${encodeURIComponent(runId)}/events`,
    {
      headers: buildSpotlightJsonHeaders(),
      signal,
    },
  );
  if (!eventsResponse.ok || !eventsResponse.body) {
    throw new Error(`Spotlight 后端事件流连接失败：${eventsResponse.status}`);
  }

  const reader = eventsResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.type === "host_action_request") {
          const result = await executeRemoteHostTool(event.request.call, api, {
            allowedHostNames,
            hostEffect: event.request.hostEffect,
          });
          settlePureHostOperationStep(api, event, result);
          await postHostResult({
            runId,
            correlationId: event.request.correlationId,
            result,
            signal,
          });
          continue;
        }
        if (event.type === "run_error") {
          throw new Error(event.error);
        }
        await applyRemoteEvent(api, event);
        if (event.type === "run_completed") {
          if (event.sessionPatch) {
            useAgentSessionStore().applySessionPatch(event.sessionPatch);
          }
          return {
            command: null,
            memoryReplay: event.memoryReplay ?? null,
            memoryDecision: event.memoryDecision ?? null,
            assistantReply: event.assistantReply,
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    command: null,
  };
}

export async function cancelRemoteSpotlightRun(runId: string) {
  await fetch(
    `${getSpotlightServerBase()}/v1/runs/${encodeURIComponent(runId)}`,
    {
      method: "DELETE",
      headers: buildSpotlightJsonHeaders(),
    },
  );
}

export function cancelRemoteSpotlightRunForSignal(signal?: AbortSignal) {
  if (!signal) return;
  const runId = activeRunBySignal.get(signal);
  if (!runId) return;
  activeRunBySignal.delete(signal);
  void cancelRemoteSpotlightRun(runId);
}
