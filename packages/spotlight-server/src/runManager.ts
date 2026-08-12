import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import type {
  CreateRunRequest,
  HostToolResultRequest,
  SpotlightMemoryDecision,
  SpotlightMemoryReplayMeta,
} from "@inupedia/spotlight-protocol";
import type { MemoryGate } from "@inupedia/spotlight-memory/node";
import type {
  HostActionBridge,
  HostActionCall,
  ProjectPack,
  RunContext,
  SpotlightToolCallInfo,
} from "./contracts.js";
import {
  compileSpotlightGraph,
  publicRouteFromLane,
  workflowRunnableConfig,
} from "./graph.js";
import type { SpotlightGraphToolEvent } from "./graph.js";
import {
  buildMemoryDecision,
  lookupProjectMemory,
  replayMetaFromHit,
  writeProjectMemory,
} from "./memory/runMemory.js";
import { memoryControlMode } from "./safety.js";
import {
  buildSessionContext,
  initialMessagesForRun,
} from "./workflow/sessionContext.js";
import { initialRuntimeState } from "./workflow/state.js";
import type { IntentRouter } from "./router.js";

export type SpotlightServerRunEvent =
  | {
      type: "turn_transition";
      at: number;
      turnId: string;
      phase: string;
      summary?: string;
    }
  | { type: "assistant_response"; at: number; iteration: number; content: string }
  | {
      type: "memory_decision";
      at: number;
      turnId: string;
      decision: SpotlightMemoryDecision;
    }
  | {
      type: "host_action_request";
      at: number;
      iteration: number;
      request: { correlationId: string; call: HostActionCall };
    }
  | {
      type: "tool_start";
      at: number;
      iteration: number;
      call: SpotlightToolCallInfo;
    }
  | {
      type: "tool_progress";
      at: number;
      iteration: number;
      call: SpotlightToolCallInfo;
      summary: string;
    }
  | {
      type: "tool_result";
      at: number;
      iteration: number;
      result: {
        call: SpotlightToolCallInfo;
        success: boolean;
        summary: string;
        output?: unknown;
        error?: string;
        trace: [];
      };
    }
  | {
      type: "run_completed";
      at: number;
      runId: string;
      turnId: string;
      assistantReply: string;
      commandName: string | null;
      stopReason: string;
      failureClass: null;
      elapsedMs: number;
      memoryReplay?: SpotlightMemoryReplayMeta;
      memoryDecision?: SpotlightMemoryDecision;
    }
  | { type: "run_error"; at: number; runId: string; error: string };

type RunRequest = CreateRunRequest & {
  clientToolManifest?: RunContext["request"]["clientToolManifest"];
  frontendBuildId?: string;
};

interface RunState {
  id: string;
  request: RunRequest;
  events: SpotlightServerRunEvent[];
  subscribers: Set<(event: SpotlightServerRunEvent) => void>;
  waiters: Map<
    string,
    {
      resolve: (result: HostToolResultRequest) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >;
  controller: AbortController;
  terminal: boolean;
}

export interface RunManagerOptions {
  project: ProjectPack;
  model: BaseChatModel;
  router: IntentRouter;
  checkpointer: BaseCheckpointSaver;
  store: BaseStore;
  memoryGate?: MemoryGate;
  hostActionTimeoutMs?: number;
  runTtlMs?: number;
}

export class RunManager {
  private readonly runs = new Map<string, RunState>();

  constructor(private readonly options: RunManagerOptions) {}

  createRun(request: RunRequest): { id: string } {
    const id = crypto.randomUUID();
    const run: RunState = {
      id,
      request,
      events: [],
      subscribers: new Set(),
      waiters: new Map(),
      controller: new AbortController(),
      terminal: false,
    };
    this.runs.set(id, run);
    queueMicrotask(() => void this.execute(run));
    return { id };
  }

  getRun(id: string): RunState | undefined {
    return this.runs.get(id);
  }

  subscribe(
    id: string,
    listener: (event: SpotlightServerRunEvent) => void,
  ): (() => void) | null {
    const run = this.runs.get(id);
    if (!run) return null;
    for (const event of run.events) listener(event);
    if (run.terminal) return () => undefined;
    run.subscribers.add(listener);
    return () => run.subscribers.delete(listener);
  }

  private emit(run: RunState, event: SpotlightServerRunEvent): void {
    run.events.push(event);
    for (const listener of run.subscribers) listener(event);
  }

  private finish(run: RunState, event: SpotlightServerRunEvent): void {
    run.terminal = true;
    this.emit(run, event);
    const timer = setTimeout(
      () => this.runs.delete(run.id),
      this.options.runTtlMs ?? 10 * 60_000,
    );
    timer.unref();
  }

  private hostBridge(run: RunState): HostActionBridge {
    return {
      request: (call) =>
        new Promise<HostToolResultRequest>((resolve, reject) => {
          const correlationId = crypto.randomUUID();
          const timer = setTimeout(() => {
            run.waiters.delete(correlationId);
            reject(new Error(`Client tool timed out: ${call.name}`));
          }, this.options.hostActionTimeoutMs ?? 30_000);
          run.waiters.set(correlationId, { resolve, reject, timer });
          this.emit(run, {
            type: "host_action_request",
            at: Date.now(),
            iteration: 1,
            request: { correlationId, call },
          });
        }),
    };
  }

  completeHostAction(runId: string, result: HostToolResultRequest): boolean {
    const waiter = this.runs.get(runId)?.waiters.get(result.correlationId);
    if (!waiter) return false;
    clearTimeout(waiter.timer);
    this.runs.get(runId)?.waiters.delete(result.correlationId);
    waiter.resolve(result);
    return true;
  }

