import type {
  AgentToolErrorCode,
  ToolExecutionTarget,
  ToolTraceEvent,
} from "@inupedia/spotlight-protocol";

export type { ToolTraceEvent };

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: AgentToolErrorCode;
  trace?: ToolTraceEvent[];
  executionTarget?: ToolExecutionTarget;
}
