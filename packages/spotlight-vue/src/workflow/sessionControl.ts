import type { RemoteHostToolCall, ToolTraceEvent } from "@inupedia/spotlight-protocol";
import {
  SpotlightCommandDomain,
  SpotlightCommandScope,
  SpotlightIntent,
  type SpotlightCommandTarget,
} from "../store/types.js";
import { SPOTLIGHT_PIPELINE_STEP_IDS } from "../store/pipeline/constants.js";
import type { HandlerApi, SpotlightContext } from "../store/pipeline/types.js";
import { useAgentSessionStore } from "../session/agentSession.js";
import { buildCommonWorkflowSteps } from "./shared.js";

export type SessionControlWorkflowHooks = {
  /** Return true when the action was handled. */
  continueActiveTask?: (
    ctx: SpotlightContext,
    api: HandlerApi,
  ) => Promise<boolean>;
  stopActiveTask?: (
    ctx: SpotlightContext,
    api: HandlerApi,
  ) => Promise<boolean>;
};

export type ExecuteOperateWorkflow = (
  ctx: SpotlightContext,
  api: HandlerApi,
) => Promise<void>;

/** Host extension factory: receives SDK operate executor wired from `operate` config. */
export type SessionControlHooksFactory = (
  executeOperate: ExecuteOperateWorkflow,
) => SessionControlWorkflowHooks;

/** Build an operate-domain context for session continue/stop delegation. */
export function buildOperateCommandContext(
  ctx: SpotlightContext,
  params: {
    action: string;
    target?: SpotlightCommandTarget;
    reason: string;
    requiresContext?: boolean;
  },
): SpotlightContext {
  return {
    ...ctx,
    command: {
      domain: SpotlightCommandDomain.Operate,
      action: params.action,
      target: params.target,
      scope: SpotlightCommandScope.CurrentContext,
      requiresContext: params.requiresContext ?? true,
      reason: params.reason,
    },
  };
}

export function buildSessionControlWorkflowSteps() {
  return buildCommonWorkflowSteps();
}

export function buildRepeatLastAnswerContext(
  userQuestion: string,
): SpotlightContext {
  return {
    userQuestion,
    breakdown: userQuestion,
    intentRes: {
      intent: SpotlightIntent.Other,
      reason: "由 Spotlight 触发的会话控制动作。",
    },
    intent: SpotlightIntent.Other,
    rawSubIntent: undefined,
    intentLabel: "会话控制",
    command: {
      domain: SpotlightCommandDomain.SessionControl,
      action: "repeat_last_answer",
      scope: SpotlightCommandScope.CurrentContext,
      requiresContext: false,
      reason: "重复上一条助手回复。",
    },
    sessionControlIntent: null,
  };
}

export function createSessionControlExecutor(
  hooks?: SessionControlWorkflowHooks,
) {
  return async function executeSessionControlWorkflowContext(
    ctx: SpotlightContext,
    api: HandlerApi,
  ): Promise<void> {
    const command = ctx.command;
    const session = useAgentSessionStore();

    if (!command) {
      api.setStep(
        SPOTLIGHT_PIPELINE_STEP_IDS.tool,
        "error",
        "会话控制命令缺失。",
      );
      api.setError("会话控制命令缺失。");
      return;
    }

    api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "active", "");
    await api.streamToolSummary({
      intentLabel: "统一会话控制命令",
      subLabel: command.action,
      stepId: SPOTLIGHT_PIPELINE_STEP_IDS.tool,
      kind: "tool",
    });

    if (command.action === "repeat_last_answer") {
      const lastAnswer = session.getLastAssistantContent();
      const content = lastAnswer ?? "上一条回复还没有内容可重复。";
      api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "done", content);
      api.setResult(
        JSON.stringify(
          { domain: command.domain, action: command.action, content },
          null,
          2,
        ),
      );
      return;
    }

    if (command.action === "continue_active_task") {
      if (await hooks?.continueActiveTask?.(ctx, api)) return;
      const content = "当前没有可继续的动作，请先明确说明要继续什么。";
      api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "error", content);
      api.setError(content);
      return;
    }

    if (command.action === "stop_active_task") {
      if (await hooks?.stopActiveTask?.(ctx, api)) return;
      const content = "当前没有可停止的动作，请先明确说明要停止什么。";
      api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "error", content);
      api.setError(content);
      return;
    }

    api.setStep(
      SPOTLIGHT_PIPELINE_STEP_IDS.tool,
      "error",
      "当前会话控制动作暂未实现。",
    );
    api.setError("当前会话控制动作暂未实现。");
  };
}

function getStepContent(sink: HandlerApi, stepId: string): string {
  return (
    sink
      .getSteps()
      .find((step) => step.id === stepId)
      ?.content?.trim() ?? ""
  );
}

export function createRunSessionHostTool(
  executeSessionControl: (
    ctx: SpotlightContext,
    api: HandlerApi,
  ) => Promise<void>,
) {
  return async function runSessionHostTool(
    call: RemoteHostToolCall,
    api: HandlerApi,
  ) {
    await executeSessionControl(
      buildRepeatLastAnswerContext(
        typeof call.input?.question === "string" ? call.input.question : "",
      ),
      api,
    );
    const summary =
      getStepContent(api, SPOTLIGHT_PIPELINE_STEP_IDS.tool) ||
      "已重复上一条回复。";
    return {
      success: true as const,
      data: { summary },
      trace: [] as ToolTraceEvent[],
      executionTarget: "host" as const,
    };
  };
}
