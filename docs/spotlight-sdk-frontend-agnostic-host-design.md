# Spotlight Frontend-Agnostic SDK Host 设计文档

## 1. 摘要

目标：借鉴 CopilotKit 的 `Core + framework adapter + runtime` 分层，把 Spotlight 前端接入从“复制 ydjm 项目胶水代码”改造成“任何 frontend 注入 capabilities/readable/actions/workflows 即可接入 Spotlight SaaS”。

第一阶段不替换 `spotlight-server`，不改变现有 wire protocol，不引入 CopilotKit 运行时，只吸收它成熟的架构模式：

- `@inupedia/spotlight-client` 新增 framework-neutral host core。
- `@inupedia/spotlight-vue` 只做 Vue 适配和 UI/runtime pipeline。
- ydjm 项目迁移到新 host composer，证明 `src/project/agent/createSpotlightHost.ts` 明显变薄。
- 后续可扩展 React、Vanilla、Angular、Web Components，不再被 Vue/Cesium/Tab 模型绑死。

## 2. 当前问题

当前项目接入 Spotlight 需要理解并手动拼接 `loadAgentCapabilities`、`buildAgentServiceHost`、`listTools`、`runTool`、`defineSpotlightApp`、`operate`、`sessionControl`、`getUiContext`、`videoChannels`、`uiPromptsFallback`、telemetry/log store、skill glob 等内部装配细节。

这些不是 Spotlight SaaS 使用项目应该背的锅。使用项目应该只声明自己的 capabilities、actions、readable context、metadata、workflows。

`src/project/agent/createSpotlightHost.ts` 当前混合了三类东西：

- 通用 Spotlight host 装配。
- ydjm 的 Cesium / 场景 / Tab / 视频 / 隧洞巡检业务逻辑。
- telemetry、meta、workflow 的 glue code。

这会让其它项目误以为必须提供 `getContext`、`ensureMainScene`、`ensureMidScene`、`ensureSmallScene`、`ensureMainTab`、`ensureSmallTab`。但这些只是 ydjm 项目的 host capabilities，不是 Spotlight SDK 核心概念。

## 3. 借鉴 CopilotKit 的架构点

CopilotKit 的关键不是 React UI，而是三层模型：

```text
Frontend Adapter -> Core -> Runtime -> Agent
```

对应 Spotlight：

```text
Frontend Adapter -> Spotlight Host Core -> spotlight-server SaaS runtime -> skills/tools/Yuxi/memory
```

借鉴点：

- framework-neutral core 管理 actions、context、subscribers。
- React/Vue/Angular 只是 adapter，不承载核心 host 逻辑。
- readable context 是 `{ description, value }` 形式，可注册、移除、按 agent/project 过滤。
- frontend action 是 `{ name, description, input, handler, available }` 形式。
- runtime 与 frontend 通过现有 event/tool call 模型连接。
- debug/inspector 基于 core events，而不是散落在业务项目里。

不借鉴点：

- 不引入 CopilotKit Runtime 替换 `spotlight-server`。
- 不强制使用 AG-UI 作为第一阶段 wire protocol。
- 不替换现有 Vue UI、thinking pipeline、Live2D。
- 不把 ydjm 的项目能力放进 SDK。

## 4. 设计目标

必须达成：

- 任意 frontend 都能接入 Spotlight SaaS，不要求 Vue。
- SDK 核心能力放在 `@inupedia/spotlight-client`。
- Vue 只提供 `@inupedia/spotlight-vue` adapter。
- 使用项目只需要注入自己的 capabilities、actions、readable context、metadata、workflows。
- ydjm 项目迁移后，`createSpotlightHost.ts` 只保留项目配置和业务差异。
- 现有 `spotlight-server` 行为不变。
- 现有 tools / skills 注册方式兼容。
- 新增 API 有测试覆盖，迁移后现有 Spotlight 单测通过。

非目标：

- 不重写 `runSpotlightTurn`。
- 不引入 CopilotKit 依赖。
- 不做 AG-UI endpoint。
- 不做 React/Angular adapter。
- 不重做 UI、skill pack、memory。
- 不改变 npm 包名。

## 5. 核心架构

