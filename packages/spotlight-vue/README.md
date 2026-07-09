# @inupedia/spotlight-vue

Vue adapter + UI shell for Inupedia Spotlight.

核心 host 逻辑在 `@inupedia/spotlight-client`，Vue 包只负责：

- `SpotlightVue` plugin 和 UI/runtime pipeline。
- `defineSpotlightCapabilityHost` 组合 host core、skills、workflows、metadata。
- `useSpotlightAction` / `useSpotlightReadable` 绑定 Vue scope 生命周期。

## Vue host config

```ts
import {
  defineSpotlightConfig,
  defineSpotlightCapabilityHost,
  readSpotlightEnv,
} from "@inupedia/spotlight-vue";

const skillModules = import.meta.glob<string>(
  "../.inupedia/skills/**/SKILL.md",
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

```ts
import { createApp } from "vue";
import { SpotlightVue } from "@inupedia/spotlight-vue";
import spotlightConfig from "./spotlight.config";

createApp(App).use(SpotlightVue, {
  config: spotlightConfig,
  enabled: true,
});
```

## Composables

```ts
import {
  useSpotlightAction,
  useSpotlightReadable,
} from "@inupedia/spotlight-vue";

useSpotlightReadable({
  id: "selectedInvoice",
  description: "当前选中的发票",
  value: () => selectedInvoice.value,
});

useSpotlightAction({
  name: "invoice.approve",
  description: "审批当前发票",
  input: {
    invoiceId: { type: "string", description: "发票 ID" },
  },
  handler: ({ invoiceId }) => approveInvoice(String(invoiceId)),
});
```

这些注册会在当前 Vue scope dispose 时自动清理。

## Legacy capabilities

已有 `@agent` capability 项目可以继续接入：

```ts
const capabilityModules = import.meta.glob(
  "./service/agent/capabilities/**/*.ts",
  { eager: true },
);

export const host = defineSpotlightCapabilityHost({
  capabilities: {
    modules: capabilityModules,
    exclude: /\/(_|\.test\.|\.spec\.|\/_examples\/)/,
    executor: {
      getContext: () => getUiContext(),
      ensureMainScene: () => ensureMainScene(),
    },
  },
});
```

`executor` 是项目自己的能力注入。普通 frontend 不需要 scene/tab/Cesium，也不应该复制 ydjm 的业务模型。
