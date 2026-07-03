/**
 * Generic host-side agent tool registry (registerTool / listTools / schemas).
 */
import type {
  AgentToolErrorCode,
  AgentUiContext,
  HostToolEffect,
  ToolExecutionTarget,
} from "@inupedia/spotlight-protocol";

export type { AgentToolErrorCode, HostToolEffect, ToolExecutionTarget };

export interface ToolContextHint {
  ensureSceneLevel?: number;
  ensureMainTab?: string;
  ensureSmallTab?: string;
}

export type ToolExecutionMode = "serial" | "parallel-safe";

export interface ToolInputSchemaSuccess<TInput> {
  success: true;
  data: TInput;
}

export interface ToolInputSchemaFailure {
  success: false;
  error: string;
}

export type ToolInputSchemaResult<TInput> =
  | ToolInputSchemaSuccess<TInput>
  | ToolInputSchemaFailure;

export interface ToolInputSchema<TInput = unknown> {
  safeParse(input: unknown): ToolInputSchemaResult<TInput>;
  describe?: string;
}

type ToolInputFieldDescriptor = {
  type: "string" | "number" | "boolean";
  enum?: readonly (string | number | boolean)[];
  optional?: boolean;
  description?: string;
};

function buildFieldDescription(
  field: string,
  descriptor: ToolInputFieldDescriptor,
): string {
  const enumText =
    descriptor.enum && descriptor.enum.length > 0
      ? `，可选值：${descriptor.enum.join(" / ")}`
      : "";
  const optionalText = descriptor.optional ? "，可省略" : "";
  const descriptionText = descriptor.description
    ? `，${descriptor.description}`
    : "";
  return `${field}:${descriptor.type}${enumText}${optionalText}${descriptionText}`;
}

export function createToolInputSchema<TInput extends Record<string, unknown>>(
  fields: Record<string, ToolInputFieldDescriptor>,
): ToolInputSchema<TInput> {
  return {
    describe: Object.keys(fields).length
      ? Object.entries(fields)
          .map(([field, descriptor]) =>
            buildFieldDescription(field, descriptor),
          )
          .join("；")
      : "无需参数，传空对象即可",
    safeParse(input: unknown): ToolInputSchemaResult<TInput> {
      const record =
        input == null
          ? {}
          : typeof input === "object" && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : null;
      if (!record) {
        return { success: false, error: "工具入参必须是对象" };
      }

      const next: Record<string, unknown> = {};
      for (const [field, descriptor] of Object.entries(fields)) {
        const value = record[field];
        if (value == null) {
          if (!descriptor.optional) {
            return { success: false, error: `缺少必填参数：${field}` };
          }
          continue;
        }

        if (descriptor.type === "string" && typeof value !== "string") {
          return { success: false, error: `参数 ${field} 必须是字符串` };
        }
        if (descriptor.type === "number" && typeof value !== "number") {
          return { success: false, error: `参数 ${field} 必须是数字` };
        }
        if (descriptor.type === "boolean" && typeof value !== "boolean") {
          return { success: false, error: `参数 ${field} 必须是布尔值` };
        }
        if (
          descriptor.enum &&
          descriptor.enum.length > 0 &&
          !descriptor.enum.includes(value as never)
        ) {
          return {
            success: false,
            error: `参数 ${field} 不在允许范围内：${descriptor.enum.join(" / ")}`,
          };
        }
        next[field] = value;
      }

      return { success: true, data: next as TInput };
    },
  };
}

export function createLooseObjectSchema<
  TInput extends Record<string, unknown> = Record<string, unknown>,
>(description = "无需参数，传空对象即可"): ToolInputSchema<TInput> {
  return {
    describe: description,
    safeParse(input: unknown): ToolInputSchemaResult<TInput> {
      if (input == null) {
        return { success: true, data: {} as TInput };
      }
      if (typeof input === "object" && !Array.isArray(input)) {
        return { success: true, data: input as TInput };
      }
      return { success: false, error: "工具入参必须是对象" };
    },
  };
}

