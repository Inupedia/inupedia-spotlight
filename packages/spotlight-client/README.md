# @inupedia/spotlight-client

Spotlight 的浏览器 Tool SDK。业务项目只需要用 `defineClientTool` 包装已有函数；Tool 名称、说明和 JSON Schema 在构建期自动生成。

```ts
import { defineClientTool } from "@inupedia/spotlight-client";

/** 按名称全屏播放指定监控视频。 */
export const playVideoFullscreen = defineClientTool(
  async ({ name }: { name: string }): Promise<void> => {
    await videoService.playFullscreen(name);
  },
);
```

Vite 项目必须启用构建插件：

```ts
import { spotlightClientTools } from "@inupedia/spotlight-client/vite";

spotlightClientTools({
  projectId: "my-project",
  frontendBuildId: process.env.GIT_SHA,
});
```

生产构建会输出 `spotlight-client-manifest.json`。Server 只信任 CI 发布、与前端 Build ID 绑定的清单，不信任浏览器临时声明的 Tool。

完整接入、显式 Schema 和生产部署见 [Client Tool 接入指南](../../docs/client-tools.md)。

Node-only 的 Skill 脚本执行器仍从 `@inupedia/spotlight-client/node` 导入。主入口不包含 Node API。
