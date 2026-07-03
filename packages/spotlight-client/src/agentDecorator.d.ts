/**
 * Compile-time decorator shim (registration injected by @inupedia/spotlight-client/vite).
 */
import type { AgentDef } from "./agentDecoratorTypes.js";

declare global {
  // eslint-disable-next-line no-var
  var agent: <TInput extends Record<string, unknown> = Record<string, unknown>>(
    meta: AgentDef<TInput>,
  ) => (
    target: unknown,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => void;
}

export type { AgentDef };
