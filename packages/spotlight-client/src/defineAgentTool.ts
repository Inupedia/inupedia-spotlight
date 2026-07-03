import type { AgentUiContext } from "@inupedia/spotlight-protocol";
import {
  createLooseObjectSchema,
  createToolInputSchema,
  registerTool,
  type AgentTool,
  type ToolContextHint,
  type ToolInputSchema,
} from "./agentRegistry.js";

export type ToolFieldSchema = {
  type: "string" | "number" | "boolean";
  enum?: readonly (string | number | boolean)[];
  optional?: boolean;
  description?: string;
};

export type HostEffectConfig<TInput = unknown> = {
  type: string;
  target?: string | ((input: TInput) => string | undefined);
  payload?: Record<string, unknown> | ((input: TInput) => Record<string, unknown>);
};

/**
 * Declarative tool registration for consumer `service` modules.
 * Spotlight only executes; domain context / availability are supplied by the app.
 */
export type AgentToolDef<TInput = Record<string, unknown>> = {
  name: string;
  displayName?: string;
  description: string;
  input?: Record<string, ToolFieldSchema>;
  invoke: (input: TInput) => Promise<unknown>;
  host?: HostEffectConfig<TInput>;
  contextHint?: ToolContextHint;
  isAvailable?: (ctx: AgentUiContext) => boolean;
  requires?: string[];
  exposeToLoop?: boolean;
  executionMode?: "serial" | "parallel-safe";
  recovery?: AgentTool<TInput, unknown>["recovery"];
  summarizeResult?: AgentTool<TInput, unknown>["summarizeResult"];
  runtimeOnly?: boolean;
  executionTarget?: "host" | "runtime";
};

export function hostEffect<TInput = unknown>(
  config: HostEffectConfig<TInput>,
): Pick<AgentTool<TInput, unknown>, "executionTarget" | "buildHostEffect"> {
  return {
    executionTarget: "host",
    buildHostEffect: (input: TInput) => {
      const target =
        typeof config.target === "function"
          ? config.target(input)
          : config.target;
      const payload =
        typeof config.payload === "function"
          ? config.payload(input)
          : config.payload;
      return {
        type: config.type,
        ...(target ? { target } : {}),
        ...(payload ? { payload } : {}),
      };
    },
  };
}

function resolveInputSchema<TInput extends Record<string, unknown>>(
  input?: Record<string, ToolFieldSchema>,
): ToolInputSchema<TInput> {
  if (!input || Object.keys(input).length === 0) {
    return createLooseObjectSchema<TInput>();
  }
  return createToolInputSchema<TInput>(input);
}

export function defineAgentTool<TInput extends Record<string, unknown> = Record<string, unknown>>(
  def: AgentToolDef<TInput>,
): void {
  const tool: AgentTool<TInput, unknown> = {
    name: def.name,
    displayName: def.displayName,
    description: def.description,
    inputSchema: resolveInputSchema<TInput>(def.input),
    invoke: def.invoke,
    executionMode: def.executionMode ?? "serial",
    requires: def.requires,
    exposeToLoop: def.exposeToLoop ?? false,
    contextHint: def.contextHint,
    isAvailable: def.isAvailable,
    recovery: def.recovery,
    summarizeResult: def.summarizeResult,
    ...(def.host
      ? hostEffect<TInput>(def.host)
      : def.executionTarget
        ? { executionTarget: def.executionTarget }
        : {}),
    ...(def.runtimeOnly ? { executionTarget: "runtime" as const } : {}),
  };
  registerTool(tool);
}
