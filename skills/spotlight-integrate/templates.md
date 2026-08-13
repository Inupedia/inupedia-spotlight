# Templates

Use these as-is, then replace names and imports with **symbols from the host repo**. Placeholder names (`getItemList`, `openItem`, `skill.items`) are shape only.

## `src/spotlight/tools.ts`

```ts
import { defineClientTool } from "@inupedia/spotlight-client";
// import existing actions from the host app — do not invent them

/** 列出当前资源的名称与数量。 */
export const getItemList = defineClientTool(async (): Promise<unknown> => {
  return listItems();
});

/** 按用户给出的名称打开对应资源。 */
export const openItem = defineClientTool(
  async ({ name }: { name: string }): Promise<void> => {
    await openItemByName(name);
  },
);

/** 关闭当前资源视图。 */
export const closeItem = defineClientTool(async (): Promise<void> => {
  await closeCurrentItem();
});

export const spotlightTools = [getItemList, openItem, closeItem];
```

Enum / union inputs the plugin cannot infer:

```ts
/** 切换主界面已有页签。 */
export const switchMainTab = defineClientTool(
  async ({ tab }: { tab: "overview" | "detail" }): Promise<void> => {
    await setMainTab(tab);
  },
  {
    schema: {
      input: {
        type: "object",
        properties: {
          tab: { type: "string", enum: ["overview", "detail"] },
        },
        required: ["tab"],
        additionalProperties: false,
      },
      output: { type: "null" },
    },
  },
);
```

The `enum` values must be copied from the host store / router, not invented.

## `src/spotlight/config.ts`

```ts
import {
  defineSpotlightConfig,
  loadBundledSkillsFromGlob,
  readSpotlightEnv,
} from "@inupedia/spotlight-vue";
import { spotlightTools } from "./tools";

const skills = loadBundledSkillsFromGlob(
  import.meta.glob("../../.inupedia/skills/**/SKILL.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as Record<string, string>,
);

export default defineSpotlightConfig({
  ...readSpotlightEnv(import.meta.env, { projectId: "your-project-id" }),
  frontendBuildId: import.meta.env.VITE_BUILD_SHA,
  tools: spotlightTools,
  skills,
  getUiContext: () => ({ routePath: window.location.pathname }),
  getMemorySubjectId: () => undefined,
});
```

Replace `getMemorySubjectId` with a stable login user id when the app has one. Never use a rotating access token.

## Vite plugin

```ts
import { spotlightClientTools } from "@inupedia/spotlight-client/vite";

const frontendBuildId = process.env.GIT_SHA ?? "local-dev";

plugins: [
  spotlightClientTools({
    projectId: "your-project-id",
    frontendBuildId,
    include: "/src/spotlight/tools.ts",
  }),
  vue(),
]
```

Also `define: { "import.meta.env.VITE_BUILD_SHA": JSON.stringify(frontendBuildId) }` if the project does not already inject it.

## Vue `main.ts`

```ts
import { SpotlightVue } from "@inupedia/spotlight-vue";
import "@inupedia/spotlight-vue/styles/spotlight-vue.css";
import spotlightConfig from "./spotlight/config";

app.use(SpotlightVue, { config: spotlightConfig, enabled: true });
```

## Skill file

`.inupedia/skills/skill.items/SKILL.md`

```md
---
id: skill.items
name: 资源
description: 查询资源清单，或打开、关闭某个已存在的名称。
when_to_use: 用户询问有哪些资源，或要求打开、关闭某个具体名称。
allowed-tools: getItemList, openItem, closeItem
spotlight-response-strategy: tool_answer
capability-examples: 目前有哪些资源, 查看<exact catalog name from this repo>, 关闭资源
---

# 资源

- 清单、数量调用 `getItemList`。
- 明确查看某个名称时调用 `openItem`，参数用用户原词。
- 只问清单时不得擅自打开。
- 关闭调用 `closeItem`。
```

Replace `<exact catalog name from this repo>` with a real string from the host catalog. Do not leave the placeholder in the shipped Skill.

Knowledge skill (always create):

```md
---
id: skill.knowledge
name: 项目知识问答
description: 用知识库或公开资料回答介绍、概念和事实，不操作页面。
when_to_use: 用户问项目是什么、指标含义、公开新闻，且没有要求打开或切换当前页面。
spotlight-response-strategy: direct_answer
capability-examples: 介绍这个项目, 这个模块是什么意思
---

# 项目知识问答

- 项目事实走知识库；公开近况可走联网搜索并保留来源。
- 不调用任何 Client Tool。
```

## `spotlight-project/spotlight.project.yml`

```yaml
projectId: your-project-id
systemPromptFile: ./system-prompt.md
uiPromptsFile: ./ui-prompts.json

providers:
  knowledge:
    type: yuxi
    baseUrl: ${KNOWLEDGE_BASE_URL}
    apiKey: ${KNOWLEDGE_API_KEY:-}
  webSearch:
    type: hikari
    baseUrl: ${TAVILY_API_BASE}
    token: ${TAVILY_API_KEY}
```

## `spotlight-project/docker-compose.yml`

Image tag must match the npm package version (`npm view @inupedia/spotlight-vue version`).

```yaml
name: spotlight
services:
  spotlight-server:
    image: ghcr.io/inupedia/spotlight-server:<ver>
    ports: ["8787:8787"]
    env_file: .env
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 8787
      SPOTLIGHT_PROJECT_CONFIG: /project/spotlight.project.yml
      SPOTLIGHT_DATABASE_URL: postgresql://spotlight:${SPOTLIGHT_POSTGRES_PASSWORD}@postgres:5432/spotlight
      SPOTLIGHT_MEMORY_PACKS_ROOT: /data/memory-packs
    volumes:
      - ./:/project:ro
      - spotlight-pack-memory:/data/memory-packs
    depends_on:
      postgres:
        condition: service_healthy
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: spotlight
      POSTGRES_USER: spotlight
      POSTGRES_PASSWORD: ${SPOTLIGHT_POSTGRES_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U spotlight -d spotlight"]
      interval: 5s
      timeout: 3s
      retries: 20
    volumes:
      - spotlight-postgres:/var/lib/postgresql/data
volumes:
  spotlight-postgres:
  spotlight-pack-memory:
```

## Frontend env

```bash
VITE_SPOTLIGHT_SERVER_URL=/spotlight-api
VITE_SPOTLIGHT_API_KEY=local-dev-key
VITE_SPOTLIGHT_PROJECT_ID=your-project-id
```

Vite proxy `/spotlight-api` → `http://127.0.0.1:8787`.
