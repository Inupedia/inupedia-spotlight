import { defineAgentTool, type AgentToolDef } from "./defineAgentTool.js";

/** Metadata for IoC-style `@agent({ name })` registration (invoke comes from the decorated function). */
export type AgentCapabilityMeta<TInput extends Record<string, unknown> = Record<string, unknown>> =
  Omit<AgentToolDef<TInput>, "invoke"> & {
    /**
     * Optional guard run before the handler (scene/tab navigation, etc.).
     * Replaces a separate `*Controller.ts` when the only extra work is prepare.
     */
    before?: () => void | Promise<void>;
  };

const AGENT_CAPABILITY = Symbol.for("inupedia.spotlight.agentCapability");

export type AgentCapabilityHandler<TInput extends Record<string, unknown> = Record<string, unknown>> = (
  input: TInput,
) => Promise<unknown>;

export type AgentCapabilityDecorator<TInput extends Record<string, unknown> = Record<string, unknown>> =
  AgentCapabilityHandler<TInput> & {
    [AGENT_CAPABILITY]?: AgentCapabilityMeta<TInput>;
  };

function attachCapabilityMeta<TInput extends Record<string, unknown>>(
  handler: AgentCapabilityHandler<TInput>,
  meta: AgentCapabilityMeta<TInput>,
): AgentCapabilityDecorator<TInput> {
  const tagged = handler as AgentCapabilityDecorator<TInput>;
  tagged[AGENT_CAPABILITY] = meta;
  return tagged;
}

export function getAgentCapabilityMeta<TInput extends Record<string, unknown>>(
  handler: AgentCapabilityHandler<TInput>,
): AgentCapabilityMeta<TInput> | undefined {
  return (handler as AgentCapabilityDecorator<TInput>)[AGENT_CAPABILITY];
}

/** Register a handler against tool metadata (shared by decorator + manual wiring). */
export function registerAgentCapability<TInput extends Record<string, unknown>>(
  meta: AgentCapabilityMeta<TInput>,
  handler: AgentCapabilityHandler<TInput>,
): AgentCapabilityDecorator<TInput> {
  const { before, ...toolMeta } = meta;
  const invoke: AgentCapabilityHandler<TInput> = before
    ? async (input) => {
        await before();
        return handler(input);
      }
    : handler;
  defineAgentTool({ ...toolMeta, invoke });
  return attachCapabilityMeta(handler, meta);
}

type LegacyPropertyDescriptor = PropertyDescriptor & {
  value?: AgentCapabilityHandler;
};

function isLegacyMethodDecoratorArgs(
  args: unknown[],
): args is [object, string | symbol, LegacyPropertyDescriptor] {
  return (
    args.length === 3 &&
    (typeof args[1] === "string" || typeof args[1] === "symbol") &&
    typeof args[2] === "object" &&
    args[2] !== null
  );
}

/**
 * IoC-style agent capability registration.
 *
 * ```ts
 * @agent({ name: "demo.ping", description: "…" })
 * export async function demoPing() {
 *   return { ok: true };
 * }
 *
 * // or HOF (no decorator flag):
 * export const demoPing = agent({ name: "demo.ping", description: "…" })(async () => ({ ok: true }));
 * ```
 *
 * Requires `experimentalDecorators: true` in tsconfig for `@agent` syntax.
 */
export function agent<TInput extends Record<string, unknown> = Record<string, unknown>>(
  meta: AgentCapabilityMeta<TInput>,
) {
  function registerHandler(
    handler: AgentCapabilityHandler<TInput>,
  ): AgentCapabilityDecorator<TInput> {
    return registerAgentCapability(meta, handler);
  }

  function decorator(...args: unknown[]): unknown {
    if (args.length === 1 && typeof args[0] === "function") {
      return registerHandler(args[0] as AgentCapabilityHandler<TInput>);
    }

    if (isLegacyMethodDecoratorArgs(args)) {
      const descriptor = args[2];
      if (typeof descriptor.value === "function") {
        registerHandler(descriptor.value as AgentCapabilityHandler<TInput>);
      }
      return descriptor;
    }

    throw new Error(
      `@agent(${meta.name}) must decorate a function declaration or method`,
    );
  }

  return decorator as AgentCapabilityDecorator<TInput> &
    ((handler: AgentCapabilityHandler<TInput>) => AgentCapabilityDecorator<TInput>);
}

/** Alias for teams preferring `@Agent({ … })` naming. */
export const Agent = agent;

/** Eager-load capability modules (Vite `import.meta.glob` side effects). */
export function loadAgentCapabilities(
  modules: Record<string, unknown>,
  options?: { exclude?: RegExp },
): void {
  const exclude = options?.exclude ?? /\/(_|\.test\.|\.spec\.)/;
  for (const path of Object.keys(modules)) {
    if (exclude.test(path)) continue;
    void modules[path];
  }
}

/** Optional: register exported handlers tagged via HOF `agent(meta)(fn)` without decorators. */
export function registerExportedAgentCapabilities(
  moduleExports: Record<string, unknown>,
): void {
  for (const exported of Object.values(moduleExports)) {
    if (typeof exported !== "function") continue;
    const meta = getAgentCapabilityMeta(
      exported as AgentCapabilityHandler<Record<string, unknown>>,
    );
    if (meta) {
      registerAgentCapability(meta, exported as AgentCapabilityHandler);
    }
  }
}
