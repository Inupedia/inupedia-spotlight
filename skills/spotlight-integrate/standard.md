# Spotlight host-app standard

This file is the **only** contract for install, directory layout, naming, env, and boot. Do not copy another product’s folders, tool names, or catalog strings.

## 1. Install this Agent Skill (human, once)

Two ways. Details and host leftovers: [README.md](README.md).

**A. Copy the entire directory** (not only `SKILL.md`):

| Agent | Path |
|---|---|
| Cursor, this machine | `~/.cursor/skills/spotlight-integrate/` |
| Cursor, this repo | `<app>/.cursor/skills/spotlight-integrate/` |
| Codex | `<app>/.codex/skills/spotlight-integrate/` |
| Claude Code | `<app>/.claude/skills/spotlight-integrate/` |

Then in the **host frontend** chat:

```
Use spotlight-integrate. Follow standard.md. Distill this app into Spotlight.
```

**B. Paste into any LLM** that already has the host repo open:

```bash
./prompt.sh --copy
```

Paste the clipboard, then: follow `SKILL.md`; do not copy example names.

This skill’s own tree must stay intact:

```
spotlight-integrate/
├── prompt.sh                # dump pack for any LLM
├── SKILL.md                 # agent entry
├── README.md                # human entry
├── standard.md              # this file
├── testing.md               # gold questions + static/live checks
├── templates.md             # copy-paste file snippets (generic names)
├── examples.md              # shape only — never copy names into the host
├── methodology/             # stages 0–5
└── extractors/              # candidate finders
```

Do not start coding until `methodology/` and `extractors/` sit next to `SKILL.md` (or the pasted prompt includes them).

## 2. Host app directory structure (generated)

```
<app>/
├── package.json
├── vite.config.ts
├── .env.example                         # frontend VITE_SPOTLIGHT_* only
├── .inupedia/
│   └── skills/
│       ├── skill.knowledge/SKILL.md     # required
│       └── skill.<domain>/SKILL.md      # one folder per domain
├── src/
│   ├── main.ts                          # app.use(SpotlightVue)
│   └── spotlight/
│       ├── config.ts                    # defineSpotlightConfig
│       ├── tools.ts                     # defineClientTool exports + spotlightTools
│       └── actions/                     # OPTIONAL: extracted handlers (<40 lines)
├── spotlight-project/                   # Server Project Pack (not the SDK)
│   ├── spotlight.project.yml
│   ├── system-prompt.md
│   ├── ui-prompts.json
│   ├── .env.example
│   └── docker-compose.yml
└── .spotlight-integrate/                # distillation working dir
    ├── PIPELINE_STATE.md
    ├── FRONTEND_OVERVIEW.md
    ├── candidates/
    ├── rejected/
    ├── verified.md
    ├── gold-questions.md
    └── leftovers.md
```

If the host already has tools or `defineSpotlightConfig` elsewhere, keep those paths and set Vite `include` to the existing tools file. Do not create a second tools file or a second `projectId`. Do not generate `videoChannels` / `quickPanelActions` / avatar unless this host already has that UI.

## 3. Naming

| Thing | Rule | Example (shape only) |
|---|---|---|
| `projectId` | kebab-case; identical in Vite plugin, config, `spotlight.project.yml`, `VITE_SPOTLIGHT_PROJECT_ID` | `media-console` |
| Client Tool | camelCase, verb-first export | `getItemList`, `openItem`, `closeItem` |
| Skill id | `skill.` + dotted domain | `skill.knowledge`, `skill.items` |
| Skill folder | equals id | `.inupedia/skills/skill.items/SKILL.md` |
| npm + image | one semver for all `@inupedia/spotlight-*` and `ghcr.io/inupedia/spotlight-server:<ver>` | output of `npm view @inupedia/spotlight-vue version` |

Read catalog strings, route titles, and button labels from **this** host repo. Never reuse names from [examples.md](examples.md) or [templates.md](templates.md).

## 4. Install SDK into the host (agent, stage 5)

```bash
pnpm add @inupedia/spotlight-client@<ver> \
         @inupedia/spotlight-protocol@<ver> \
         @inupedia/spotlight-vue@<ver>
```

`<ver>` = `npm view @inupedia/spotlight-vue version` unless the user pinned it.

Required wiring (snippets in [templates.md](templates.md)):

1. Vite plugin `spotlightClientTools({ projectId, frontendBuildId, include })`
2. `src/spotlight/config.ts` + `loadBundledSkillsFromGlob('.inupedia/skills/**/SKILL.md')`
3. `main.ts`: css import + `app.use(SpotlightVue, { config, enabled: true })`
4. Dev proxy: frontend `VITE_SPOTLIGHT_SERVER_URL` → Spotlight Server `:8787`

## 5. Environment

**Frontend** `<app>/.env.example`:

```
VITE_SPOTLIGHT_PROJECT_ID=<projectId>
VITE_SPOTLIGHT_SERVER_URL=/spotlight-api
VITE_SPOTLIGHT_API_KEY=local-dev-key
```

Vite proxy `/spotlight-api` → `http://127.0.0.1:8787`.

**Server** `spotlight-project/.env.example`:

```
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

Never copy host secrets into Skills. Never put LLM keys in `VITE_*`.

## 6. Boot order

1. `cd spotlight-project && docker compose up -d`
2. `curl -sfS http://127.0.0.1:8787/health`
3. Start the Vite app
4. Open the Spotlight command UI and run [testing.md](testing.md) gold prompts

## 7. Definition of done

Integration is done only when **all** of these hold:

- Layout matches §2 (or an existing tools path is reused, not duplicated)
- `skill.knowledge` exists
- every Skill `allowed-tools` name is an export in the tools module
- gold file uses the table in [testing.md](testing.md)
- list+open domains have both gold rows
- wrap-up lists env keys, boot order, and leftovers

## 8. What must not appear in the host app

- LangGraph / custom planner
- Copied `SKILL.md` onto the Server image (browser sends Skills per run)
- A second `projectId`
- Client Tools that do not call an existing host function
- Catalog names, tool names, or domains copied from this skill’s examples
