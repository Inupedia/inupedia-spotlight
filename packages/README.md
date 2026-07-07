# Inupedia Spotlight SDK packages

Monorepo packages extracted from ydjm-construction-map for productization.

| Package | npm name | Role |
|---------|----------|------|
| `spotlight-protocol` | `@inupedia/spotlight-protocol` | Shared wire types (client ↔ server) |
| `spotlight-client` | `@inupedia/spotlight-client` | HTTP, manifest, host tool bridge |
| `spotlight-vue` | `@inupedia/spotlight-vue` | Vue plugin, UI shell, `defineSpotlightHost` |
| `spotlight-memory` | `@inupedia/spotlight-memory` | Memory Gate, exact/semantic cache stores |

## Build

```bash
pnpm install
pnpm build:spotlight-packages
```

In `ydjm-construction-map/packages/spotlight-memory` alone (outside inupedia-spotlight workspace):

```bash
pnpm install --ignore-workspace && pnpm run build && pnpm test
```

## Maintenance Rules

`inupedia-spotlight` is the release source of truth. During the ydjm transition
window, edit `ydjm-construction-map/packages/`, then run:

```bash
pnpm update:spotlight
```

Commit, tag, and publish only from `inupedia-spotlight`.

Public API is split by runtime:

| Entry | Runtime | Purpose |
|-------|---------|---------|
| `@inupedia/spotlight-vue` | browser | Vue plugin, config, stable host APIs |
| `@inupedia/spotlight-vue/remote` | browser | server pipeline HTTP helpers |
| `@inupedia/spotlight-vue/markdown` | browser | markdown formatting helpers |
| `@inupedia/spotlight-vue/workflow` | browser | operate/session workflow builders |
| `@inupedia/spotlight-vue/testing` | test only | reset helpers |
| `@inupedia/spotlight-client` | browser-safe | host tools, registry, service helpers |
| `@inupedia/spotlight-client/vite` | build tool | Vite IoC transform |
| `@inupedia/spotlight-client/node` | Node only | skill script runner |
| `@inupedia/spotlight-memory` | isomorphic | Memory Gate, normalize, classify |
| `@inupedia/spotlight-memory/node` | Node only | pack exact store, paths |

Do not add Node-only imports to package root entries. If a helper touches
`node:*`, `process`, filesystem, or shell execution, put it behind a Node-only
subpath.

Before publishing, run package builds from `inupedia-spotlight`; each build
verifies export targets after `dist` is generated.

## Host app integration

Skills + service layout follows Inupedia Agent Skills standard. See `@inupedia/spotlight-client` README.

```typescript
// main.ts
import { SpotlightVue } from "@inupedia/spotlight-vue";
import spotlightConfig from "./spotlight.config";

app.use(SpotlightVue, {
  config: spotlightConfig,
  enabled: true,
  avatarEnabled: true,
});
```

```typescript
// spotlight.config.ts
import { defineSpotlightApp, readSpotlightEnv } from "@inupedia/spotlight-vue";
import { buildAgentServiceHost } from "@inupedia/spotlight-client";
import { mySpotlightHost } from "@/service/agent/host";

const skillModules = import.meta.glob<string>(
  "../../.inupedia/skills/**/SKILL.md",
  { eager: true, query: "?raw", import: "default" },
);

export default defineSpotlightApp({
  ...readSpotlightEnv(import.meta.env, { projectId: "my-app" }),
  ...mySpotlightHost, // listTools, runTool, operate, getUiContext…
  skills: skillModules,
});
```

| 你写 | SDK 提供 |
|------|----------|
| `.inupedia/skills/*/SKILL.md` + references/scripts | 名录、`skill.invoke`、附录打包 |
| `src/service/agent/capabilities/**/*.ts` | `@agent` + `resolveAgentMeta`, `buildAgentServiceHost` |
| `.inupedia/skills/_template` 复制新 skill | `validateSkillFrontmatter` |

`spotlight-server` remains a deployable service in this workspace; publish separately as Docker image.
