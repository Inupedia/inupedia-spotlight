# Inupedia Spotlight

Private source repository for the Inupedia Spotlight SDK packages.

## Packages

| Package | Role |
| --- | --- |
| `@inupedia/spotlight-protocol` | Shared client/server wire types |
| `@inupedia/spotlight-memory` | 兼容期数据与类型工具；0.5.0 Agent Memory 由 LangGraph Store/Checkpointer 负责 |
| `@inupedia/spotlight-client` | Client Tool、HTTP 与构建清单 |
| `@inupedia/spotlight-vue` | Vue plugin、命令 UI 与远程运行管线 |
| `@inupedia/spotlight-server` | 可部署的 LangChain/LangGraph Agent Server |

业务项目从 [Client Tool 接入指南](docs/client-tools.md) 开始，部署人员阅读 [Server 部署与 Project Pack](docs/server-deployment.md)。`0.5.0` 起，前端只注册 Tool；路由、Knowledge Agent、Action Agent、Provider 与 Memory 全部属于 Server。

## Release

1. Push a tag like `v0.1.0`.
2. GitHub Actions aligns all package versions.
3. CI builds and tests all packages.
4. Packages are published to npm with `NPM_TOKEN`.

Set repository variable `NPM_PUBLISH_ACCESS` to `public` or `restricted`.
