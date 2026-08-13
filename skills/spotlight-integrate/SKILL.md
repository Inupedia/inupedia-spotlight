---
name: spotlight-integrate
description: Agentizes an existing Vue frontend with Inupedia Spotlight by discovering real host capabilities, classifying readiness/risk, wrapping verified capabilities as Client Tools, generating Agent Skills, wiring the runtime, and leaving measurable acceptance tests. Use when the user asks to 接入 Spotlight, install Spotlight, integrate Spotlight SDK, generate Spotlight tools/skills from an existing app, or convert a finished frontend into an Agent-ready Spotlight project.
---

# Spotlight Integrate

Turn **this** host app into a Spotlight adapter. Do not copy another product's tools, domains, catalog strings, or business behavior.

If a behavior does not exist in the host repo, it is not a Client Tool.

## Read first (mandatory)

1. [architecture.md](architecture.md) — Agentization boundary, capability classes, safety, quality metrics
2. [standard.md](standard.md) — compatibility, install, layout, env, boot
3. [testing.md](testing.md) — smoke/gold tests, live accuracy, acceptance metrics
4. Then the pipeline files below

Pin all published `@inupedia/spotlight-*` packages to the **same registry version** unless the user pinned a compatible release. Verify the target package peer dependencies before changing the host lockfile.

## Pipeline (strict order)

Resume from `.spotlight-integrate/PIPELINE_STATE.md` if present. Template: [methodology/00-pipeline-state.md](methodology/00-pipeline-state.md).

| Stage | Spec | Output |
|---|---|---|
| 0 | [methodology/01-stage0-overview.md](methodology/01-stage0-overview.md) | `FRONTEND_OVERVIEW.md`, `COMPATIBILITY.md` |
| 1 | [methodology/02-stage1-extract.md](methodology/02-stage1-extract.md) | `candidates/*` |
| 1.5 | [methodology/03-stage1.5-verify.md](methodology/03-stage1.5-verify.md) | `verified.md`, `leftovers.md`, `rejected/` |
| 2 | [methodology/04-stage2-tools.md](methodology/04-stage2-tools.md) | `src/spotlight/tools.ts` |
| 3 | [methodology/05-stage3-skills.md](methodology/05-stage3-skills.md) | `.inupedia/skills/**/SKILL.md` |
| 4 | [methodology/06-stage4-pressure-test.md](methodology/06-stage4-pressure-test.md) | `gold-questions.md`, benchmark plan/results |
| 5 | [methodology/07-stage5-wire.md](methodology/07-stage5-wire.md) | config, Vite, project pack — paths per [standard.md](standard.md) |
| 6 | [methodology/08-stage6-report.md](methodology/08-stage6-report.md) | `INTEGRATION_REPORT.md` |

Extractors: [extractors/](extractors/). File snippets: [templates.md](templates.md). Shape-only example: [examples.md](examples.md). Human install + paste-to-LLM: [README.md](README.md) / [prompt.sh](prompt.sh).

## Hard rules

1. **Host is the source of truth.** Client Tools call existing Store / Service / Router / page-engine capabilities; wrappers do not reimplement business logic.
2. **No invented behavior.** Do not create new players, maps, checkout APIs, calculations, or HTTP endpoints just to satisfy a spoken request.
3. **Page engines stay in the browser** (maps, video, canvas, Pinia, Vue Router). Server gets providers via `spotlight-project/` only.
4. **No custom Agent** in the host app.
5. **Skills do not grant capabilities.** `allowed-tools` ⊆ exported Client Tool names.
6. **Generic Server, product-specific Skills.** Never require a Server hardcode for a host Skill id, catalog, or tool name.
7. **Intent families must be explicit.** Distinguish list/read, named open/view, mutation, close, knowledge, and clarify behavior when those families exist.
8. **Gated actions default-deny.** Delete, pay, transfer, submit-order, logout, reset/wipe, or irreversible external commits are not auto-exposed.
9. **Vite plugin:** JSDoc immediately above `defineClientTool`; inferable types or explicit `schema`.
10. **Always** emit `skill.knowledge` (`direct_answer`, no client tools).
11. **Layout** must match [standard.md](standard.md). Do not invent a second `projectId` or tools entrypoint.
12. **Do not claim runtime accuracy without a live run.** Static/dry checks are readiness only.

## Compatibility behavior

- Vue 3 + Vite + compatible Spotlight peers → continue automatically.
- Vue 3 + Vite with incompatible Vue/Pinia/Node peers → write `COMPATIBILITY.md`; do not force-upgrade unless the user requested dependency upgrades.
- Vue 3 without Vite → analyze/classify capabilities, then stop before build-system migration unless explicitly requested.
- Vue 2 / non-Vue → produce the readiness report; do not pretend the current automated wiring path supports it.
- Zero verified tools → knowledge-only integration is valid; report all leftovers.

## Refactor behavior

A real user-facing capability trapped in component-local code is `REFACTOR`, not fake and not automatically rejected. Extract it only when the change is behavior-preserving and the user asked for a full integration/refactor. Otherwise leave it in `leftovers.md` with the exact source location.

## Autonomy / confirmation

If the user said “integrate fully”, “agentize this app”, or equivalent, run the safe pipeline end-to-end without pausing after each stage. Pause only for:

- build-system/framework migration;
- dependency upgrades outside declared compatible ranges;
- exposing a `GATED` capability;
- an ambiguity that would materially change product behavior.

Otherwise report intermediate WRAP / REFACTOR / GATED / REJECT classifications briefly before wiring.

## Final handoff

Do not finish with only a file list. Report:

- compatibility status;
- capability coverage by `DIRECT / REFACTOR / GATED / REJECT`;
- wrapped Tool + Skill count;
- static integrity status;
- live benchmark metrics if actually run;
- unverified runtime items and exact blockers;
- env keys + boot order;
- remaining refactors/gated actions.
