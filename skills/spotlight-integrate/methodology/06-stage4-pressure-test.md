# Stage 4 — Pressure test

Canonical format, metrics, and acceptance rules: **[testing.md](../testing.md)**.

This stage produces a gold set even when no live Server/model is available. It must never report dry review as model accuracy.

## Outputs

Always write:

- `.spotlight-integrate/gold-questions.md`
- smoke coverage summary in pipeline state

When a live Server + target LLM is available, also write:

- `.spotlight-integrate/benchmark-results.md`
- Route / Skill / Tool / Argument / E2E / Clarification / Unsafe Execution metrics

## Smoke set

Minimum 8 rows for a simple app and coverage of every actionable Skill. Include:

- each supported intent family (read/list, named-open, mutation, close/navigation as applicable)
- knowledge
- negative/bait collisions
- ambiguous/referential prompts when parameters can be missing
- gated/destructive prompt when such a host capability exists

Use real host catalog strings.

## Dry check

For every row:

- verify the expected Skill owns the intent;
- verify the expected Tool is in that Skill's allowlist;
- verify expected arguments are derivable from user text/context;
- verify ambiguous prompts require clarification rather than guessing;
- verify forbidden/gated prompts cannot be silently redirected to a different Tool.

Rewrite Skill text/tool description when routing would be ambiguous. Do not delete a hard test simply to make the pack look successful.

## Live check

If `:8787` is healthy, run the gold set against the target runtime/model and verify UI/store state deltas for executable rows. Follow [testing.md](../testing.md).

Failures may require Skill text, Tool description/schema, uiContext, or host adapter fixes. Do not patch generic Server code with a product-specific Skill/tool name to make one benchmark pass.

## Stage gate

Stage 5 may continue after static/dry acceptance, but final reporting must explicitly say `LIVE BENCHMARK: NOT RUN` when runtime testing did not occur.
