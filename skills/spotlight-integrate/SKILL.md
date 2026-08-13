---
name: spotlight-integrate
description: Integrates Inupedia Spotlight into an existing Vue/Vite frontend by distilling the live UI into Client Tools and Agent Skills. Use when the user asks to 接入 Spotlight, install Spotlight, integrate Spotlight SDK, generate Spotlight tools/skills from an existing app, or convert a finished frontend into a Spotlight project.
---

# Spotlight Integrate

Distill **this** host app into a Spotlight integration. Follow the standard layout and tests; do not copy another product’s tools or names.

If a function is not exported in this repo, it is not a Client Tool.

## Read first (mandatory)

1. [standard.md](standard.md) — install this skill, host directory tree, env, boot
2. [testing.md](testing.md) — gold questions, static checks, list-vs-open contract
3. Then the pipeline files below

Pin `@inupedia/spotlight-*` to one version: `npm view @inupedia/spotlight-vue version`, unless the user pinned it.

## Pipeline (strict order)

Resume from `.spotlight-integrate/PIPELINE_STATE.md` if present. Template: [methodology/00-pipeline-state.md](methodology/00-pipeline-state.md).

| Stage | Spec | Output |
|---|---|---|
| 0 | [methodology/01-stage0-overview.md](methodology/01-stage0-overview.md) | `FRONTEND_OVERVIEW.md` |
| 1 | [methodology/02-stage1-extract.md](methodology/02-stage1-extract.md) | `candidates/*` |
| 1.5 | [methodology/03-stage1.5-verify.md](methodology/03-stage1.5-verify.md) | `verified.md`, `rejected/` |
| 2 | [methodology/04-stage2-tools.md](methodology/04-stage2-tools.md) | `src/spotlight/tools.ts` |
| 3 | [methodology/05-stage3-skills.md](methodology/05-stage3-skills.md) | `.inupedia/skills/**/SKILL.md` |
| 4 | [methodology/06-stage4-pressure-test.md](methodology/06-stage4-pressure-test.md) | `gold-questions.md` per [testing.md](testing.md) |
| 5 | [methodology/07-stage5-wire.md](methodology/07-stage5-wire.md) | config, Vite, pack — paths per [standard.md](standard.md) |

Extractors: [extractors/](extractors/). File snippets: [templates.md](templates.md). Shape-only example: [examples.md](examples.md). Human install + paste-to-LLM: [README.md](README.md) / [prompt.sh](prompt.sh).

## Hard rules

1. **No invented behavior.** Wrappers only. Do not implement new players, maps, or HTTP APIs.
2. **Page engines stay in the browser** (maps, video, canvas, Pinia, Vue Router). Server gets providers via `spotlight-project/` only.
3. **No custom Agent** in the host app.
4. **Skills do not grant tools.** `allowed-tools` ⊆ exported Client Tool names.
5. **List ≠ open.** See [testing.md](testing.md) contract. Skill body must distinguish them when both tools exist.
6. **Destructive default-deny** (delete, pay, logout, submit, wipe) unless the user allowlists.
7. **Vite plugin:** JSDoc immediately above `defineClientTool`; inferable types or explicit `schema`.
8. **Always** emit `skill.knowledge` (`direct_answer`, no client tools).
9. **Layout** must match [standard.md](standard.md). Do not invent a second `projectId` or tools entrypoint.

## Stop

- Not Vue 3 + Vite → stop.
- Zero verified tools → still knowledge skill + wiring; explain leftovers.
- Speakable intent but no symbol → `rejected/`, never a fake Tool.

## User confirmations

- After 0: domains found; proceed all or drop some?
- After 1.5: wrap N, reject M?
- After 5: files, env, boot order from standard.md, gold prompts from testing.md
