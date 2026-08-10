# Spotlight Client Tool 接入指南

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
pnpm add @inupedia/spotlight-client@^0.3.0 @inupedia/spotlight-vue@^0.3.0
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

到这里，普通前端开发者的接入工作已经结束。

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
| 关键多步流程 | Server LangGraph | 进入巡检视图后开始巡检、打开监控后全屏播放 |
| 页面状态 | `getUiContext` | 当前路由、选中对象、打开的面板 |

不要把 GIS、视频播放器或项目 Store 搬到 Server。Server 只知道 Tool 契约，具体页面动作仍由浏览器执行。

## 生产清单与信任边界

`vite build` 会输出：

```text
dist/spotlight-client-manifest.json
```

CI 部署时用 Server 提供的脚本发布它：

```bash
pnpm publish:client-manifest -- \
  ../dist/spotlight-client-manifest.json \
  "$SPOTLIGHT_CLIENT_MANIFEST_DIR"
```

脚本会按清单内容写入：

```text
${SPOTLIGHT_CLIENT_MANIFEST_DIR}/<projectId>/<frontendBuildId>.json
```

生产请求携带 `projectId`、`frontendBuildId` 和 `manifestDigest`。Server 会读取已发布清单并校验摘要；浏览器提交的临时 Tool 列表不会成为生产信任来源。开发环境可以直接使用浏览器构建清单，方便本地联调。

Server 读取可信清单后，将 Client Tool 转为真正的 LangChain Tool。模型调用该 Tool 时，执行请求通过现有浏览器 RPC 回到对应页面。LangChain 和 LangGraph 因此属于 Server 实现细节，不增加业务项目的接入成本。

## 从 0.2.x 迁移

`0.3.0` 是破坏性版本，不提供旧 Host/Capability 兼容层：

1. 把原 Capability handler 保留为普通业务函数。
2. 用 `defineClientTool` 包装需要暴露给 Spotlight 的函数。
3. 删除 `createSpotlightHost`、`defineSpotlightCapabilityHost`、`@agent` Registry 和前端 workflow glue。
4. 在 `defineSpotlightConfig` 中直接传入 `tools`。
5. 配置 Vite 插件并发布构建清单。

迁移原则很简单：项目只声明页面能力，SDK 负责协议，Server 负责编排。