  cancelRun(id: string): boolean {
    const run = this.runs.get(id);
    if (!run) return false;
    run.controller.abort(new Error("Run cancelled"));
    for (const waiter of run.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Run cancelled"));
    }
    run.waiters.clear();
    return true;
  }

  private async execute(run: RunState): Promise<void> {
    const startedAt = Date.now();
    const turnId = crypto.randomUUID();
    this.emit(run, {
      type: "turn_transition",
      at: Date.now(),
      turnId,
      phase: "routing",
      summary: "正在识别本次请求属于知识问答、页面操作，还是需要补充信息。",
    });
    try {
      const context = {
        request: run.request,
        runId: run.id,
        project: this.options.project,
        host: this.hostBridge(run),
        signal: run.controller.signal,
      };
      const graphOptions = {
        ...this.options,
        onPhase: (phase: string, summary: string) =>
          this.emit(run, {
            type: "turn_transition" as const,
            at: Date.now(),
            turnId,
            phase,
            summary,
          }),
        onTool: (event: SpotlightGraphToolEvent) => {
          if (event.type === "tool_start") {
            this.emit(run, {
              type: "tool_start",
              at: Date.now(),
              iteration: 1,
              call: event.call,
            });
            return;
          }
          if (event.type === "tool_progress") {
            this.emit(run, {
              type: "tool_progress",
              at: Date.now(),
              iteration: 1,
              call: event.call,
              summary: event.summary,
            });
            return;
          }
          this.emit(run, {
            type: "tool_result",
            at: Date.now(),
            iteration: 1,
            result: {
              ...event.result,
              trace: [],
            },
          });
        },
      };
      const graph = compileSpotlightGraph(context, graphOptions);
      const runConfig = {
        ...workflowRunnableConfig(context),
        streamMode: ["custom"] as ["custom"],
      };

      let memoryLookup:
        | Awaited<ReturnType<typeof lookupProjectMemory>>
        | null = null;
      let memoryDecision: SpotlightMemoryDecision | null = null;
      let memoryReplay: SpotlightMemoryReplayMeta | null = null;

      if (
        this.options.memoryGate &&
        !memoryControlMode(run.request.userQuestion)
      ) {
        memoryLookup = await lookupProjectMemory(
          this.options.memoryGate,
          run.request,
          this.options.project.projectId,
        );
        memoryDecision = buildMemoryDecision(
          memoryLookup,
          run.request.memoryRefreshRequested === true,
        );
        this.emit(run, {
          type: "memory_decision",
          at: Date.now(),
          turnId,
          decision: memoryDecision,
        });

        if (
          memoryDecision.action === "reuse" &&
          memoryLookup.hit &&
          memoryLookup.result.entry.answer?.trim()
        ) {
          memoryReplay = replayMetaFromHit(memoryLookup);
          const assistantReply = memoryLookup.result.entry.answer!.trim();
          this.emit(run, {
            type: "turn_transition",
            at: Date.now(),
            turnId,
            phase: "memory_replay",
            summary: "已复用项目记忆，跳过本轮 LLM 规划。",
          });
          this.emit(run, {
            type: "assistant_response",
            at: Date.now(),
            iteration: 1,
            content: assistantReply,
          });
          this.finish(run, {
            type: "run_completed",
            at: Date.now(),
            runId: run.id,
            turnId,
            assistantReply,
            commandName: null,
            stopReason: "knowledge",
            failureClass: null,
            elapsedMs: Date.now() - startedAt,
            memoryReplay,
            memoryDecision,
          });
          return;
        }
      }

      const sessionContext = buildSessionContext(run.request);
      const priorState = await graph.getState(runConfig);
      const checkpointMessageCount = priorState?.values?.messages?.length ?? 0;
      const messages = initialMessagesForRun(
        run.request.userQuestion,
        sessionContext,
        checkpointMessageCount,
      );

      const stream = await graph.stream(
        initialRuntimeState(run.request.userQuestion, messages),
        runConfig,
      );
      for await (const _chunk of stream) {
        // Custom stream events are also mirrored through onPhase/onTool.
      }
      const values = (await graph.getState(runConfig)).values;
      const result = {
        route: publicRouteFromLane(
          values.lane,
          values.invokedClientTools ?? [],
        ),
        assistantReply: values.assistantReply,
        decision: values.decision,
        invokedClientTools: values.invokedClientTools ?? [],
      };

      if (
        this.options.memoryGate &&
        memoryDecision?.action !== "refresh" &&
        result.assistantReply?.trim()
      ) {
        await writeProjectMemory(this.options.memoryGate, {
          request: run.request,
          projectId: this.options.project.projectId,
          runId: run.id,
          route: result.route,
          assistantReply: result.assistantReply,
          confidence: result.decision?.confidence ?? 0.85,
          invokedTools: result.invokedClientTools,
        });
      }

      this.emit(run, {
        type: "assistant_response",
        at: Date.now(),
        iteration: 1,
        content: result.assistantReply,
      });
      this.finish(run, {
        type: "run_completed",
        at: Date.now(),
        runId: run.id,
        turnId,
        assistantReply: result.assistantReply,
        commandName: result.invokedClientTools.at(-1) ?? null,
        stopReason: result.route,
        failureClass: null,
        elapsedMs: Date.now() - startedAt,
        memoryReplay: memoryReplay ?? undefined,
        memoryDecision: memoryDecision ?? undefined,
      });
    } catch (error) {
      this.finish(run, {
        type: "run_error",
        at: Date.now(),
        runId: run.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