export interface ToolRecoveryConfig<TInput = unknown> {
  maxRetries?: number;
  retryOn?: AgentToolErrorCode[];
  beforeRetry?: (input: TInput) => Promise<void> | void;
  rollback?: (input: TInput) => Promise<void> | void;
}

export interface ToolPreflightContext<
  TContext extends AgentUiContext = AgentUiContext,
> {
  uiContext: TContext;
}

export type ToolPreflightResult =
  | { ok: true }
  | { ok: false; reason: string };

export interface ToolAvailability<
  TInput = unknown,
  TContext extends AgentUiContext = AgentUiContext,
> {
  isAvailable?: (ctx: TContext) => boolean;
  requirements?: string[];
  contextHint?: ToolContextHint;
  preflight?: (
    input: TInput,
    context: ToolPreflightContext<TContext>,
  ) => Promise<ToolPreflightResult> | ToolPreflightResult;
}

export interface ToolExecution<TInput = unknown, TOutput = unknown> {
  invoke: (input: TInput) => Promise<TOutput>;
  summarizeResult?: (result: TOutput) => string;
  executionMode?: ToolExecutionMode;
  executionTarget?: ToolExecutionTarget;
  timeoutMs?: number;
  recovery?: ToolRecoveryConfig<TInput>;
  exposeToLoop?: boolean;
  buildHostEffect?: (
    input: TInput,
    output: TOutput,
  ) => HostToolEffect | undefined;
}

export interface AgentTool<
  TInput = unknown,
  TOutput = unknown,
  TContext extends AgentUiContext = AgentUiContext,
> {
  name: string;
  title?: string;
  displayName?: string;
  description: string;
  category?: string;
  tags?: string[];
  inputSchema?: ToolInputSchema<TInput>;
  isAvailable?: (ctx: TContext) => boolean;
  invoke: (input: TInput) => Promise<TOutput>;
  executionMode?: ToolExecutionMode;
  executionTarget?: ToolExecutionTarget;
  timeoutMs?: number;
  summarizeResult?: (result: TOutput) => string;
  exposeToLoop?: boolean;
  buildHostEffect?: (
    input: TInput,
    output: TOutput,
  ) => HostToolEffect | undefined;
  requires?: string[];
  contextHint?: ToolContextHint;
  preflight?: (
    input: TInput,
    context: ToolPreflightContext<TContext>,
  ) => Promise<ToolPreflightResult> | ToolPreflightResult;
  recovery?: ToolRecoveryConfig<TInput>;
}

type AgentToolLegacyCompat<
  TInput = unknown,
  TOutput = unknown,
  TContext extends AgentUiContext = AgentUiContext,
> = Omit<Partial<AgentTool<TInput, TOutput, TContext>>, "invoke" | "isAvailable"> & {
  availability?: ToolAvailability<TInput, TContext>;
  execution?: ToolExecution<TInput, TOutput>;
  canRun?: (ctx: TContext) => boolean;
  run?: (input: TInput) => Promise<TOutput>;
};

const tools = new Map<string, AgentTool<unknown, unknown>>();

export function registerTool<
  TInput = unknown,
  TOutput = unknown,
  TContext extends AgentUiContext = AgentUiContext,
>(
  tool:
    | AgentTool<TInput, TOutput, TContext>
    | AgentToolLegacyCompat<TInput, TOutput, TContext>,
): void {
  const normalized = normalizeTool(tool);
  tools.set(normalized.name, normalized as AgentTool<unknown, unknown>);
}

export function getTool(name: string): AgentTool<unknown, unknown> | undefined {
  return tools.get(name);
}

export function listTools(): AgentTool<unknown, unknown>[] {
  return Array.from(tools.values());
}

export function listLoopTools(): AgentTool<unknown, unknown>[] {
  return listTools().filter((tool) => getToolExposeToLoop(tool));
}

export function getToolsByPrefix(prefix: string): AgentTool<unknown, unknown>[] {
  return listTools().filter((t) => t.name.startsWith(prefix));
}

export function clearTools(): void {
  tools.clear();
}

export function getToolTitle(tool: AgentTool<unknown, unknown>): string {
  return tool.title ?? tool.displayName ?? tool.name;
}

