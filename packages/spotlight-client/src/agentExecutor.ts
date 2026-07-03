import type { AgentToolErrorCode, ToolExecutionTarget } from "@inupedia/spotlight-protocol";
import {
  getTool,
  getToolAvailabilityCheck,
  getToolContextHint,
  getToolExecutionTarget,
  getToolHostEffectBuilder,
  getToolInvoker,
  getToolPreflight,
  getToolRecovery,
  getToolRequirements,
  getToolTimeoutMs,
  type HostToolEffect,
} from "./agentRegistry.js";

export interface ToolTraceEvent {
  phase: "dependency" | "context" | "execution";
  source: "executor" | "spotlight_action";
  type:
    | "start"
    | "missing"
    | "cycle"
    | "require"
    | "prerequisites_resolved"
    | "precondition_failed"
    | "retry_scheduled"
    | "retrying"
    | "recovery_action"
    | "rollback_applied"
    | "rollback_failed"
    | "run_failed"
    | "done";
  tool: string;
  detail?: string;
  at: number;
  elapsedMs: number;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: AgentToolErrorCode;
  executionTarget?: ToolExecutionTarget;
  hostEffect?: HostToolEffect;
  trace: ToolTraceEvent[];
}

export type AgentExecutorContext = Record<string, unknown>;

export type AgentExecutorNavigation = {
  getContext: () => AgentExecutorContext;
  ensureMainScene?: () => Promise<void>;
  ensureMidScene?: () => Promise<void>;
  ensureSmallScene?: () => Promise<void>;
  ensureMainTab?: (tab: string) => Promise<void>;
  ensureSmallTab?: (tab: string) => Promise<void>;
};

export type CreateAgentExecutorOptions = AgentExecutorNavigation & {
  loadTools?: () => Promise<unknown>;
  onToolComplete?: (
    toolName: string,
    input: unknown,
    result: ToolResult<unknown>,
  ) => void;
};

function createTraceEvent(
  phase: ToolTraceEvent["phase"],
  source: ToolTraceEvent["source"],
  type: ToolTraceEvent["type"],
  tool: string,
  startAt: number,
  detail?: string,
): ToolTraceEvent {
  const at = Date.now();
  return {
    phase,
    source,
    type,
    tool,
    detail,
    at,
    elapsedMs: Math.max(0, at - startAt),
  };
}

