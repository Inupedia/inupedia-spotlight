# Inupedia Spotlight

业务前端只声明**当前页面能做什么**。路由、知识检索、Action、Memory 和 SSE 都在 Spotlight Server。

面向 **Vue 3 + Vite**。新项目用 Agent Skill 蒸馏现成 UI，不要在宿主里再写一套 Agent。

```
宿主 Vue 应用                         Spotlight Server
─────────────────                    ─────────────────
defineClientTool  →  浏览器 RPC  →   LangGraph 路由
.inupedia/skills  →  随 Run 上报  →   Knowledge / Action
getUiContext / 用户 id                Checkpointer · Store · Memory Gate
地图 / 播放器 / Pinia 留在浏览器       知识库 · 联网搜索 Provider
```

| 你写 | SDK / Server 负责 |
| --- | --- |
| 包装已有页面函数为 Client Tool | 构建期推导 Tool 名、JSDoc、JSON Schema |
| 业务 Skill（何时用哪个 Tool） | Skill 路由、list ≠ open、确定性执行 |
| `projectId`、Server URL、稳定用户 id | 会话记忆、受控长期记忆、知识/搜索 |

当前版本以 npm 为准：`npm view @inupedia/spotlight-vue version`。`@inupedia/spotlight-*` 与 `ghcr.io/inupedia/spotlight-server:<ver>` 必须同一 semver。

## 新项目：让 Agent 接入

Skill 包：[skills/spotlight-integrate](skills/spotlight-integrate/README.md)。人只确认 `projectId`、Server 地址 / API key、稳定登录用户 id（不要用会轮换的 token）。

**A. 装进 Cursor / Codex / Claude Code**

把整个 `skills/spotlight-integrate/` 拷到 skills 目录（不能只拷 `SKILL.md`），在宿主仓库说：

```
Use spotlight-integrate. Follow standard.md. Distill this app into Spotlight.
```

**B. 贴给任意大模型**

```bash
bash skills/spotlight-integrate/prompt.sh --copy
```

把剪贴板贴进**已经打开宿主前端**的对话。脚本会打出标准、测试、流水线和模板；缺文件会失败。

非 Vue 3 宿主会在 stage 0 停止（例如 React）。已接过 Spotlight 的仓库就地扩展，不搬家、不另起 `projectId`。

约定与验收：[standard.md](skills/spotlight-integrate/standard.md) · [testing.md](skills/spotlight-integrate/testing.md)

## 手工接入

自己写 Tool / Skill 时从这里开始：

- [Client Tool / Skill 接入指南](docs/client-tools.md)
- [Server 部署与 Project Pack](docs/server-deployment.md)
- 包一览：[packages/README.md](packages/README.md)

最小形状：

```ts
/** 按名称打开已有资源。 */
export const openItem = defineClientTool(
  async ({ name }: { name: string }): Promise<void> => {
    await existingOpen(name);
  },
);
```

```ts
app.use(SpotlightVue, { config, enabled: true });
```

## Packages

| Package | 职责 |
| --- | --- |
| `@inupedia/spotlight-protocol` | Client / Server 共享协议 |
| `@inupedia/spotlight-client` | `defineClientTool`、HTTP、Vite 清单 |
| `@inupedia/spotlight-vue` | Vue 插件、命令栏、随 Run 上报 Skill |
| `@inupedia/spotlight-memory` | Pack Memory Gate（精确 / 语义缓存） |
| `@inupedia/spotlight-server` | LangGraph Agent Server（路由、Knowledge、Action、记忆） |

会话记忆：LangGraph Checkpointer（`projectId + sessionId`）。跨会话长期记忆还要浏览器提供稳定 `memorySubjectId`；没有该值时拒绝「记住」，不会退化成项目级共享记忆。

## 开发与发布

```bash
pnpm install
pnpm test
pnpm build
```

1. Push tag，例如 `v0.5.16`。
2. GitHub Actions 对齐所有 package 版本、跑测试、发布 npm（`NPM_TOKEN`）。
3. Server 镜像：`ghcr.io/inupedia/spotlight-server:<ver>`。

仓库变量 `NPM_PUBLISH_ACCESS` 设为 `public` 或 `restricted`。Node-only 能力必须走 `/node` 子入口，不能进浏览器主包。
