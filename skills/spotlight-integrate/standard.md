# Spotlight host-app standard

This file is the **single contract** for compatibility, install, directory layout, naming, env, and boot. Do not copy another product's folders, tool names, or catalog strings.

## 1. Install this Agent Skill (human, once)

Copy the **entire** `spotlight-integrate/` directory, not only `SKILL.md`.

| Agent | Path |
|---|---|
| Cursor, this machine | `~/.cursor/skills/spotlight-integrate/` |
| Cursor, this repo | `<app>/.cursor/skills/spotlight-integrate/` |
| Codex | `<app>/.codex/skills/spotlight-integrate/` |
| Claude Code | `<app>/.claude/skills/spotlight-integrate/` |

Then in the host frontend chat:

```
Use spotlight-integrate. Follow architecture.md and standard.md. Agentize this app with Spotlight.
```

Or use `./prompt.sh --copy` and paste the generated pack into an LLM that already has the host repo open.

## 2. Compatibility preflight (before coding)

Read `package.json`, lockfiles, Node engine, and existing Spotlight dependencies. Write `.spotlight-integrate/COMPATIBILITY.md`.

### Host classification

| Status | Condition | Action |
|---|---|---|
| `READY` | Vue 3 + Vite + compatible Spotlight peer ranges | continue |
| `UPGRADE_REQUIRED` | Vue 3 + Vite but target Spotlight peer ranges do not include host Vue/Pinia/Node | report exact mismatch; do not force upgrade |
| `BUILD_MIGRATION_REQUIRED` | Vue 3 but no Vite | analyze capabilities; stop before build migration unless requested |
| `UNSUPPORTED_AUTOMATION` | Vue 2 or non-Vue | readiness report only for current skill |

### Registry version check

Use the registry as the install source of truth:

```bash
npm view @inupedia/spotlight-vue version peerDependencies --json
npm view @inupedia/spotlight-client version --json
npm view @inupedia/spotlight-protocol version --json
```

All installed `@inupedia/spotlight-*` packages must resolve to one compatible version. Do not assume GitHub `main` equals the latest published npm version. If registry lookup is unavailable, mark version verification `BLOCKED` instead of guessing.

### Package manager

Preserve the host package manager:

- `pnpm-lock.yaml` -> pnpm
- `yarn.lock` -> yarn
- `package-lock.json` -> npm
- no lockfile -> use the package manager declared by `packageManager`, otherwise ask only if installation is required

Do not add a second lockfile.

## 3. Host app directory structure (generated)

```text
<app>/
├── package.json
├── vite.config.*
├── .env.example
├── .inupedia/
│   └── skills/
│       ├── skill.knowledge/SKILL.md
│       └── skill.<domain>/SKILL.md
├── src/
│   ├── main.*
│   └── spotlight/
│       ├── config.ts
│       ├── tools.ts
│       └── actions/                    # optional behavior-preserving extractions
├── spotlight-project/
│   ├── spotlight.project.yml
│   ├── system-prompt.md
│   ├── ui-prompts.json
│   ├── .env.example
│   └── docker-compose.yml
└── .spotlight-integrate/
    ├── PIPELINE_STATE.md
    ├── COMPATIBILITY.md
    ├── FRONTEND_OVERVIEW.md
    ├── candidates/
    ├── rejected/
    ├── verified.md
    ├── leftovers.md
    ├── gold-questions.md
    ├── benchmark-results.md            # only when live benchmark ran
    └── INTEGRATION_REPORT.md
```

If the host already has tools or `defineSpotlightConfig` elsewhere, reuse those paths and point the Vite plugin at the existing tools module. Never create a second tools entrypoint or `projectId`.

## 4. Naming

| Thing | Rule | Shape-only example |
|---|---|---|
| `projectId` | kebab-case; identical in Vite plugin, config, yml, env | `media-console` |
| Client Tool | camelCase, verb-first export | `getItemList`, `openItem`, `addItem` |
| Skill id | `skill.` + dotted domain | `skill.items` |
| Skill folder | equals id | `.inupedia/skills/skill.items/SKILL.md` |
| npm packages | exact same published version | `0.x.y` |

Read names, route titles, and button labels from **this** host repo.

