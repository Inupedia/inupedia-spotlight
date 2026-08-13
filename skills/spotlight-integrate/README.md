# Spotlight Integrate

把**已经写完的 Vue 3 + Vite 前端**蒸馏成 Spotlight 接入：Client Tools、业务 Skills、Vite 插件、Vue 插件、Project Pack。

业务仓库只声明「页面能做什么」。路由、知识检索、Action、Memory、SSE 全部在 Spotlight Server。不要在宿主里再写一套 Agent。

当前 SDK 以 npm 上的 `@inupedia/spotlight-vue` 版本为准（`npm view @inupedia/spotlight-vue version`）。Client / Vue / Protocol / Server 镜像必须同一 semver。

## 两种用法（二选一）

| | 给谁 | 做什么 |
|---|---|---|
| **A. Agent Skill** | Cursor / Codex / Claude Code | 把本目录拷进 skills 路径，在宿主仓库里说一句即可 |
| **B. 粘贴给任意 LLM** | ChatGPT、Claude、未装 skill 的 Cursor… | 跑下面的 bash，把输出整段贴进对话 |

人只需要确认三件事：`projectId`、Server 地址 / API key、稳定的登录用户 id（`getMemorySubjectId`）。不要用会轮换的 access token。

### A. 安装为 Agent Skill

把**整个目录**拷过去（不能只拷 `SKILL.md`）：

```text
~/.cursor/skills/spotlight-integrate/          # 本机 Cursor
<app>/.cursor/skills/spotlight-integrate/      # 只给这个仓库
<app>/.codex/skills/spotlight-integrate/
<app>/.claude/skills/spotlight-integrate/
```

然后在**宿主前端仓库**对 agent 说：

```
Use spotlight-integrate. Follow standard.md. Distill this app into Spotlight.
```

### B. Bash → 粘贴给大模型（推荐给没有 Skill 目录的环境）

在本目录执行：

```bash
./prompt.sh              # 打印完整提示词
./prompt.sh --copy       # 打印并复制到剪贴板（macOS / wl-clipboard / xclip）
./prompt.sh -o /tmp/spotlight-integrate.prompt.md
```

从 SDK 仓库根也可以：

```bash
bash skills/spotlight-integrate/prompt.sh --copy
```

把输出**原样**贴进正在打开宿主前端的 LLM 对话，并补一句：

```
上面是 spotlight-integrate skill pack。按 SKILL.md 流水线蒸馏当前这个 Vue 仓库。
先读 STANDARD 和 TESTING。不要抄例子里的工具名和目录以外的业务名词。
```

脚本会按固定顺序打出 `SKILL.md`、`standard.md`、`testing.md`、流水线、抽取器、模板。缺文件会直接失败，避免贴一份残包。

## 宿主会得到什么（新项目标准布局）

```text
<app>/
├── src/spotlight/config.ts              # defineSpotlightConfig
├── src/spotlight/tools.ts               # defineClientTool + spotlightTools
├── src/main.ts                          # app.use(SpotlightVue)
├── vite.config.ts                       # spotlightClientTools 插件
├── .env.example                         # 仅 VITE_SPOTLIGHT_*
├── .inupedia/skills/
│   ├── skill.knowledge/SKILL.md         # 必有，不调 Client Tool
│   └── skill.<domain>/SKILL.md
├── spotlight-project/                   # Server Project Pack
│   ├── spotlight.project.yml
│   ├── system-prompt.md
│   ├── ui-prompts.json
│   ├── .env.example
│   └── docker-compose.yml
└── .spotlight-integrate/                # 蒸馏过程（可 gitignore）
```

完整约定：[standard.md](standard.md)。测试：[testing.md](testing.md)。代码片段：[templates.md](templates.md)。形状示例（禁止照抄名字）：[examples.md](examples.md)。

### 已经接过 Spotlight 的仓库

不要为了「对齐标准路径」搬家。

- Tools 已在别的文件（例如 `src/project/agent/tools.ts`）→ **继续用那个文件**，Vite `include` 指向它。
- Config 已在 `src/service/spotlight.ts` / 仓库根 `spotlight.config.ts` → **继续用**，不要再生成第二份 `src/spotlight/config.ts`。
- `projectId` 已存在 → 四处保持同一个，不要另起一个。
- `videoChannels`、`quickPanelActions`、`catalogOverlay`、数字人 avatar 是**可选产品能力**，宿主没有对应 UI 就不要生成。

新项目用标准路径；旧项目只补缺的 Skills / 黄金问句 / Pack，不重构目录。

## 分工（不要写反）

| 放宿主 | 放 Server |
|---|---|
| `defineClientTool` 包装**已有**页面函数 | LangGraph 路由、Knowledge / Action |
| `.inupedia/skills/**/SKILL.md`（何时用哪个 Tool） | 知识库、联网搜索 Provider |
| `getUiContext`、稳定 `getMemorySubjectId` | Checkpointer / Store / Memory Gate |
| 地图、播放器、Pinia、Vue Router | `spotlight.project.yml` 里的 Provider |

硬规则：没有宿主导出函数就不是 Client Tool；Skill 的 `allowed-tools` 必须是已注册导出；「有哪些」走 `get*`，「查看 + 具体名称」走 `open*`/`play*`。

## 人要填的环境

前端 `<app>/.env`：

```bash
VITE_SPOTLIGHT_PROJECT_ID=<kebab-case>
VITE_SPOTLIGHT_SERVER_URL=/spotlight-api
VITE_SPOTLIGHT_API_KEY=local-dev-key
```

Vite 把 `/spotlight-api` 代理到 `http://127.0.0.1:8787`。

Server `spotlight-project/.env`：`SPOTLIGHT_API_KEYS`、Postgres、LLM、知识库、搜索。LLM key **不要**放进 `VITE_*`。

## 启动与验收

```bash
cd spotlight-project && docker compose up -d
curl -sfS http://127.0.0.1:8787/health
# 再启动 Vite，用 .spotlight-integrate/gold-questions.md 里的问句试命令栏
```

镜像 tag = npm 版本：`ghcr.io/inupedia/spotlight-server:<ver>`。

静态检查命令在 [testing.md](testing.md)：Skill 工具名 ⊆ 导出、`projectId` 四处一致、每个 list+open 域都有黄金问句。

## 本目录（给拷贝 / bash 打包用）

```text
spotlight-integrate/
├── prompt.sh                 # 打出可粘贴提示词
├── README.md                 # 本文件
├── SKILL.md                  # agent 入口与流水线
├── standard.md               # 安装、目录、命名、env、启动
├── testing.md                # 黄金问句与静态/live 检查
├── templates.md
├── examples.md
├── methodology/              # stage 0 → 5
└── extractors/
```

Agent 内部顺序：`standard.md` → `testing.md` → `SKILL.md` 流水线。`examples.md` 只说明形状。

## 手工接入（不跑蒸馏时）

仍可自己写 Tool / Skill，见仓库 [docs/client-tools.md](../../docs/client-tools.md) 与 [docs/server-deployment.md](../../docs/server-deployment.md)。本 skill 是「从现成前端生成那套文件」的自动化，不是另一套 API。
