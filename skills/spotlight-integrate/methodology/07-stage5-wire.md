# Stage 5 — Wire SDK, Vue, Project Pack

Only after verified Tools + Skills + gold questions exist, and only when compatibility status permits wiring. Layout/packages/env/boot: [standard.md](../standard.md). Snippets: [templates.md](../templates.md). Checks: [testing.md](../testing.md).

## Packages

Use the **existing host package manager** and the exact published `<ver>` verified in stage 0. Do not create a second lockfile and do not use force/legacy-peer-deps to hide peer mismatches.

Examples are in [standard.md](../standard.md) §5.

All published `@inupedia/spotlight-*` packages must use the same compatible `<ver>`. Treat the Server image tag as independently verifiable deployment input; if the matching image cannot be verified, report it instead of claiming runtime readiness.

## Vite

Add `spotlightClientTools`; `include` must match the actual tools file path (`/src/spotlight/tools.ts` or the existing tools entrypoint).

Set one `projectId` and `frontendBuildId`. If the app has a custom base/proxy setup, preserve it and make `VITE_SPOTLIGHT_SERVER_URL` consistent.

Do not migrate a non-Vite host here unless build migration was explicitly approved.

## Vue

- import `@inupedia/spotlight-vue/styles/spotlight-vue.css`
- `defineSpotlightConfig` in the canonical or existing config file
- `loadBundledSkillsFromGlob` on `.inupedia/skills/**/SKILL.md`
- `app.use(SpotlightVue, { config, enabled: true })`
- `getUiContext`: expose only useful already-available state such as current route, selected entity, active tab/scene; do not invent a duplicate global store
- `getMemorySubjectId`: stable user id when available; never a rotating access token

Referential prompts require enough `uiContext`/conversation context to resolve “那个 / this / continue”. If not resolvable, the gold expectation is clarify.

## Project Pack

Create/reuse `spotlight-project/`:

- `spotlight.project.yml` — same `projectId`
- `system-prompt.md` — concise product constraints; no invented entities
- `ui-prompts.json` — suggestions grounded in gold prompts
- `.env.example` — provider placeholders from [standard.md](../standard.md)
- `docker-compose.yml` — Server + required persistence when local deployment is part of the host plan

Do not copy `.inupedia/skills` into the Server image; browser/run capability context supplies host Skills.

## Verify locally

Run:

1. static checks from [testing.md](../testing.md)
2. host typecheck/build/tests that cover changed files
3. live health + gold benchmark only if Server/model credentials/runtime are available

A package-registry, Docker, provider-key, or network blocker is `BLOCKED`, not `PASS`.

## Handoff to stage 6

Do not produce the final user wrap-up here. Collect exact files, counts, env keys, boot order, static results, benchmark status, and leftovers, then write [08-stage6-report.md](08-stage6-report.md).