## 5. Install SDK into a compatible host (stage 5)

Use the host package manager and exact verified version `<ver>`.

```bash
# pnpm
pnpm add @inupedia/spotlight-client@<ver> @inupedia/spotlight-protocol@<ver> @inupedia/spotlight-vue@<ver>

# npm
npm install @inupedia/spotlight-client@<ver> @inupedia/spotlight-protocol@<ver> @inupedia/spotlight-vue@<ver>

# yarn
yarn add @inupedia/spotlight-client@<ver> @inupedia/spotlight-protocol@<ver> @inupedia/spotlight-vue@<ver>
```

Before installing, verify `@inupedia/spotlight-vue@<ver>` peer dependencies include the host versions. Never use `--force` or `--legacy-peer-deps` to hide a mismatch.

Required wiring:

1. Vite plugin `spotlightClientTools({ projectId, frontendBuildId, include })`
2. `src/spotlight/config.ts` + `loadBundledSkillsFromGlob('.inupedia/skills/**/SKILL.md')`
3. `main.*`: Spotlight CSS + `app.use(SpotlightVue, { config, enabled: true })`
4. Dev proxy: frontend `VITE_SPOTLIGHT_SERVER_URL` -> Spotlight Server `:8787`

## 6. Client Tool contract

Every generated Tool must:

- call an existing host function/export;
- have JSDoc immediately above `defineClientTool`;
- expose the narrowest input schema needed by the host capability;
- declare correct `sideEffect`, `replayPolicy`, `riskLevel`, and confirmation requirements supported by the runtime;
- avoid returning entire stores or arbitrary internal objects when a small result is enough;
- never provide a generic `invokeStoreMethod(name, args)` or DOM selector escape hatch.

`DIRECT` capabilities become Tools. `REFACTOR` capabilities become Tools only after an approved behavior-preserving extraction. `GATED` capabilities are not auto-exposed.

## 7. Environment

Frontend `<app>/.env.example`:

```env
VITE_SPOTLIGHT_PROJECT_ID=<projectId>
VITE_SPOTLIGHT_SERVER_URL=/spotlight-api
VITE_SPOTLIGHT_API_KEY=local-dev-key
```

Vite proxy `/spotlight-api` -> `http://127.0.0.1:8787`.

Server `spotlight-project/.env.example`:

```env
SPOTLIGHT_API_KEYS=local-dev-key
SPOTLIGHT_POSTGRES_PASSWORD=spotlight
CORS_ORIGIN=http://localhost:5173
SPOTLIGHT_LLM_PROVIDER=siliconflow
SILICONFLOW_API_KEY=
SILICONFLOW_API_BASE=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=
KNOWLEDGE_BASE_URL=
KNOWLEDGE_API_KEY=
TAVILY_API_BASE=
TAVILY_API_KEY=
```

Never copy host secrets into Skills. Never put LLM/provider keys in `VITE_*`.

## 8. Boot order

1. `cd spotlight-project && docker compose up -d`
2. `curl -sfS http://127.0.0.1:8787/health`
3. Start the host Vite app with its existing package manager/script
4. Open the Spotlight command UI and run [testing.md](testing.md)

## 9. Definition of done

Integration is done only when all applicable gates hold:

- compatibility is `READY`, or blockers are explicitly documented and wiring was not falsely claimed complete;
- every discovered user-facing capability is classified `DIRECT / REFACTOR / GATED / REJECT`;
- every `DIRECT` capability selected for exposure is wrapped;
- `skill.knowledge` exists;
- every Skill `allowed-tools` name is an exported registered Client Tool;
- projectId is identical across Vite/config/project/env;
- smoke gold rows cover all actionable Skills;
- static checks pass;
- `INTEGRATION_REPORT.md` distinguishes static readiness from live accuracy;
- live metrics are reported only if the Server + target LLM actually ran.

## 10. What must not appear in the host app

- LangGraph/custom planner added solely for Spotlight integration
- copied product-specific Skill ids/tool names from the integration pack
- a second `projectId`
- Client Tools that do not reach an existing host capability
- forced peer-dependency installation
- DOM-click automation where a stable Store/Service/Router capability exists
- claims such as “95% accuracy” derived only from grep/static checks
