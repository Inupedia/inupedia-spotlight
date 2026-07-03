/**
 * Minimal @agent meta — scene/host/tab resolved at compile time via resolveAgentMeta(filePath).
 */
import type { AgentCapabilityMeta } from "./agentCapability.js";
import type { HostEffectConfig, ToolFieldSchema } from "./defineAgentTool.js";

export type AgentDef<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> = {
  name: string;
  description: string;
  displayName?: string;
  tab?: string;
  scene?: "construction" | "onsite";
  host?: Partial<HostEffectConfig<TInput>>;
  input?: Record<string, ToolFieldSchema>;
  rollback?: () => void | Promise<void>;
  recovery?: AgentCapabilityMeta<TInput>["recovery"];
  exposeToLoop?: boolean;
  executionMode?: "serial" | "parallel-safe";
  executionTarget?: "host" | "runtime";
  summarizeResult?: AgentCapabilityMeta<TInput>["summarizeResult"];
  requires?: string[];
  withSmallTabPayload?: boolean;
  navScene?: 0 | 1 | 2;
  mainTab?: string;
  smallTab?: string;
};
