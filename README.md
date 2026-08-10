# Inupedia Spotlight

Private source repository for the Inupedia Spotlight SDK packages.

## Packages

| Package | Role |
| --- | --- |
| `@inupedia/spotlight-protocol` | Shared client/server wire types |
| `@inupedia/spotlight-memory` | Memory Gate, exact/semantic cache stores |
| `@inupedia/spotlight-client` | Client Tool、HTTP 与构建清单 |
| `@inupedia/spotlight-vue` | Vue plugin、命令 UI 与远程运行管线 |

业务项目从 [Client Tool 接入指南](docs/client-tools.md) 开始。`0.4.0` 起，前端只注册 Tool；LangChain Tool 与 LangGraph 工作流属于 Server 实现。

## Release

1. Push a tag like `v0.1.0`.
2. GitHub Actions aligns all package versions.
3. CI builds and tests all packages.
4. Packages are published to npm with `NPM_TOKEN`.

Set repository variable `NPM_PUBLISH_ACCESS` to `public` or `restricted`.