export function createAgentExecutor(options: CreateAgentExecutorOptions) {
  const ok = <T>(
    data?: T,
    trace: ToolTraceEvent[] = [],
    meta: Pick<ToolResult, "executionTarget" | "hostEffect"> = {},
  ): ToolResult<T> => ({ success: true, data, trace, ...meta });

  const fail = <T>(
    errorCode: AgentToolErrorCode,
    error: string,
    trace: ToolTraceEvent[] = [],
    meta: Pick<ToolResult, "executionTarget" | "hostEffect"> = {},
  ): ToolResult<T> => ({ success: false, errorCode, error, trace, ...meta });

  async function applyContextHint(
    toolName: string,
    ctx: AgentExecutorContext,
  ): Promise<AgentExecutorContext> {
    let nextContext = ctx;
    const tool = getTool(toolName);
    const isAvailable = tool ? getToolAvailabilityCheck(tool) : null;
    if (tool && isAvailable && !isAvailable(nextContext)) {
      const hint = getToolContextHint(tool);
      if (hint?.ensureSceneLevel === 0) {
        await options.ensureMainScene?.();
        nextContext = options.getContext();
      }
      if (hint?.ensureSceneLevel === 1) {
        await options.ensureMidScene?.();
        nextContext = options.getContext();
      }
      if (hint?.ensureSceneLevel === 2) {
        await options.ensureSmallScene?.();
        nextContext = options.getContext();
      }
      if (hint?.ensureMainTab) {
        await options.ensureMainTab?.(hint.ensureMainTab);
        nextContext = options.getContext();
      }
      if (hint?.ensureSmallTab) {
        await options.ensureSmallTab?.(hint.ensureSmallTab);
        nextContext = options.getContext();
      }
    }
    return nextContext;
  }

  async function resolvePrerequisites(
    toolName: string,
    visited: Set<string>,
    trace: ToolTraceEvent[],
    startAt: number,
  ): Promise<ToolResult<void>> {
    const tool = getTool(toolName);
    if (!tool) {
      return fail("UNKNOWN_TOOL", `未知工具: ${toolName}`, [
        ...trace,
        createTraceEvent("execution", "executor", "missing", toolName, startAt),
      ]);
    }
    if (visited.has(toolName)) {
      return fail("CIRCULAR_DEPENDENCY", `工具依赖存在循环: ${toolName}`, [
        ...trace,
        createTraceEvent("dependency", "executor", "cycle", toolName, startAt),
      ]);
    }
    visited.add(toolName);

    for (const dependencyName of tool.requires ?? []) {
      const nextTrace = [
        ...trace,
        createTraceEvent(
          "dependency",
          "executor",
          "require",
          toolName,
          startAt,
          dependencyName,
        ),
      ];
      const result = await runToolInternal(
        dependencyName,
        undefined,
        visited,
        nextTrace,
      );
      if (!result.success) {
        return fail(
          "PREREQUISITE_FAILED",
          `前置工具执行失败: ${toolName} <- ${dependencyName}，${result.error ?? "未知错误"}`,
          [...nextTrace, ...(result.trace ?? [])],
        );
      }
    }

    visited.delete(toolName);
    return ok(undefined, [
      ...trace,
      createTraceEvent(
        "dependency",
        "executor",
        "prerequisites_resolved",
        toolName,
        startAt,
      ),
    ]);
  }

  async function runToolInternal<TInput = unknown, TOutput = unknown>(
    toolName: string,
    input: TInput,
    visited = new Set<string>(),
    trace: ToolTraceEvent[] = [],
    attempt = 1,
    runStartAt = Date.now(),
  ): Promise<ToolResult<TOutput>> {
    const tool = getTool(toolName);
    const startAt = runStartAt;
    if (!tool) {
      return fail("UNKNOWN_TOOL", `未知工具: ${toolName}`, [
        ...trace,
        createTraceEvent("execution", "executor", "missing", toolName, startAt),
      ]);
    }

    const baseTrace = [
      ...trace,
      createTraceEvent(
        "execution",
        "executor",
        attempt === 1 ? "start" : "retrying",
        toolName,
        startAt,
        attempt === 1 ? undefined : `attempt=${attempt}`,
      ),
    ];
    let ctx = options.getContext();
    const isAvailable = getToolAvailabilityCheck(tool);
    const requirements = getToolRequirements(tool);
    if (!isAvailable(ctx) && requirements.length) {
      const dependencyResult = await resolvePrerequisites(
        toolName,
        visited,
        [],
        startAt,
      );
      if (!dependencyResult.success) {
        return dependencyResult as ToolResult<TOutput>;
      }
      ctx = options.getContext();
      baseTrace.push(...dependencyResult.trace);
    }

    ctx = await applyContextHint(toolName, ctx);
    if (!isAvailable(ctx)) {
      const sceneLevel = ctx.sceneLevel ?? "?";
      const mainTab = ctx.mainTab ?? "?";
      const smallTab = ctx.smallTab ?? "?";
      const failure = fail<TOutput>(
        "PRECONDITION_FAILED",
        `前置条件不满足: ${toolName}，当前 sceneLevel=${sceneLevel} mainTab=${mainTab} smallTab=${smallTab}`,
        [
          ...baseTrace,
          createTraceEvent(
            "context",
            "executor",
            "precondition_failed",
            toolName,
            startAt,
            `scene=${sceneLevel},main=${mainTab},small=${smallTab}`,
          ),
        ],
      );
      return finalizeFailure(toolName, input, failure, attempt, startAt);
    }

    const preflight = getToolPreflight(tool);
    if (preflight) {
      const result = await preflight(input, { uiContext: ctx });
      if (result.ok === false) {
        const failure = fail<TOutput>(
          "PRECONDITION_FAILED",
          `执行前校验未通过: ${toolName}，${result.reason}`,
          [
            ...baseTrace,
            createTraceEvent(
              "context",
              "executor",
              "precondition_failed",
              toolName,
              startAt,
              `preflight:${result.reason}`,
            ),
          ],
        );
        return finalizeFailure(toolName, input, failure, attempt, startAt);
      }
    }

    try {
      const invoke = getToolInvoker(tool);
      const executionTarget = getToolExecutionTarget(tool);
      const timeoutMs = getToolTimeoutMs(tool);
      const data = (await runWithTimeout(toolName, timeoutMs, () =>
        invoke(input),
      )) as TOutput;
      const buildHostEffect = getToolHostEffectBuilder(tool);
      const hostEffect =
        executionTarget === "host" && buildHostEffect
          ? buildHostEffect(input, data)
          : undefined;
      const resultMeta: Pick<ToolResult, "executionTarget" | "hostEffect"> =
        executionTarget === "host"
          ? { executionTarget, ...(hostEffect ? { hostEffect } : {}) }
          : {};
      return ok(
        data,
        [
          ...baseTrace,
          createTraceEvent("execution", "executor", "done", toolName, startAt),
        ],
        resultMeta,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const errorCode: AgentToolErrorCode = message.includes("工具执行超时:")
        ? "TOOL_TIMEOUT"
        : "TOOL_RUN_FAILED";
      const failure = fail<TOutput>(
        errorCode,
        message,
        [
          ...baseTrace,
          createTraceEvent(
            "execution",
            "executor",
            "run_failed",
            toolName,
            startAt,
            message,
          ),
        ],
        getToolExecutionTarget(tool) === "host"
          ? { executionTarget: "host" }
          : {},
      );
      return finalizeFailure(toolName, input, failure, attempt, startAt);
    }
  }

  async function finalizeFailure<TInput, TOutput>(
    toolName: string,
    input: TInput,
    result: ToolResult<TOutput>,
    attempt: number,
    startAt: number,
  ): Promise<ToolResult<TOutput>> {
    const tool = getTool(toolName);
    const recovery = tool ? getToolRecovery(tool) : undefined;
    if (
      recovery?.maxRetries &&
      result.errorCode &&
      attempt <= recovery.maxRetries
    ) {
      const retryOn =
        recovery.retryOn ??
        ([
          "PRECONDITION_FAILED",
          "TOOL_RUN_FAILED",
          "TOOL_TIMEOUT",
        ] satisfies AgentToolErrorCode[]);
      if (retryOn.includes(result.errorCode)) {
        const retryTrace = [
          ...result.trace,
          createTraceEvent(
            "execution",
            "executor",
            "retry_scheduled",
            toolName,
            startAt,
            `attempt=${attempt + 1}`,
          ),
        ];
        if (recovery.beforeRetry) {
          await recovery.beforeRetry(input);
          retryTrace.push(
            createTraceEvent(
              "execution",
              "executor",
              "recovery_action",
              toolName,
              startAt,
              "before_retry",
            ),
          );
        }
        return runToolInternal(
          toolName,
          input,
          new Set<string>(),
          retryTrace,
          attempt + 1,
          startAt,
        );
      }
    }

    if (recovery?.rollback && result.errorCode) {
      const rollbackOn =
        recovery.retryOn ??
        ([
          "PRECONDITION_FAILED",
          "TOOL_RUN_FAILED",
          "TOOL_TIMEOUT",
        ] satisfies AgentToolErrorCode[]);
      if (rollbackOn.includes(result.errorCode)) {
        try {
          await recovery.rollback(input);
          result.trace.push(
            createTraceEvent(
              "execution",
              "executor",
              "rollback_applied",
              toolName,
              startAt,
            ),
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          result.trace.push(
            createTraceEvent(
              "execution",
              "executor",
              "rollback_failed",
              toolName,
              startAt,
              message,
            ),
          );
        }
      }
    }

    return result;
  }

  async function runWithTimeout<T>(
    toolName: string,
    timeoutMs: number | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) return run();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`工具执行超时: ${toolName} (${timeoutMs}ms)`));
      }, timeoutMs);
      run()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  return async function runTool<TInput = unknown, TOutput = unknown>(
    toolName: string,
    input: TInput,
  ): Promise<ToolResult<TOutput>> {
    if (options.loadTools) {
      await options.loadTools();
    }
    const result = await runToolInternal<TInput, TOutput>(toolName, input);
    options.onToolComplete?.(toolName, input, result as ToolResult<unknown>);
    return result;
  };
}
