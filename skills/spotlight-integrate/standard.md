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

Read `package.json`, lockfiles, Node engine, build system, frontend framework, and existing Spotlight dependencies. Write `.spotlight-integrate/COMPATIBILITY.md`.

Compatibility is **two-axis**: Core Agentization and visual UI adapter.

### Core classification

| Status | Condition | Action |
|---|---|---|
| `READY` | Browser JS/TS host can compile/register framework-neutral Client Tools and reach Spotlight Server | continue core pipeline |
| `UPGRADE_REQUIRED` | Core package/build/Node ranges are incompatible | report exact mismatch; do not force upgrade |
| `BUILD_MIGRATION_REQUIRED` | Current build cannot support the Tool compiler/runtime path without migration | analyze capabilities; stop before build migration unless requested |
| `UNSUPPORTED_AUTOMATION` | No viable browser Tool integration path exists | readiness report only |

### UI adapter classification

| Status | Condition | Action |
|---|---|---|
| `VUE_READY` | Vue 3 host satisfies `@inupedia/spotlight-vue` peer ranges | embed Vue command UI/runtime |
| `UPGRADE_REQUIRED` | Vue host exists but Vue/Pinia/Node peers are incompatible | continue core when possible; do not force upgrade |
| `ADAPTER_REQUIRED` | React/other framework host has no shipped visual adapter | continue core + headless Server benchmark; report visual-shell gap |
| `HEADLESS_ONLY` | Product intentionally does not embed a visual command shell | continue core/runtime benchmark only |

A missing visual adapter is **not** the same as unsupported Core Agentization.

### Registry version check

Use the registry as the install source of truth:

```bash
npm view @inupedia/spotlight-vue version peerDependencies --json
npm view @inupedia/spotlight-client version peerDependencies --json
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
├── <build config>
├── .env.example
├── .inupedia/
│   └── skills/
│       ├── skill.knowledge/SKILL.md
│       └── skill.<domain>/SKILL.md
├── src/
│   ├── <app entry>
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

If the host already has tools or `defineSpotlightConfig` elsewhere, reuse those paths and point the Tool compiler at the existing tools module. Never create a second tools entrypoint or `projectId`.

## 4. Naming

| Thing | Rule | Shape-only example |
|---|---|---|
| `projectId` | kebab-case; identical in Tool compiler, config, yml, env | `media-console` |
| Client Tool | camelCase, verb-first export | `getItemList`, `openItem`, `addItem` |
| Skill id | `skill.` + dotted domain | `skill.items` |
| Skill folder | equals id | `.inupedia/skills/skill.items/SKILL.md` |
| npm packages | exact same published version | `0.x.y` |

Read names, route titles, and button labels from **this** host repo.

## 5. Install SDK into a compatible host (stage 5)

### Core packages

Use the host package manager and exact verified version `<ver>`.

```bash
# pnpm
pnpm add @inupedia/spotlight-client@<ver> @inupedia/spotlight-protocol@<ver>

# npm
npm install @inupedia/spotlight-client@<ver> @inupedia/spotlight-protocol@<ver>

# yarn
yarn add @inupedia/spotlight-client@<ver> @inupedia/spotlight-protocol@<ver>
```

For a Vite host, wire the framework-neutral `spotlightClientTools({ projectId, frontendBuildId, include })` plugin.

### Vue visual adapter

Only when `ui adapter = VUE_READY`, install the same version of `@inupedia/spotlight-vue`:

```bash
pnpm add @inupedia/spotlight-vue@<ver>
# or equivalent npm/yarn command
```

Verify its Vue/Pinia peers first. Never use `--force` or `--legacy-peer-deps` to hide a mismatch.

Vue visual wiring:

1. Tool compiler `spotlightClientTools({ projectId, frontendBuildId, include })`
2. `src/spotlight/config.ts` + `loadBundledSkillsFromGlob('.inupedia/skills/**/SKILL.md')`
3. `main.*`: Spotlight CSS + `app.use(SpotlightVue, { config, enabled: true })`
4. Dev proxy: frontend `VITE_SPOTLIGHT_SERVER_URL` -> Spotlight Server `:8787`

For React/other frameworks with `ui adapter = ADAPTER_REQUIRED`, do **not** install `@inupedia/spotlight-vue`. Continue Client Tool/Skill/Server wiring and headless live benchmarks. Report visual embedding as remaining adapter work.

## 6. Client Tool contract

Every generated Tool must:

- call an existing host function/export;
- preserve the host application's authorization checks and backend permission enforcement;
- have JSDoc immediately above `defineClientTool`;
- expose the narrowest input schema needed by the host capability;
- declare correct `sideEffect`, `replayPolicy`, `riskLevel`, and confirmation requirements supported by the runtime;
- avoid returning entire stores or arbitrary internal objects when a small result is enough;
- never provide a generic `invokeStoreMethod(name, args)` or DOM selector escape hatch.

**Authorization rule:** static Skill/Tool declarations describe capability; they never grant permission. If availability depends on the current role, tenant, record ownership, workflow state, feature flag, or another live host condition, keep that guard in the host and include the capability in the live Tool set only when it is currently available. The Tool handler/backend must re-check authorization at execution time. Never duplicate or weaken product-specific RBAC/ABAC rules inside the generic Spotlight Server.

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

Core/headless benchmark:

1. `cd spotlight-project && docker compose up -d`
2. `curl -sfS http://127.0.0.1:8787/health`
3. Start the host app/backend as required by its own stack
4. Run the Spotlight Server gold benchmark through registered Client Tools

Vue visual integration adds opening the embedded Spotlight command UI after the host frontend starts.

## 9. Definition of done

Integration is done only when all applicable gates hold:

- Core compatibility and UI-adapter compatibility are reported separately;
- every discovered user-facing capability is classified `DIRECT / REFACTOR / GATED / REJECT`;
- every `DIRECT` capability selected for exposure is wrapped;
- `skill.knowledge` exists;
- every Skill `allowed-tools` name is an exported registered Client Tool;
- projectId is identical across Tool compiler/config/project/env;
- host authorization, record-ownership, and workflow-state guards still protect every exposed capability, and Tool registration is never treated as permission;
- smoke gold rows cover all actionable Skills;
- static checks pass;
- `INTEGRATION_REPORT.md` distinguishes static readiness, Core Agentization, UI embedding, and live accuracy;
- live metrics are reported only if the Server + target LLM actually ran.

A project may be Core-Agentized and benchmarked successfully while its visual adapter remains `ADAPTER_REQUIRED`; that state must be reported explicitly rather than mislabeled as a complete embedded UI integration.

## 10. What must not appear in the host app

- LangGraph/custom planner added solely for Spotlight integration
- copied product-specific Skill ids/tool names from the integration pack
- a second `projectId`
- Client Tools that do not reach an existing host capability
- forced peer-dependency installation
- framework-specific package installation into an incompatible host
- DOM-click automation where a stable Store/Service/Router capability exists
- authorization bypasses or generic Server copies of product-specific RBAC/ABAC rules
- claims such as “95% accuracy” derived only from grep/static checks