```text
packages/spotlight-client
  ├─ HostCore
  ├─ ActionRegistry
  ├─ ReadableContextStore
  ├─ HostToolManifest
  ├─ HostToolRunner
  └─ framework-neutral subscribers/debug events

packages/spotlight-vue
  ├─ Vue composables
  ├─ defineSpotlightCapabilityHost
  ├─ existing SpotlightVue plugin
  └─ existing remote pipeline/UI

host project
  ├─ declares actions/tools
  ├─ declares readable context
  ├─ declares workflows
  ├─ declares skills
  └─ declares project metadata
```

数据流：

```text
Host app registers readable/actions
          ↓
SpotlightHostCore stores manifest + context
          ↓
Vue/other adapter passes host registration into Spotlight config
          ↓
spotlight-server creates run and emits host_action_request
          ↓
HostCore executes matching action/tool handler
          ↓
Result returned to spotlight-server
          ↓
SSE/tool_result updates UI
```

ydjm 是一个 host app 示例，不是 SDK 抽象来源。ydjm 的 Cesium scene tools、tunnel patrol workflows、video monitoring metadata、progress panel quick actions、project-specific readable context 都通过通用 host core 注入。

## 6. Public API

`@inupedia/spotlight-client`：

```ts
export type SpotlightReadableContext = {
  id?: string;
  description: string;
  value: unknown | (() => unknown);
  available?: boolean | (() => boolean);
  scope?: {
    agentId?: string;
    projectId?: string;
  };
};

export type SpotlightFrontendAction<TInput extends Record<string, unknown> = Record<string, unknown>> = {
  name: string;
  displayName?: string;
  description: string;
  input?: Record<string, ToolFieldSchema>;
  handler: (input: TInput, context: SpotlightActionContext) => Promise<unknown> | unknown;
  available?: boolean | (() => boolean);
  exposeToLoop?: boolean;
  executionMode?: "serial" | "parallel-safe";
};

export type SpotlightHostCore = {
  registerAction(action: SpotlightFrontendAction): () => void;
  registerReadable(readable: SpotlightReadableContext): () => void;
  listTools(): SpotlightHostTool[];
  runTool(name: string, input: Record<string, unknown>): Promise<ToolResult<unknown>>;
  getUiContext(): Record<string, unknown>;
  subscribe(subscriber: SpotlightHostCoreSubscriber): () => void;
};
```

`@inupedia/spotlight-vue`：

```ts
export function useSpotlightReadable(readable: SpotlightReadableContext): void;

export function useSpotlightAction<TInput extends Record<string, unknown>>(
  action: SpotlightFrontendAction<TInput>,
): void;

export function defineSpotlightCapabilityHost(
  options: DefineSpotlightCapabilityHostOptions,
): SpotlightHostFactory;
```

## 7. 修改前后对比

修改前，项目需要自己拼装 registry、executor、host factory：

```ts
loadAgentCapabilities(capabilityModules);
initAgentRuntime();

export const { listTools, getToolExecutionTarget, runTool } =
  buildAgentServiceHost({
    getContext,
    ensureMainScene,
    ensureMidScene,
    ensureSmallScene,
    ensureMainTab,
    ensureSmallTab,
    onToolComplete,
  });
```

修改后，项目只声明能力：

```ts
export const createProjectSpotlightHost = defineSpotlightCapabilityHost({
  capabilities: {
    modules: capabilityModules,
    exclude: /\/(_|\.test\.|\.spec\.|\/_examples\/)/,
  },
  readables: [
    {
      description: "当前项目 UI 上下文",
      value: () => getContext(),
    },
  ],
  workflows: {
    operate: createYdjmOperateWorkflow(),
    sessionControl: createTunnelPatrolSessionHooks,
  },
  metadata: {
    uiPromptsFallback: fallbackUiPrompts,
    videoChannels: fallbackVideoChannels,
    onVideoChannelsLoaded: syncVideoChannelsFromMeta,
    quickPanelActions: () => createSpotlightQuickPanelActions(),
  },
  telemetry: {
    onToolComplete: recordSpotlightToolComplete,
  },
});
```

收益：

- SDK 负责装配 host manifest 和 runner。
- 项目只声明 capabilities/readables/workflows/metadata。
- 没有 `ensureMainScene` 等固定概念。
- 未来其它 frontend 可以直接用 `createSpotlightHostCore`。

## 8. Sprint 拆分

### Sprint 0：Workspace 与基线确认

- 调整根 workspace，让 `packages/*` 可被根命令识别。
- 不改变 npm 发布源；仍从 `/Users/inupedia/Side Projects/inupedia-spotlight` 发布。
- 记录当前测试基线，包括可能存在的 dependency/node_modules 问题。

Check：

