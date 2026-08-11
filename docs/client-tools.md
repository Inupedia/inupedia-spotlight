# Spotlight Client Tool / Skill 接入指南

## 你最终需要写多少代码

业务项目只负责定义“当前页面能做什么”。以另一个视频项目为例：

```ts
// src/spotlight/tools.ts
import { defineClientTool } from "@inupedia/spotlight-client";
import { videoService } from "@/service/video";

/** 按名称全屏播放指定视频。 */
export const playVideoFullscreen = defineClientTool(
  async ({ name }: { name: string }): Promise<void> => {
    await videoService.playFullscreen(name);
  },
);

/** 关闭视频播放界面。 */
export const closeVideo = defineClientTool(async (): Promise<void> => {
  await videoService.close();
});

export const spotlightTools = [playVideoFullscreen, closeVideo];
```

这里没有 LangChain、Host、Capability Registry、工作流协议或 Tool 元数据对象：

- Tool 名称来自导出变量名，如 `playVideoFullscreen`。
- Tool 说明来自函数上方的 JSDoc。
- 输入、输出 JSON Schema 来自 TypeScript 类型。
- 函数仍然直接调用项目已有的 Store、Router、播放器或 GIS Service。

## 1. 安装

```bash
pnpm add @inupedia/spotlight-client@^0.5.7 @inupedia/spotlight-vue@^0.5.7
```

## 2. 配置 Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { spotlightClientTools } from "@inupedia/spotlight-client/vite";

const frontendBuildId = process.env.GIT_SHA ?? "local-dev";

export default defineConfig({
  plugins: [
    vue(),
    spotlightClientTools({
      projectId: "video-console",
      frontendBuildId,
    }),
  ],
  define: {
    "import.meta.env.VITE_BUILD_SHA": JSON.stringify(frontendBuildId),
  },
});
```

生产模式下 `projectId` 和 `frontendBuildId` 必填。缺少 JSDoc、输入类型或无法安全推导的类型会直接让构建失败，避免错误 Tool 悄悄上线。

## 3. 注册 Tool

```ts
// src/spotlight/config.ts
import {
  defineSpotlightConfig,
  readSpotlightEnv,
} from "@inupedia/spotlight-vue";
import { spotlightTools } from "./tools";

export default defineSpotlightConfig({
  ...readSpotlightEnv(import.meta.env, {
    projectId: "video-console",
  }),
  frontendBuildId: import.meta.env.VITE_BUILD_SHA,
  tools: spotlightTools,
  // 登录系统有稳定用户 ID 时再配置；不要使用会轮换的 token。
  getMemorySubjectId: () => authStore.userId,
});
```

```ts
// src/main.ts
import { createApp } from "vue";
import { SpotlightVue } from "@inupedia/spotlight-vue";
import App from "./App.vue";
import spotlightConfig from "./spotlight/config";

createApp(App)
  .use(SpotlightVue, { config: spotlightConfig })
  .mount("#app");
```

到这里，单步操作项目的接入工作已经结束。

## 4. 可选：注册业务 Skill

Tool 说明“页面能做什么”，Skill 说明“什么时候用、多个 Tool 怎样组成业务流程”。例如另一个项目也有视频能力，只需增加：

```md
<!-- .inupedia/skills/skill.monitoring/SKILL.md -->
---
id: skill.monitoring
name: 现场监控
description: 打开、播放或关闭项目视频监控。
when_to_use: 用户点名监控点位要求播放，或要求打开、关闭监控界面。
allowed-tools: openVideoMonitoring, playVideoFullscreen, closeVideo
capability-examples: 打开监控列表, 播放钢筋棚监控, 关闭监控
---

# 现场监控

- 没有具体点位时调用 `openVideoMonitoring`。
- 给出具体点位时调用 `playVideoFullscreen`，不要擅自改写点位名称。
- 要求关闭时调用 `closeVideo`。
```

然后在同一份配置中加载：

```ts
import {
  defineSpotlightConfig,
  loadBundledSkillsFromGlob,
  readSpotlightEnv,
} from "@inupedia/spotlight-vue";

