# Inupedia Spotlight SDK packages

Monorepo packages extracted from ydjm-construction-map for productization.

| Package | npm name | Role |
|---------|----------|------|
| `spotlight-protocol` | `@inupedia/spotlight-protocol` | Shared wire types (client ↔ server) |
| `spotlight-client` | `@inupedia/spotlight-client` | HTTP, manifest, host tool bridge |
| `spotlight-vue` | `@inupedia/spotlight-vue` | Vue plugin, UI shell, `defineSpotlightHost` |

## Build

```bash
pnpm install
pnpm build:spotlight-packages
```

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
