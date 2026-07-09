# Inupedia Spotlight SDK packages

Monorepo packages extracted from ydjm-construction-map for productization.

| Package | npm name | Role |
|---------|----------|------|
| `spotlight-protocol` | `@inupedia/spotlight-protocol` | Shared wire types (client ↔ server) |
| `spotlight-client` | `@inupedia/spotlight-client` | HTTP, manifest, framework-neutral host core |
| `spotlight-vue` | `@inupedia/spotlight-vue` | Vue plugin, UI shell, `defineSpotlightCapabilityHost` |
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
import {
  defineSpotlightConfig,
  defineSpotlightCapabilityHost,
  readSpotlightEnv,
} from "@inupedia/spotlight-vue";

const skillModules = import.meta.glob<string>(
  "../../.inupedia/skills/**/SKILL.md",
  { eager: true, query: "?raw", import: "default" },
);

const host = defineSpotlightCapabilityHost({
  actions: [
    {
      name: "ui.openSettings",
      description: "打开设置面板",
      handler: () => openSettings(),
    },
  ],
  readables: [
    {
      id: "route",
      description: "当前页面",
      value: () => router.currentRoute.value.name,
    },
  ],
});

export default defineSpotlightConfig({
  ...readSpotlightEnv(import.meta.env, { projectId: "my-app" }),
  host,
  skills: skillModules,
});
```

| 你写 | SDK 提供 |
|------|----------|
| `.inupedia/skills/*/SKILL.md` + references/scripts | 名录、`skill.invoke`、附录打包 |
| `actions/readables/workflows/metadata` | `createSpotlightHostCore`, Vue lifecycle adapter, host manifest |
| 可选 `src/service/agent/capabilities/**/*.ts` | 旧 `@agent` registry 兼容桥 |
| `.inupedia/skills/_template` 复制新 skill | `validateSkillFrontmatter` |

不要复制 ydjm 的 scene/tab/Cesium 模型。那些是 ydjm host app 自己注入的 capabilities，不是 Spotlight SDK 前提。

`spotlight-server` remains a deployable service in this workspace; publish separately as Docker image.