export function getToolAvailabilityCheck<TInput = unknown>(
  tool: AgentTool<TInput, unknown>,
): (ctx: AgentUiContext) => boolean {
  return tool.isAvailable ?? (() => true);
}

export function getToolRequirements(tool: AgentTool<unknown, unknown>): string[] {
  return tool.requires ?? [];
}

export function getToolContextHint(
  tool: AgentTool<unknown, unknown>,
): ToolContextHint | undefined {
  return tool.contextHint;
}

export function getToolPreflight<TInput = unknown>(
  tool: AgentTool<TInput, unknown>,
) {
  return tool.preflight;
}

export function getToolInvoker<TInput = unknown, TOutput = unknown>(
  tool: AgentTool<TInput, TOutput>,
): (input: TInput) => Promise<TOutput> {
  return tool.invoke;
}

export function getToolExecutionMode(
  tool: AgentTool<unknown, unknown>,
): ToolExecutionMode | undefined {
  return tool.executionMode;
}

export function getToolExecutionTarget(
  tool: AgentTool<unknown, unknown>,
): ToolExecutionTarget {
  return tool.executionTarget ?? "runtime";
}

export function getToolExposeToLoop(tool: AgentTool<unknown, unknown>): boolean {
  return tool.exposeToLoop ?? false;
}

export function getToolTimeoutMs(
  tool: AgentTool<unknown, unknown>,
): number | undefined {
  return tool.timeoutMs;
}

export function getToolRecovery<TInput = unknown>(
  tool: AgentTool<TInput, unknown>,
): ToolRecoveryConfig<TInput> | undefined {
  return tool.recovery;
}

export function getToolResultSummarizer<TOutput = unknown>(
  tool: AgentTool<unknown, TOutput>,
): ((result: TOutput) => string) | undefined {
  return tool.summarizeResult;
}

export function getToolHostEffectBuilder<TInput = unknown, TOutput = unknown>(
  tool: AgentTool<TInput, TOutput>,
) {
  return tool.buildHostEffect;
}

function normalizeTool<
  TInput = unknown,
  TOutput = unknown,
  TContext extends AgentUiContext = AgentUiContext,
>(
  tool:
    | AgentTool<TInput, TOutput, TContext>
    | AgentToolLegacyCompat<TInput, TOutput, TContext>,
): AgentTool<TInput, TOutput, TContext> {
  const legacy = tool as AgentToolLegacyCompat<TInput, TOutput, TContext>;
  const invoke =
    ("invoke" in tool && typeof tool.invoke === "function"
      ? tool.invoke
      : undefined) ??
    legacy.execution?.invoke ??
    legacy.run;
  if (!invoke) {
    throw new Error(`工具 ${tool.name ?? "(unnamed)"} 缺少 invoke 实现`);
  }
  if (!tool.name) {
    throw new Error("工具缺少 name");
  }

  const isAvailable =
    ("isAvailable" in tool && typeof tool.isAvailable === "function"
      ? tool.isAvailable
      : undefined) ??
    legacy.availability?.isAvailable ??
    legacy.canRun;

  return {
    name: tool.name,
    title: tool.title,
    displayName: tool.displayName,
    description: tool.description ?? "",
    category: tool.category,
    tags: tool.tags,
    inputSchema: tool.inputSchema,
    isAvailable,
    invoke,
    executionMode: tool.executionMode ?? legacy.execution?.executionMode,
    executionTarget: tool.executionTarget ?? legacy.execution?.executionTarget,
    timeoutMs: tool.timeoutMs ?? legacy.execution?.timeoutMs,
    summarizeResult: tool.summarizeResult ?? legacy.execution?.summarizeResult,
    exposeToLoop: tool.exposeToLoop ?? legacy.execution?.exposeToLoop,
    buildHostEffect: tool.buildHostEffect ?? legacy.execution?.buildHostEffect,
    requires: tool.requires ?? legacy.availability?.requirements,
    contextHint: tool.contextHint ?? legacy.availability?.contextHint,
    preflight: tool.preflight ?? legacy.availability?.preflight,
    recovery: tool.recovery ?? legacy.execution?.recovery,
  };
}