const skills = loadBundledSkillsFromGlob(
  import.meta.glob("../../.inupedia/skills/**/SKILL.md", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as Record<string, string>,
);

export default defineSpotlightConfig({
  ...readSpotlightEnv(import.meta.env, { projectId: "video-console" }),
  frontendBuildId: import.meta.env.VITE_BUILD_SHA,
  tools: spotlightTools,
  skills,
});
```

SDK 会把 Skill 与当前构建的 Tool Manifest 一起发送给 Server。Server 保留业务说明，但会把 `allowed-tools` 与真实注册 Tool 求交集；Skill 不能创造权限，也不能调用另一个项目或旧版本中不存在的 Tool。

`getMemorySubjectId` 是可选项：不配置时仍有当前会话的短期 Memory，但不会保存跨会话长期记忆，避免匿名用户之间串数据。长期记忆只会在用户明确说“记住”或“忘记”时写入或删除。

## 推导不了复杂类型时

构建插件刻意不猜测外部类型、泛型映射或运行时对象。遇到这类输入，使用显式 `schema`，业务函数不用改：

```ts
/** 切换视频分组。 */
export const switchVideoGroup = defineClientTool(
  async ({ group }: { group: VideoGroup }): Promise<void> => {
    await videoService.switchGroup(group);
  },
  {
    schema: {
      input: {
        type: "object",
        properties: {
          group: { type: "string", enum: ["live", "history"] },
        },
        required: ["group"],
        additionalProperties: false,
      },
      output: { type: "null" },
    },
  },
);
```

显式 Schema 是逃生口，不是默认写法。能够由局部 TypeScript 类型表达的参数应继续自动推导。

## 哪些功能应该放在哪里

| 功能 | 位置 | 例子 |
| --- | --- | --- |
| 页面专属动作 | Client Tool | 打开视频、切换图层、进入隧洞、选中构件 |
| 通用外部能力 | Server LangChain Tool | 联网搜索、知识检索、数据库、MCP、第三方 API |
| 项目业务流程说明 | 前端注册的 Skill | 进入巡检视图后开始巡检、按名称播放监控 |
| 通用编排与安全门禁 | Server LangGraph | 选择 Skill、约束 Tool、等待浏览器执行结果 |
| 页面状态 | `getUiContext` | 当前路由、选中对象、打开的面板 |

不要把 GIS、视频播放器或项目 Store 搬到 Server。Server 只知道 Tool 契约，具体页面动作仍由浏览器执行。

## 生产清单与执行边界

`vite build` 会输出：

```text
dist/spotlight-client-manifest.json
```

浏览器每轮携带同一份构建清单。Server 只把经过意图门禁筛选的副作用 Tool 暴露给 Action Agent，Knowledge Agent 永远看不到 Client Tool；浏览器端仍会再次检查 Tool 是否由当前构建真实注册。因此不再需要 `SPOTLIGHT_CLIENT_MANIFEST_DIR`，也不会因为容器缺少该目录而启动失败。

Server 读取可信清单后，将 Client Tool 转为真正的 LangChain Tool。模型调用该 Tool 时，执行请求通过现有浏览器 RPC 回到对应页面。LangChain 和 LangGraph 因此属于 Server 实现细节，不增加业务项目的接入成本。

## 从 0.5.6 迁移到 0.5.7

1. 将 `@inupedia/spotlight-client`、`@inupedia/spotlight-protocol`、`@inupedia/spotlight-vue` 升级到同一版本。
2. 单步 Tool 不必增加 Skill；需要业务流程、动态能力说明或相似 Tool 消歧时，再增加 `.inupedia/skills/**/SKILL.md`。
3. 不需要在 Spotlight Server 上复制业务项目的 Skill 文件；SDK 会按 Run 发送，并移除本地路径。

## 从 0.4.x 迁移到 0.5.x

1. 依赖升级到 `0.5.0`。
2. Project 知识与搜索改为 Server Provider；页面业务 Skill 通过 `skills` 或 `getSkillsForRun` 注册。
3. 保留 `tools` 与 `getUiContext`，页面动作函数不用重写。
4. 将自建 Agent Server 替换为官方镜像和 `spotlight.project.yml`。

## 从 0.2.x 迁移

`0.3.0` 是破坏性版本，不提供旧 Host/Capability 兼容层：

1. 把原 Capability handler 保留为普通业务函数。
2. 用 `defineClientTool` 包装需要暴露给 Spotlight 的函数。
3. 删除 `createSpotlightHost`、`defineSpotlightCapabilityHost`、`@agent` Registry 和前端 workflow glue。
4. 在 `defineSpotlightConfig` 中直接传入 `tools`。
5. 配置 Vite 插件并发布构建清单。

迁移原则很简单：项目只声明页面能力，SDK 负责协议，Server 负责编排。
