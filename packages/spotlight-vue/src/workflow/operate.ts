import { SpotlightCommandDomain } from "../store/types.js";
import { SPOTLIGHT_PIPELINE_STEP_IDS } from "../store/pipeline/constants.js";
import { formatToolFailure } from "../store/pipeline/errors.js";
import type { HandlerApi, SpotlightContext } from "../store/pipeline/types.js";
import { useSpotlightRuntimeStore } from "../store/runtimeStore.js";
import { runHostTool } from "./runHostTool.js";
import { buildCommonWorkflowSteps } from "./shared.js";

export type OperateToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type OperateWorkflowDefinition = {
  syncSummaryActions?: ReadonlySet<string>;
  syncSummaryLine?: (action: string) => string;
  validateBeforeRun?: (
    ctx: SpotlightContext,
  ) => Promise<string | null> | string | null;
  resolveToolCalls: (
    ctx: SpotlightContext,
  ) =>
    | Promise<OperateToolCall[] | { error: string }>
    | OperateToolCall[]
    | { error: string };
  verifyAfterTools?: (
    ctx: SpotlightContext,
  ) => Promise<string | null> | string | null;
  successMessage: (ctx: SpotlightContext) => string;
  resumableAction?: (ctx: SpotlightContext) => string | null;
  unknownActionMessage?: string;
};

function setToolStepLabel(
  api: Pick<HandlerApi, "getSteps" | "setSteps">,
  label: string,
) {
  const nextSteps = api
    .getSteps()
    .map((step) =>
      step.id === SPOTLIGHT_PIPELINE_STEP_IDS.tool ? { ...step, label } : step,
    );
  api.setSteps(nextSteps);
}

export function buildOperateWorkflowSteps() {
  return buildCommonWorkflowSteps();
}

export function isOperateWorkflowContext(ctx: SpotlightContext): boolean {
  return ctx.command?.domain === SpotlightCommandDomain.Operate;
}

export function createOperateExecutor(definition: OperateWorkflowDefinition) {
  return async function executeOperateWorkflowContext(
    ctx: SpotlightContext,
    api: HandlerApi,
  ): Promise<void> {
    const command = ctx.command;
    if (!command) {
      setToolStepLabel(api, "执行失败");
      api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "error", "操作命令缺失。");
      api.setError("操作命令缺失。");
      return;
    }

    setToolStepLabel(api, "执行操作");
    api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "active", "");

    const syncActions = definition.syncSummaryActions;
    if (syncActions?.has(command.action)) {
      if (command.requiresContext) {
        const error = await definition.validateBeforeRun?.(ctx);
        if (error) {
          setToolStepLabel(api, "执行失败");
          api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "error", error);
          api.setError(error);
          return;
        }
      }
      api.setStep(
        SPOTLIGHT_PIPELINE_STEP_IDS.tool,
        "active",
        definition.syncSummaryLine?.(command.action) ?? "",
      );
    } else {
      await api.streamToolSummary({
        intentLabel: "统一操作命令",
        subLabel: command.action,
        stepId: SPOTLIGHT_PIPELINE_STEP_IDS.tool,
        kind: "tool",
      });
    }

    const resolved = await definition.resolveToolCalls(ctx);
    if ("error" in resolved) {
      setToolStepLabel(api, "执行失败");
      api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "error", resolved.error);
      api.setError(resolved.error);
      return;
    }

    if (!resolved.length) {
      const message =
        definition.unknownActionMessage ?? "当前操作动作暂未实现。";
      setToolStepLabel(api, "执行失败");
      api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "error", message);
      api.setError(message);
      return;
    }

    for (const call of resolved) {
      const result = await runHostTool(call.name, call.input);
      if (!result.success) {
        const message = formatToolFailure(result);
        setToolStepLabel(api, "执行失败");
        api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "error", message);
        api.setError(message);
        return;
      }
    }

    const verifyError = await definition.verifyAfterTools?.(ctx);
    if (verifyError) {
      setToolStepLabel(api, "执行失败");
      api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "error", verifyError);
      api.setError(verifyError);
      return;
    }

    const runtime = useSpotlightRuntimeStore();
    runtime.setActiveCommand({
      domain: SpotlightCommandDomain.Operate,
      action: command.action,
      target: command.target,
      resumableAction: definition.resumableAction?.(ctx) ?? null,
    });

    const message = definition.successMessage(ctx);
    setToolStepLabel(api, "执行完成");
    api.setStep(SPOTLIGHT_PIPELINE_STEP_IDS.tool, "done", message);
    api.setResult(
      JSON.stringify(
        {
          domain: command.domain,
          action: command.action,
          target: command.target ?? null,
          videoChannelId: command.videoChannelId ?? null,
          message,
        },
        null,
        2,
      ),
    );
  };
}
