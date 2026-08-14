# Stage 2 — Generate Client Tools

Input: `verified.md`. Output: one Client Tool module parsed by the Spotlight Vite plugin.

Default path is `src/spotlight/tools.ts`. If the host already has `defineClientTool`, extend the existing module and registry instead of creating a second entrypoint.

## Wrapper law

```ts
/** <one sentence describing the user-visible host capability> */
export const toolName = defineClientTool(
  async (input): Promise<Out> => existingHostFunction(mapInput(input)),
  {
    sideEffect: "ui",
    replayPolicy: "never",
    riskLevel: "low",
  },
);
```

The handler is an adapter, not a new business implementation.

## Required metadata

Set metadata from verified host semantics:

| Capability | sideEffect | replayPolicy | riskLevel |
|---|---|---|---|
| read/list/status only | `none` | `safe` | usually `low` |
| open/view/navigation | `ui` | usually `never` | usually `low` |
| reversible mutation | `ui` or `external` | `never` or host-backed idempotency | usually `medium` |
| destructive/irreversible/external commit | `GATED` in stage 1.5 | do not auto-wrap | high |

Do not rely on default metadata when the Tool is a mutation.

## Tool shape rules

- name = exported const name, camelCase, verb-first (`getX`, `openX`, `addX`, `updateX`, `removeX`, `navigateToX`)
- JSDoc immediately above `defineClientTool`; the Vite plugin uses it as Tool description
- inline typed handler so the plugin can infer parameters
- zero args: `async (): Promise<...>`
- object input: `async ({ name }: { name: string })`
- enum/union that cannot be inferred safely -> explicit `schema.input`
- no `any`
- return only the useful host result/state summary; avoid dumping entire stores or huge payloads

## Input semantics

Inputs should reflect what users and host code actually understand:

- named-open -> host catalog `name/id/alias`
- mutation -> exact quantity/value/id validated by the host
- route/tab/mode -> literal values from host Router/Store

Reuse existing host resolver/validation functions. Do not recreate alias lookup or business validation in `tools.ts`.

## Refactor boundary

If stage 1.5 promoted a `REFACTOR` capability, extract the existing component behavior into a narrow host function first, then make both:

1. the original UI handler call that extracted host function;
2. the Client Tool call the same extracted host function.

That preserves one source of truth.

## Array/registry

Keep the registry mechanically aligned:

```ts
export const spotlightTools = [getItemList, openItem, updateItem];
```

Every Skill tool must be registered; no extra “hidden” generic executor.

## Forbidden

- `eval` / dynamic method dispatch / arbitrary store invocation
- new HTTP endpoint or API call the host did not already use
- DOM selector/click automation when a stable host capability exists
- sleep/retry loops that change business semantics
- importing page-engine internals solely to bypass the host's own adapter
- auto-wrapping `GATED` capabilities

See [templates.md](../templates.md) for shape-only examples.
