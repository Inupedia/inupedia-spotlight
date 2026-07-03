import type { SpotlightContext } from "../store/pipeline/types.js";
import type { OperateToolCall, OperateWorkflowDefinition } from "./operate.js";

export type OperateActionBinding = {
  tool: string;
  resolveCalls?: (
    ctx: SpotlightContext,
  ) => OperateToolCall[] | { error: string };
};

export type CreateOperateDefinitionOptions = {
  /** action → tool name, or extended binding with custom resolveCalls */
  actions: Record<string, string | OperateActionBinding>;
  syncSummaryActions?: ReadonlySet<string>;
  syncSummaryLine?: (action: string) => string;
  validateBeforeRun?: OperateWorkflowDefinition["validateBeforeRun"];
  verifyAfterTools?: OperateWorkflowDefinition["verifyAfterTools"];
  successMessage: OperateWorkflowDefinition["successMessage"];
  resumableAction?: OperateWorkflowDefinition["resumableAction"];
  unknownActionMessage?: string;
};

function resolveBinding(
  binding: string | OperateActionBinding,
): OperateActionBinding {
  return typeof binding === "string" ? { tool: binding } : binding;
}

/** Declarative operate domain: action → host tool map + optional hooks. */
export function createOperateDefinition(
  options: CreateOperateDefinitionOptions,
): OperateWorkflowDefinition {
  const actionMap = new Map(
    Object.entries(options.actions).map(([action, binding]) => [
      action,
      resolveBinding(binding),
    ]),
  );

  return {
    syncSummaryActions: options.syncSummaryActions,
    syncSummaryLine: options.syncSummaryLine,
    validateBeforeRun: options.validateBeforeRun,
    verifyAfterTools: options.verifyAfterTools,
    successMessage: options.successMessage,
    resumableAction: options.resumableAction,
    unknownActionMessage: options.unknownActionMessage,
    resolveToolCalls(ctx) {
      const action = ctx.command?.action;
      if (!action) return { error: "操作命令缺失。" };

      const binding = actionMap.get(action);
      if (!binding) {
        return {
          error: options.unknownActionMessage ?? "当前操作动作暂未实现。",
        };
      }

      if (binding.resolveCalls) {
        return binding.resolveCalls(ctx);
      }

      return [{ name: binding.tool, input: {} }];
    },
  };
}