```bash
pnpm --filter @inupedia/spotlight-client test
pnpm --filter @inupedia/spotlight-vue typecheck
pnpm test:run tests/unit/spotlight.store.test.ts tests/unit/spotlight.defineHost.test.ts tests/unit/spotlight.command-catalog-merge.test.ts tests/unit/spotlight.skill-execution.test.ts tests/unit/spotlight.agent-capability.test.ts
```

### Sprint 1：`spotlight-client` Host Core

- 新增 `createSpotlightHostCore`。
- 新增 readable context store。
- 新增 action registry。
- 支持 unregister cleanup、`available`、telemetry hook、`listTools`、`runTool`、`getUiContext`。
- 不依赖 Vue、DOM、Pinia。

### Sprint 2：`spotlight-vue` Adapter

- 新增 `useSpotlightReadable`。
- 新增 `useSpotlightAction`。
- 新增 `defineSpotlightCapabilityHost`。
- `defineSpotlightCapabilityHost` 内部创建或接收 `SpotlightHostCore`。
- 保留 `defineSpotlightHost` 兼容旧 API。

### Sprint 3：ydjm 项目迁移

- 将 `src/project/agent/createSpotlightHost.ts` 改为使用 `defineSpotlightCapabilityHost`。
- 保留 ydjm 专属逻辑：tunnel context validation、video monitoring resolve/verify、progress quick actions、telemetry、fallback UI prompts/video channels。
- 不改业务 tool handler，不改 `spotlight-server`。

### Sprint 4：文档与接入模板

- 更新 `packages/README.md`。
- 更新 `packages/spotlight-client/README.md`。
- 更新 `packages/spotlight-vue/README.md`。
- 新增 ydjm 迁移说明：哪些是项目能力，哪些是 SDK 通用能力，不要复制 ydjm 的 scene/tab 模型。

### Sprint 5：检查与稳定化

最终检查：

- 新项目最小接入代码不超过一个 config 文件 + 可选 composables。
- 不需要复制 `src/service/agent`。
- 不需要提供 scene/tab/Cesium。
- SDK core 可被非 Vue 环境使用。
- Vue adapter 只负责生命周期绑定。
- ydjm 原功能不回归。

## 9. 测试策略

`spotlight-client`：

- host core action registration
- host core readable context
- unregister cleanup
- tool execution success/failure
- telemetry callback
- availability filtering
- no DOM dependency

`spotlight-vue`：

- composable lifecycle registration
- host factory composition
- metadata passthrough
- workflow passthrough
- old API compatibility

ydjm：

- project host factory output compatibility
- existing Spotlight store tests
- existing capability tests
- existing skill execution tests

## 10. 成功验收标准

- `@inupedia/spotlight-client` 可独立提供 host core。
- `@inupedia/spotlight-vue` 使用 host core，不重新实现核心 registry。
- ydjm 的 `createProjectSpotlightHost` 不再暴露 SDK 装配细节。
- 任意项目无需 scene/tab/Cesium 即可接入。
- 新 API 有 README 示例。
- 新 API 有单测。
- 现有 Spotlight 前端单测通过。
- `spotlight-server` 没有行为变化。
- 后续可以在此基础上加 AG-UI compatibility adapter。

## 11. 风险与处理

- 与现有 registry 重叠：第一阶段复用现有 registry/executor，不重写底层执行器。
- API 过度设计：只支持 action、readable、metadata、workflow 四类注入。
- ydjm 迁移引发回归：先加 host factory output 测试，再迁移；迁移过程中不改业务 tool handler。
- workspace 依赖状态混乱：Sprint 0 单独处理和记录，不把环境修复和 SDK API 行为混为一谈。
- 后续任意 frontend 仍不方便：core API 不依赖 Vue；Vue composables 只是薄适配。

## 12. 后续路线

- `@inupedia/spotlight-client/agui` adapter。
- `spotlight-server` 输出 AG-UI-compatible event stream。
- React/Vanilla adapter。
- debug inspector。
- project pack contract validation。
- `runSpotlightTurn` pipeline 拆分。
- host action permission policy 收紧。

## 13. 默认决策

- 通用 core 放在 `packages/spotlight-client`。
- 不新建 `spotlight-core` 包。
- `spotlight-vue` 只做 Vue adapter。
- 第一阶段不改 `spotlight-server` 行为。
- 第一阶段不引入 CopilotKit 依赖。
- 第一阶段不做 AG-UI endpoint。
