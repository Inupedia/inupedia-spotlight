import type { AgentToolErrorCode } from "@inupedia/spotlight-protocol";
import type { ToolFieldSchema } from "./defineAgentTool.js";
import type { ToolExecutionMode } from "./agentRegistry.js";
import type { ToolResult, ToolTraceEvent } from "./agentExecutor.js";
import type { SpotlightHostTool } from "./host.js";

export type SpotlightReadableContext = {
  id?: string;
  description: string;
  value: unknown | (() => unknown);
  available?: boolean | (() => boolean);
  scope?: {
    agentId?: string;
    projectId?: string;
  };
};

export type SpotlightActionContext = {
  signal?: AbortSignal;
  toolName: string;
  toolCallId?: string;
};

export type SpotlightFrontendAction<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> = {
  name: string;
  displayName?: string;
  description: string;
  input?: Record<string, ToolFieldSchema>;
  handler: (
    input: TInput,
    context: SpotlightActionContext,
  ) => Promise<unknown> | unknown;
  available?: boolean | (() => boolean);
  exposeToLoop?: boolean;
  executionMode?: ToolExecutionMode;
};

export type SpotlightHostCoreSubscriber = (
  event: SpotlightHostCoreEvent,
) => void;

export type SpotlightHostCoreEvent =
  | { type: "action:registered"; action: SpotlightFrontendAction }
  | { type: "action:unregistered"; name: string }
  | { type: "readable:registered"; readable: SpotlightReadableContext }
  | { type: "readable:unregistered"; id: string };

export type SpotlightHostCoreOptions = {
  actions?: SpotlightFrontendAction[];
  readables?: SpotlightReadableContext[];
  onToolComplete?: (
    toolName: string,
    input: unknown,
    result: ToolResult<unknown>,
  ) => void;
};

export type SpotlightHostCore = {
  registerAction(action: SpotlightFrontendAction): () => void;
  registerReadable(readable: SpotlightReadableContext): () => void;
  listTools(): SpotlightHostTool[];
  runTool(
    name: string,
    input: Record<string, unknown>,
    context?: Partial<SpotlightActionContext>,
  ): Promise<ToolResult<unknown>>;
  getUiContext(): Record<string, unknown>;
  subscribe(subscriber: SpotlightHostCoreSubscriber): () => void;
};

type StoredReadable = SpotlightReadableContext & {
  key: string;
};

function nowTrace(
  tool: string,
  type: ToolTraceEvent["type"],
  detail?: string,
): ToolTraceEvent {
  return {
    phase: "execution",
    source: "spotlight_action",
    type,
    tool,
    detail,
    at: Date.now(),
    elapsedMs: 0,
  };
}

function ok<T>(toolName: string, data: T): ToolResult<T> {
  return {
    success: true,
    data,
    executionTarget: "host",
    trace: [nowTrace(toolName, "done")],
  };
}

function fail(
  toolName: string,
  errorCode: AgentToolErrorCode,
  error: string,
): ToolResult<unknown> {
  return {
    success: false,
    errorCode,
    error,
    executionTarget: "host",
    trace: [nowTrace(toolName, "run_failed", error)],
  };
}

function isEnabled(entry: {
  available?: boolean | (() => boolean);
}): boolean {
  if (entry.available === undefined) return true;
  return typeof entry.available === "function"
    ? entry.available()
    : entry.available;
}

function readableKey(readable: SpotlightReadableContext): string {
  return readable.id?.trim() || readable.description;
}

export function createSpotlightHostCore(
  options: SpotlightHostCoreOptions = {},
): SpotlightHostCore {
  const actions = new Map<string, SpotlightFrontendAction>();
  const readables = new Map<string, StoredReadable>();
  const subscribers = new Set<SpotlightHostCoreSubscriber>();

  const emit = (event: SpotlightHostCoreEvent): void => {
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  };

  const core: SpotlightHostCore = {
    registerAction(action) {
      actions.set(action.name, action);
      emit({ type: "action:registered", action });
      return () => {
        if (actions.get(action.name) !== action) return;
        actions.delete(action.name);
        emit({ type: "action:unregistered", name: action.name });
      };
    },
    registerReadable(readable) {
      const key = readableKey(readable);
      readables.set(key, { ...readable, key });
      emit({ type: "readable:registered", readable });
      return () => {
        const current = readables.get(key);
        if (!current || current.description !== readable.description) return;
        readables.delete(key);
        emit({ type: "readable:unregistered", id: key });
      };
    },
    listTools() {
      return Array.from(actions.values())
        .filter(isEnabled)
        .map((action) => ({
          name: action.name,
          displayName: action.displayName,
          description: action.description,
          handler: async ({ input, call }) => {
            const result = await core.runTool(action.name, input, {
              toolCallId: call.id,
            });
            if (!result.success) {
              throw new Error(result.error ?? `Host action failed: ${action.name}`);
            }
            return result.data;
          },
        }));
    },
    async runTool(name, input, context = {}) {
      const action = actions.get(name);
      if (!action) {
        const result = fail(name, "UNKNOWN_TOOL", `未知 Host action: ${name}`);
        options.onToolComplete?.(name, input, result);
        return result;
      }
      if (!isEnabled(action)) {
        const result = fail(
          name,
          "PRECONDITION_FAILED",
          `Host action 不可用: ${name}`,
        );
        options.onToolComplete?.(name, input, result);
        return result;
      }
      try {
        const data = await action.handler(input, {
          ...context,
          toolName: name,
        });
        const result = ok(name, data);
        options.onToolComplete?.(name, input, result);
        return result;
      } catch (error) {
        const result = fail(
          name,
          "TOOL_RUN_FAILED",
          error instanceof Error ? error.message : String(error),
        );
        options.onToolComplete?.(name, input, result);
        return result;
      }
    },
    getUiContext() {
      const context: Record<string, unknown> = {};
      for (const readable of readables.values()) {
        if (!isEnabled(readable)) continue;
        context[readable.key] =
          typeof readable.value === "function"
            ? (readable.value as () => unknown)()
            : readable.value;
      }
      return context;
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  };

  for (const readable of options.readables ?? []) {
    core.registerReadable(readable);
  }
  for (const action of options.actions ?? []) {
    core.registerAction(action);
  }

  return core;
}
