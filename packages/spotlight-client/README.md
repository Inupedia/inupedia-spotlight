# @inupedia/spotlight-client

Spotlight **宿主侧执行层** + **Inupedia skills/service 标准**。

## Framework-neutral Host Core

`createSpotlightHostCore` 是任意 frontend 接入 Spotlight SaaS 的最小核心。它不依赖 Vue、DOM、Pinia、Cesium，也不要求项目提供 scene/tab。

```ts
import { createSpotlightHostCore } from "@inupedia/spotlight-client";

const hostCore = createSpotlightHostCore({
  actions: [
    {
      name: "ui.openSettings",
      displayName: "Open settings",
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
  onToolComplete(toolName, input, result) {
    telemetry.record(toolName, input, result);
  },
});

hostCore.listTools();
await hostCore.runTool("ui.openSettings", {});
hostCore.getUiContext();
```

Vanilla frontend 也可以直接用：

```ts
const unregister = hostCore.registerAction({
  name: "cart.checkout",
  description: "提交购物车",
  handler: async ({ cartId }) => checkout(String(cartId)),
});

unregister();
```

核心概念只有两类：

- `readables`：把当前 UI/业务状态以 `{ description, value }` 暴露给 Spotlight。
- `actions`：把 frontend 可执行动作以 `{ name, description, handler }` 暴露成 host tools。

ydjm 的 `ensureMainScene`、`ensureSmallTab`、Cesium scene 等能力不是 SDK 必填项。需要这类导航前置能力的项目，可以继续通过旧 `@agent` registry 兼容桥注入。

## Service 注入（单一 `@agent`）

在函数上方加一行 `@agent`；**scene / tab / host 由文件路径 + name 自动推断**。

```ts
// capabilities/panels/construction.ts
@agent({
  name: "panel.openCadViewer",
  description: "打开 CAD 图纸",
  rollback: () => store.setCadViewerVisible(false),
})
export async function openCadViewer() {
  store.setCadViewerVisible(true);
}
```

编译后等价于：

```ts
registerAgentCapability(
  resolveAgentMeta({ name: "panel.openCadViewer", ... }, "/…/construction.ts"),
  openCadViewer,
);
```

宿主 `vite.config.ts`：

```ts
import spotlightAgentIoc from "@inupedia/spotlight-client/vite";

export default defineConfig({
  plugins: [
    spotlightAgentIoc({
      agentPreset: "@/service/agent/presets/resolveAgentMeta",
    }),
  ],
});
```

TypeScript shim：`/// <reference types="@inupedia/spotlight-client/agent-decorator" />`

路径约定与 name 推断规则见 `src/service/agent/README.md`。

> 暂不支持运行时装饰器（esbuild 限制）；HOF 写法 `agent(meta)(fn)` 仍可用。

## 分工（Inupedia 标准）

| 注入 | 目录 | 作用 |
|------|------|------|
| **Skills** | `.inupedia/skills/<id>/` | 知识、流程、`allowed-tools` |
| **Service** | `src/service/agent/capabilities/` | 可执行 host tools（`@agent` IoC） |

Skills 布局与 [Agent Skills 开放标准](https://agentskills.io) 一致。

## Service 目录

```text
src/service/agent/
├── host.ts
├── capabilities/        # @agent + 函数体
├── actions/             # Vue / Cesium 复用
└── presets/
    └── resolveAgentMeta.ts
```

## API

```ts
registerAgentCapability / buildAgentServiceHost / loadAgentCapabilities
validateSkillFrontmatter / substituteSkillPlaceholders
```

校验：`pnpm validate:skills`

## Node-only runner

默认脚本执行器只给 Node 宿主使用：

```ts
import { createNodeSkillScriptRunner } from "@inupedia/spotlight-client/node";
```

浏览器宿主不要从主入口引入 Node runner；请通过 `registerSkillScriptTool`
传入自己的 `runScript` 实现。
