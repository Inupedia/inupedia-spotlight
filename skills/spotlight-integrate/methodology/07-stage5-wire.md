# Stage 5 — Wire SDK, Vue, Project Pack

Only after Tools + Skills + gold questions exist. Layout, packages, env, and boot: [standard.md](../standard.md). Snippets: [templates.md](../templates.md). Checks: [testing.md](../testing.md).

## Packages

```bash
pnpm add @inupedia/spotlight-client@<ver> @inupedia/spotlight-protocol@<ver> @inupedia/spotlight-vue@<ver>
```

Same `<ver>` everywhere. Server image tag = that semver: `ghcr.io/inupedia/spotlight-server:<ver>`.

## Vite

Add `spotlightClientTools`; `include` must match the tools file path (`/src/spotlight/tools.ts` or the existing tools file).

Set `projectId` and `frontendBuildId`. Production builds fail without them.

If the app uses a custom base, keep proxy paths consistent with `VITE_SPOTLIGHT_SERVER_URL`.

## Vue

- Import `@inupedia/spotlight-vue/styles/spotlight-vue.css`
- `defineSpotlightConfig` in `src/spotlight/config.ts`
- `loadBundledSkillsFromGlob` on `.inupedia/skills/**/SKILL.md`
- `app.use(SpotlightVue, { config, enabled: true })`
- `getUiContext`: return current route + any already-centralized UI context object. Do not invent a new global store.
- `getMemorySubjectId`: stable user id. If none, omit or use session id and say long-term memory is session-scoped. Never use a rotating access token.

## Project Pack

Create `spotlight-project/` even if Server already runs elsewhere:

- `spotlight.project.yml` — `projectId` identical to Vite plugin
- `system-prompt.md` — 10–30 lines: product name, do not invent entities, prefer tools
- `ui-prompts.json` — suggestion chips from gold list prompts
- `.env.example` — LLM and provider placeholders from [standard.md](../standard.md) §5
- `docker-compose.yml` — server + postgres + writable memory volume (`SPOTLIGHT_MEMORY_PACKS_ROOT`)

Do not copy `.inupedia/skills` into the server image.

## Verify locally

Run the static checks in [testing.md](../testing.md) §1. Typecheck new files. Report leftovers from `leftovers.md`.

## User wrap-up (required)

1. Files created/edited (paths from [standard.md](../standard.md) §2)
2. Tool count + Skill count
3. `.env` they must fill
4. Boot order from [standard.md](../standard.md) §6
5. First gold prompts from `gold-questions.md`
6. What you refused to wrap and why
