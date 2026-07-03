# Inupedia Spotlight

Private source repository for the Inupedia Spotlight SDK packages.

## Packages

| Package | Role |
| --- | --- |
| `@inupedia/spotlight-protocol` | Shared client/server wire types |
| `@inupedia/spotlight-client` | HTTP helpers, host tool bridge, agent registry |
| `@inupedia/spotlight-vue` | Vue plugin, command UI, Spotlight workflow runtime |

## Release

1. Push a tag like `v0.1.0`.
2. GitHub Actions aligns all package versions.
3. CI builds and tests all packages.
4. Packages are published to npm with `NPM_TOKEN`.

Set repository variable `NPM_PUBLISH_ACCESS` to `public` or `restricted`.
